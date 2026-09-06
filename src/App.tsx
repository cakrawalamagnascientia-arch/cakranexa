import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { INITIAL_BOOKS } from './data/booksData';
import { Book, CartItem, Order, ActivePage, SubSection, BookCategory, SeoSettings, SiteContentSettings } from './types';
import { apiClient, ApiError } from './services/apiClient';
import { parseLocation, pushRoute, RouteState } from './utils/router';
import { AdminLoginGate } from './components/AdminLoginGate';
import { useSeoMetadata } from './hooks/useSeoMetadata';
import { getStoredSeoSettings, fetchSeoSettingsApi } from './services/seoService';
import { getStoredSiteContent, saveStoredSiteContent, fetchSiteContentApi, saveSiteContentApi } from './services/siteContentService';
import { initTracking, trackPageView, trackViewContent, trackAddToCart } from './services/trackingService';
import { toTitleCase } from './utils/formatters';

// Components
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { BestSellerTicker } from './components/BestSellerTicker';
import { BookGrid } from './components/BookGrid';
import { BookDetailView } from './components/BookDetailView';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { CheckoutForm } from './components/CheckoutForm';
import { AdminDashboard } from './components/AdminDashboard';
import { PenerbitanView } from './components/PenerbitanView';
import { PelatihanView } from './components/PelatihanView';
import { JurnalView } from './components/JurnalView';
import { TentangKamiView } from './components/TentangKamiView';
import { BlogView } from './components/BlogView';
import { CareerView } from './components/CareerView';
import { KontakView } from './components/KontakView';
import { QuickSearchModal } from './components/QuickSearchModal';
import { BookCarousel } from './components/BookCarousel';
import { PublisherShowcase } from './components/PublisherShowcase';
import { Footer } from './components/Footer';
import { ScrollReveal } from './components/ScrollReveal';
import { ScrollProgress } from './components/ScrollProgress';
import { isAdminAuthenticated } from './services/adminAuth';

/** Mengubah baris Supabase (snake_case + order_items) atau objek in-memory server menjadi Order frontend */
function mapServerOrder(r: any, books: Book[]): Order {
  if (r.orderNumber) return r as Order; // sudah berbentuk Order (in-memory server)
  const items: CartItem[] = (r.order_items || []).map((it: any) => {
    const book = books.find((b) => b.id === it.book_id) || ({ id: it.book_id, name: it.book_id, harga: Number(it.unit_price) } as Book);
    return { book: { ...book, harga: Number(it.unit_price) || book.harga }, quantity: Number(it.quantity) || 1 };
  });
  const [address = '', rest = ''] = String(r.shipping_address || '').split(/,\s*(?=[^,]*$)/);
  return {
    id: r.id,
    orderNumber: r.order_id,
    items,
    subtotal: Number(r.total_amount) - Number(r.shipping_fee || 0),
    shippingCost: Number(r.shipping_fee || 0),
    total: Number(r.total_amount),
    customer: {
      name: r.customer_name,
      email: r.customer_email,
      phone: r.customer_phone,
      address,
      province: '',
      city: rest.replace(/\s*\(.*\)$/, ''),
      district: '',
      postalCode: (rest.match(/\((\d+)\)/) || [])[1] || '',
      courier: String(r.courier || '').split(' - ')[0],
      shippingService: String(r.courier || '').split(' - ')[1],
      notes: r.customer_notes || undefined
    },
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    vaNumber: r.va_number || undefined,
    trackingNumber: r.tracking_number || undefined,
    paymentProofUrl: r.payment_proof_url || undefined,
    createdAt: r.created_at,
    serverSynced: true
  };
}

export default function App() {
  // 1. Persistent Book Inventory State
  const [books, setBooks] = useState<Book[]>(() => {
    try {
      const saved = localStorage.getItem('cakranexa_books_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((b: any) => ({
            ...b,
            name: toTitleCase(b.name || ''),
            title: toTitleCase(b.title || b.name || '')
          }));
        }
      }
    } catch {
      // fallback to initial
    }
    return INITIAL_BOOKS;
  });

  // Dynamic CMS Site Content (Homepage sections, ticker, menus, footer, contacts)
  const [siteContent, setSiteContent] = useState<SiteContentSettings>(getStoredSiteContent);

  // Sync CMS Site Content from Supabase API on mount
  useEffect(() => {
    let isMounted = true;
    fetchSiteContentApi().then((remoteContent) => {
      if (isMounted && remoteContent) {
        setSiteContent(remoteContent);
        saveStoredSiteContent(remoteContent);
      }
    }).catch((err) => {
      console.warn('Silent CMS sync notice:', err);
    });

    const handleContentUpdated = (e: CustomEvent<SiteContentSettings>) => {
      if (e.detail) {
        setSiteContent(e.detail);
      }
    };
    window.addEventListener('cakranexa_site_content_updated', handleContentUpdated as EventListener);
    window.addEventListener('cakranexa_content_updated', handleContentUpdated as EventListener);
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cakranexa_site_content_settings' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setSiteContent(parsed);
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      isMounted = false;
      window.removeEventListener('cakranexa_site_content_updated', handleContentUpdated as EventListener);
      window.removeEventListener('cakranexa_content_updated', handleContentUpdated as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleUpdateSiteContent = (newContent: SiteContentSettings) => {
    setSiteContent(newContent);
    saveStoredSiteContent(newContent);
    saveSiteContentApi(newContent).catch((err) => {
      showNotification(err instanceof ApiError ? `Konten CMS tersimpan lokal, sinkron server gagal: ${err.message}` : 'Konten CMS tersimpan lokal (backend offline).');
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem('cakranexa_books_v1', JSON.stringify(books));
    } catch {
      // ignore storage limits
    }
  }, [books]);

  // Sync catalog from decoupled API / Supabase on mount
  useEffect(() => {
    let isMounted = true;
    apiClient.getBooks().then((remoteBooks) => {
      if (isMounted && remoteBooks && remoteBooks.length > 0) {
        // Backend/Supabase adalah sumber kebenaran katalog; cache lokal hanya untuk first paint.
        setBooks(remoteBooks.map((b) => ({
          ...b,
          name: toTitleCase(b.name || ''),
          title: toTitleCase(b.title || b.name || '')
        })));
      }
    }).catch((err) => {
      console.warn('Silent API catalog sync fallback:', err);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Persistent Shopping Cart State
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('cakranexa_cart_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('cakranexa_cart_v1', JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

  // 3. Persistent Orders History
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('cakranexa_orders_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Muat riwayat pesanan dari server (Supabase) saat admin login
  useEffect(() => {
    const load = async () => {
      if (!isAdminAuthenticated()) return;
      try {
        const rows = await apiClient.getOrders();
        const mapped: Order[] = rows.map((r: any) => mapServerOrder(r, books));
        setOrders((prev) => {
          const byNumber = new Map(prev.map((o) => [o.orderNumber, o]));
          mapped.forEach((o) => byNumber.set(o.orderNumber, { ...(byNumber.get(o.orderNumber) || {}), ...o }));
          return [...byNumber.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        });
      } catch (err) {
        console.warn('Gagal memuat pesanan dari server:', err);
      }
    };
    load();
    window.addEventListener('cakranexa_admin_auth_changed', load);
    return () => window.removeEventListener('cakranexa_admin_auth_changed', load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books.length]);

  useEffect(() => {
    try {
      localStorage.setItem('cakranexa_orders_v1', JSON.stringify(orders));
    } catch {
      // ignore
    }
  }, [orders]);

  // 4. Navigation & View Routing State
  const initialRoute = React.useMemo<RouteState>(() => (typeof window !== 'undefined' ? parseLocation() : { page: 'beranda' }), []);
  const [activePage, setActivePage] = useState<ActivePage>(initialRoute.page);
  const [activeSubSection, setActiveSubSection] = useState<SubSection>(initialRoute.subSection);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  // Slug buku dari URL (/katalog/<slug>) yang belum bisa di-resolve sebelum katalog termuat
  const [pendingBookSlug, setPendingBookSlug] = useState<string | null>(initialRoute.bookSlug || null);

  // 4b. Step-by-Step Navigation History Stack
  const [navHistory, setNavHistory] = useState<Array<{
    page: ActivePage;
    subSection?: SubSection;
    selectedBookId?: string | null;
    catalogCategory?: string;
    catalogSearch?: string;
  }>>([]);

  // 5. Catalog Search & Filter State
  const [catalogCategory, setCatalogCategory] = useState<string>(initialRoute.category || 'all');
  const [catalogSearch, setCatalogSearch] = useState<string>(initialRoute.search || '');

  // Resolve /katalog/<slug> setelah katalog tersedia (dari cache atau server)
  useEffect(() => {
    if (!pendingBookSlug) return;
    const found = books.find((b) => b.slug === pendingBookSlug || b.id === pendingBookSlug);
    if (found) {
      setSelectedBook(found);
      setActivePage('katalog');
      setPendingBookSlug(null);
    }
  }, [pendingBookSlug, books]);

  // Sinkronkan state -> URL (History API) agar bisa di-refresh, dibagikan, dan di-crawl
  useEffect(() => {
    if (pendingBookSlug) return; // tunggu resolve
    pushRoute({
      page: activePage,
      subSection: activeSubSection,
      bookSlug: activePage === 'katalog' && selectedBook ? selectedBook.slug || selectedBook.id : null,
      category: activePage === 'katalog' && !selectedBook ? catalogCategory : undefined,
      search: activePage === 'katalog' && !selectedBook ? catalogSearch : undefined
    }, activePage === 'katalog' && !selectedBook && (catalogSearch !== '' || catalogCategory !== 'all'));
  }, [activePage, activeSubSection, selectedBook, catalogCategory, catalogSearch, pendingBookSlug]);

  // Tombol Back/Forward browser
  useEffect(() => {
    const onPopState = () => {
      const route = parseLocation();
      setActivePage(route.page);
      setActiveSubSection(route.subSection);
      setCatalogCategory(route.category || 'all');
      setCatalogSearch(route.search || '');
      if (route.bookSlug) {
        const found = books.find((b) => b.slug === route.bookSlug || b.id === route.bookSlug);
        if (found) setSelectedBook(found);
        else setPendingBookSlug(route.bookSlug);
      } else {
        setSelectedBook(null);
      }
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [books]);
  const [homeCategoryPreview, setHomeCategoryPreview] = useState<string>('all');

  // Universal Back 1 Step handler across all views
  const handleGoBack = () => {
    if (navHistory.length > 0) {
      const prev = navHistory[navHistory.length - 1];
      setNavHistory((prevHistory) => prevHistory.slice(0, -1));
      setActivePage(prev.page);
      setActiveSubSection(prev.subSection);
      if (prev.selectedBookId) {
        const found = books.find((b) => b.id === prev.selectedBookId);
        setSelectedBook(found || null);
      } else {
        setSelectedBook(null);
      }
      if (prev.catalogCategory) {
        setCatalogCategory(prev.catalogCategory);
      }
      if (prev.catalogSearch !== undefined) {
        setCatalogSearch(prev.catalogSearch);
      }
    } else {
      // Fallback if no prior history was tracked yet
      if (selectedBook) {
        setSelectedBook(null);
        setActivePage('katalog');
      } else if (activePage !== 'beranda' && activePage !== 'home') {
        setActivePage('beranda');
        setActiveSubSection(undefined);
        setSelectedBook(null);
      } else {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back();
        }
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 6. Drawer & Modals State
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [directBookBuy, setDirectBookBuy] = useState<CartItem | null>(null);
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);

  // 7. Dynamic SEO Settings & Schema Management
  const [seoSettings, setSeoSettings] = useState<SeoSettings>(getStoredSeoSettings);

  // Ambil pengaturan SEO dari server saat mount (agar konsisten antar perangkat)
  useEffect(() => {
    let mounted = true;
    fetchSeoSettingsApi().then((remote) => {
      if (mounted && remote) setSeoSettings(remote);
    }).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize and keep tracking scripts up-to-date
  useEffect(() => {
    initTracking(seoSettings);

    const handleSeoUpdated = (e: CustomEvent<SeoSettings>) => {
      if (e.detail) {
        setSeoSettings(e.detail);
        initTracking(e.detail);
      }
    };

    window.addEventListener('cakranexa_seo_settings_updated', handleSeoUpdated as EventListener);
    return () => {
      window.removeEventListener('cakranexa_seo_settings_updated', handleSeoUpdated as EventListener);
    };
  }, [seoSettings]);

  // Track Page Views across single-page navigation
  useEffect(() => {
    const pageTitles: Record<string, string> = {
      beranda: 'Beranda | PT CAKRAWALA MAGNA SCIENTIA',
      home: 'Beranda | PT CAKRAWALA MAGNA SCIENTIA',
      katalog: selectedBook ? `${toTitleCase(selectedBook.title || selectedBook.name)} | Katalog Buku` : 'Katalog Buku Akademik & Monograf',
      penerbitan: 'Layanan Penerbitan Buku & Prosiding',
      pelatihan: 'Layanan Pelatihan & Workshop Akademik',
      jurnal: 'Publikasi Jurnal Ilmiah Bereputasi',
      'tentang-kami': 'Tentang Kami - Profil Penerbit',
      blog: 'Wawasan & Artikel Akademik',
      karir: 'Karir & Kontributor Naskah',
      kontak: 'Hubungi Kami - PT CAKRAWALA MAGNA SCIENTIA',
      admin: 'Admin Portal & Pengaturan',
      checkout: 'Checkout & Konfirmasi Pemesanan'
    };

    const title = pageTitles[activePage] || 'PT CAKRAWALA MAGNA SCIENTIA';
    const pageUrl = window.location.origin + window.location.pathname + window.location.search;
    trackPageView(pageUrl, title);
  }, [activePage, selectedBook]);

  // Apply dynamic Open Graph, meta tags, and Book Schema JSON-LD on route/book change
  useSeoMetadata({
    activePage,
    selectedBook,
    subSection: activeSubSection,
    seoSettings
  });

  // Global Notification Toast
  const [toast, setToast] = useState<string | null>(null);

  const showNotification = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Scroll to top upon page navigation
  const navigateTo = (page: ActivePage, subSection?: SubSection) => {
    if (page !== activePage || subSection !== activeSubSection || selectedBook !== null) {
      setNavHistory((prev) => [
        ...prev,
        {
          page: activePage,
          subSection: activeSubSection,
          selectedBookId: selectedBook ? selectedBook.id : null,
          catalogCategory,
          catalogSearch
        }
      ]);
    }
    setActivePage(page);
    setActiveSubSection(subSection);
    if (page !== 'katalog') {
      setSelectedBook(null);
    }
    // Handle category preset if navigating from dropdown
    if (subSection && ['Perpajakan', 'Akuntansi', 'Hukum', 'Ekonomi & Bisnis', 'Filsafat', 'Teologia'].includes(subSection as string)) {
      setCatalogCategory(subSection as string);
    } else if (page === 'katalog' && (!subSection || (subSection as string) === 'all')) {
      setCatalogCategory('all');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cart operations
  const handleAddToCart = (book: Book, quantity: number = 1) => {
    if (!(Number(book.harga) > 0)) {
      showNotification(`"${toTitleCase(book.title || book.name)}" segera terbit — harga belum ditetapkan.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.book.id === book.id);
      if (existing) {
        return prev.map((item) =>
          item.book.id === book.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { book, quantity }];
    });
    trackAddToCart(book, quantity);
    showNotification(`"${toTitleCase(book.title || book.name)}" ditambahkan ke keranjang belanja.`);
  };

  const handleUpdateCartQuantity = (bookId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.book.id === bookId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const handleRemoveFromCart = (bookId: string) => {
    setCart((prev) => prev.filter((item) => item.book.id !== bookId));
    showNotification('Item dihapus dari keranjang.');
  };

  const handleBuyNow = (book: Book) => {
    if (!(Number(book.harga) > 0)) {
      showNotification(`"${toTitleCase(book.title || book.name)}" segera terbit — harga belum ditetapkan.`);
      return;
    }
    trackAddToCart(book, 1);
    setDirectBookBuy({ book, quantity: 1 });
    setIsCheckoutOpen(true);
  };

  const handleCartProceedCheckout = () => {
    if (cart.length === 0) return;
    setDirectBookBuy(null);
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const handleOrderSuccess = (order: Order) => {
    setOrders((prev) => [order, ...prev.filter((o) => o.orderNumber !== order.orderNumber)]);
    // Pesanan normalnya sudah dicatat backend oleh komponen checkout (serverSynced=true).
    // Fallback: jika belum, coba kirim sekarang.
    if (!order.serverSynced) {
      apiClient.createOrder(order).then((res) => {
        if (res.paymentMode !== 'offline') {
          setOrders((prev) => prev.map((o) => (o.orderNumber === order.orderNumber ? { ...o, serverSynced: true, paymentMode: res.paymentMode } : o)));
        }
      }).catch((err) => {
        console.warn('Order tidak tersinkron ke backend:', err);
        showNotification(`Pesanan tersimpan lokal, namun gagal tersinkron ke server: ${err instanceof ApiError ? err.message : 'backend offline'}`);
      });
    }
    // If it was from regular cart, clear cart
    if (!directBookBuy) {
      setCart([]);
    }
    setDirectBookBuy(null);
  };

  const handleUpdateOrder = (updatedOrder: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
    apiClient.updateOrder(updatedOrder).catch((err) => {
      showNotification(err instanceof ApiError ? `Gagal update pesanan di server: ${err.message}` : 'Update pesanan tersimpan lokal (backend offline).');
    });
  };

  // Admin CRUD operations — state lokal diperbarui optimistis, lalu disinkronkan ke backend (Supabase)
  const syncBookToServer = (book: Book, verb: string) => {
    apiClient.saveBook(book).catch((err) => {
      showNotification(err instanceof ApiError ? `Gagal ${verb} buku di server: ${err.message}` : `Buku ${verb} lokal saja (backend offline).`);
    });
  };

  const sanitizeBook = (book: Book): Book => ({
    ...book,
    name: toTitleCase(book.name || ''),
    title: toTitleCase(book.title || book.name || ''),
    tahunTerbit: Number(book.tahunTerbit) || new Date().getFullYear()
  });

  const handleAddBook = (newBook: Book) => {
    const sanitized = sanitizeBook(newBook);
    setBooks((prev) => [sanitized, ...prev]);
    syncBookToServer(sanitized, 'menambah');
  };

  const handleUpdateBook = (updatedBook: Book) => {
    const sanitized = sanitizeBook(updatedBook);
    setBooks((prev) => prev.map((b) => (b.id === sanitized.id ? sanitized : b)));
    if (selectedBook && selectedBook.id === sanitized.id) {
      setSelectedBook(sanitized);
    }
    syncBookToServer(sanitized, 'memperbarui');
  };

  const handleDeleteBook = (id: string) => {
    setBooks((prev) => prev.filter((b) => b.id !== id));
    if (selectedBook && selectedBook.id === id) {
      setSelectedBook(null);
    }
    apiClient.deleteBook(id).catch((err) => {
      showNotification(err instanceof ApiError ? `Gagal menghapus buku di server: ${err.message}` : 'Buku dihapus lokal saja (backend offline).');
    });
  };

  const handleToggleBukuTerbaru = (id: string) => {
    const target = books.find((b) => b.id === id);
    if (!target) return;
    const toggled = { ...target, bukuTerbaru: !target.bukuTerbaru };
    setBooks((prev) => prev.map((b) => (b.id === id ? toggled : b)));
    syncBookToServer(toggled, 'memperbarui');
  };

  const handleResetSeedData = () => {
    setBooks(INITIAL_BOOKS);
    localStorage.removeItem('cakranexa_books_v1');
    // Sinkronkan ulang seed ke server agar katalog konsisten di semua perangkat
    INITIAL_BOOKS.forEach((b) => apiClient.saveBook(b).catch(() => undefined));
  };

  const handleSelectBook = (book: Book) => {
    setNavHistory((prev) => [
      ...prev,
      {
        page: activePage,
        subSection: activeSubSection,
        selectedBookId: selectedBook ? selectedBook.id : null,
        catalogCategory,
        catalogSearch
      }
    ]);
    const normalized: Book = {
      ...book,
      name: toTitleCase(book.name || ''),
      title: toTitleCase(book.title || book.name || '')
    };
    setSelectedBook(normalized);
    setActivePage('katalog');
    trackViewContent(normalized);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cartTotalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] flex flex-col font-sans selection:bg-[#DFBF64] selection:text-[#0F172A]">
      
      {/* Editorial Hairline Scroll Progress Bar & Minimal Back-To-Top Button */}
      {activePage !== 'admin' && <ScrollProgress />}

      {/* Sleek Floating Toast */}
      {toast && (
        <div className="fixed top-20 right-5 z-50 px-4 py-3 rounded bg-[#0F172A] text-[#D4AF37] border border-[#D4AF37]/40 shadow-2xl text-xs font-semibold animate-in slide-in-from-top-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{toast}</span>
        </div>
      )}

      {/* Global Luxury Header & Navigation (Hidden in Admin Full-Screen Dashboard) */}
      {activePage !== 'admin' && (
        <Navbar
          activePage={activePage}
          onNavigate={navigateTo}
          cartCount={cartTotalCount}
          onOpenCart={() => setIsCartOpen(true)}
          onOpenSearch={() => setIsQuickSearchOpen(true)}
        />
      )}

      {/* Universal Page Sub-Header with Back Navigation (Directly Below Header Menu, Hidden on Homepage) */}
      {activePage !== 'admin' && activePage !== 'beranda' && activePage !== 'home' && (
        <div className="mt-16 sm:mt-[68px] bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-14 sm:top-[64px] z-30 shadow-xs transition-all">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4">
            <button
              id="btn-universal-back-step"
              onClick={handleGoBack}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700 hover:text-[#0F172A] bg-slate-100 hover:bg-slate-200/90 px-3.5 py-1.5 rounded-lg border border-slate-300 transition-all cursor-pointer group shadow-xs"
              title="Kembali ke halaman sebelumnya"
            >
              <ArrowLeft className="w-4 h-4 text-[#DFBF64] group-hover:-translate-x-1 transition-transform" />
              <span>Kembali ke Halaman Sebelumnya</span>
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="hidden sm:inline">Lokasi Halaman:</span>
              <span className="font-semibold text-slate-800 uppercase tracking-wide bg-slate-100 px-2.5 py-0.5 rounded text-[11px] font-mono border border-slate-200">
                {selectedBook ? 'Detail Buku' : activePage.replace('-', ' ')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Router */}
      <main className="flex-grow">
        
        {/* VIEW 1: BERANDA (HOME) */}
        {(activePage === 'beranda' || activePage === 'home') && (
          <div>
            {/* 1. Hero Section: Branding narrative & primary action buttons */}
            {(siteContent.homeSections?.find(s => s.id === 'sec-hero')?.isEnabled ?? true) && (
              <ScrollReveal direction="none" duration={0.5}>
                <Hero
                  slides={siteContent.heroSlides}
                  onExploreCatalog={() => navigateTo('katalog')}
                  onPublishBook={() => navigateTo('penerbitan', 'kirim-naskah')}
                  onNavigate={navigateTo}
                />
              </ScrollReveal>
            )}

            {/* 2. SECTION 2: SMOOTH RUNNING LISTING BEST SELLER (REALTIME CRUD MANAGED) */}
            {(siteContent.bestSellerSection?.isEnabled ?? true) && (
              <ScrollReveal direction="up" distance={20} duration={0.6}>
                <BestSellerTicker
                  badge={siteContent.bestSellerSection?.badge || 'MONOGRAFI BEST SELLER AKADEMIK'}
                  title={siteContent.bestSellerSection?.title || 'Koleksi Buku Terlaris Rujukan Pakar, Dosen, & Praktisi'}
                  subtitle={siteContent.bestSellerSection?.subtitle || 'Deretan monografi ilmiah ber-ISBN dengan tingkat adopsi kurikulum dan sitasi tertinggi.'}
                  speedSeconds={siteContent.bestSellerSection?.speed === 'fast' ? 18 : siteContent.bestSellerSection?.speed === 'slow' ? 40 : 28}
                  books={books}
                  customBookIds={siteContent.bestSellerSection?.customBookIds}
                  onSelectBook={handleSelectBook}
                  onAddToCart={(b) => handleAddToCart(b, 1)}
                  onQuickBuy={handleBuyNow}
                  onViewAll={() => {
                    setCatalogCategory('all');
                    navigateTo('katalog');
                  }}
                />
              </ScrollReveal>
            )}

            {/* 3. Publisher Showcase / Services inspired by Amazon KDP */}
            {(siteContent.homeSections?.find(s => s.id === 'sec-publisher-showcase')?.isEnabled ?? true) && (
              <ScrollReveal direction="up" distance={24} duration={0.65}>
                <PublisherShowcase
                  books={books}
                  onKirimNaskah={() => navigateTo('penerbitan', 'kirim-naskah')}
                  onPanduanPenulis={() => navigateTo('penerbitan', 'panduan')}
                />
              </ScrollReveal>
            )}

            {/* 5. Carousel Preview Kategori Buku */}
            {(siteContent.homeSections?.find(s => s.id === 'sec-carousel-kategori')?.isEnabled ?? true) && (
              <ScrollReveal direction="up" distance={24} duration={0.65}>
                <BookCarousel
                  id="carousel-preview-kategori"
                  badge={siteContent.homeSections?.find(s => s.id === 'sec-carousel-kategori')?.badge || 'Preview Kategori'}
                  title={siteContent.homeSections?.find(s => s.id === 'sec-carousel-kategori')?.title || 'Kategori Monografi Akademik'}
                  subtitle={siteContent.homeSections?.find(s => s.id === 'sec-carousel-kategori')?.subtitle || 'Eksplorasi literatur hukum, perpajakan, dan akuntansi berdasarkan disiplin ilmu'}
                  books={books}
                  categories={['Perpajakan', 'Akuntansi', 'Hukum', 'Ekonomi & Bisnis', 'Filsafat', 'Teologia']}
                  selectedCategory={homeCategoryPreview}
                  onSelectCategory={setHomeCategoryPreview}
                  onSelectBook={handleSelectBook}
                  onAddToCart={(b) => handleAddToCart(b, 1)}
                  onQuickBuy={handleBuyNow}
                  onViewMore={() => {
                    if (homeCategoryPreview && homeCategoryPreview !== 'all') {
                      setCatalogCategory(homeCategoryPreview);
                    }
                    navigateTo('katalog');
                  }}
                  viewMoreText={homeCategoryPreview && homeCategoryPreview !== 'all' ? `Lihat Kategori ${homeCategoryPreview} di Katalog` : 'Lihat Semua Kategori di Katalog'}
                />
              </ScrollReveal>
            )}

            {/* 6. Carousel Preview Buku Terbaru (Filtered via Admin Scheduling & Toggle) */}
            {(siteContent.homeSections?.find(s => s.id === 'sec-carousel-terbaru')?.isEnabled ?? true) && (
              <ScrollReveal direction="up" distance={24} duration={0.65}>
                <BookCarousel
                  id="carousel-preview-terbaru"
                  badge={siteContent.homeSections?.find(s => s.id === 'sec-carousel-terbaru')?.badge || 'Rilis Terkini'}
                  title={siteContent.homeSections?.find(s => s.id === 'sec-carousel-terbaru')?.title || 'Preview Buku Terbaru'}
                  subtitle={siteContent.homeSections?.find(s => s.id === 'sec-carousel-terbaru')?.subtitle || 'Monografi akademik dan buku teks terbaru dengan telaah riset terkini'}
                  books={(() => {
                    const latest = (books || []).filter(b => {
                      if (b?.bukuTerbaru) return true;
                      if (b?.scheduledUpload) {
                        const sDate = new Date(b.scheduledUpload);
                        if (!isNaN(sDate.getTime()) && sDate <= new Date()) return true;
                      }
                      if (b?.releaseDate) {
                        const rDate = new Date(b.releaseDate);
                        if (!isNaN(rDate.getTime()) && rDate <= new Date() && rDate.getFullYear() >= 2026) return true;
                      }
                      return false;
                    });
                    return latest.length > 0 ? latest : (books || []).slice(0, 6);
                  })()}
                  onSelectBook={handleSelectBook}
                  onAddToCart={(b) => handleAddToCart(b, 1)}
                  onQuickBuy={handleBuyNow}
                  onViewMore={() => {
                    setCatalogCategory('all');
                    navigateTo('katalog');
                  }}
                  viewMoreText="Lihat Koleksi Buku Terbaru"
                />
              </ScrollReveal>
            )}

            {/* 7. Carousel Preview Semua Buku */}
            {(siteContent.homeSections?.find(s => s.id === 'sec-carousel-semua')?.isEnabled ?? true) && (
              <ScrollReveal direction="up" distance={24} duration={0.65}>
                <BookCarousel
                  id="carousel-preview-semua"
                  badge={siteContent.homeSections?.find(s => s.id === 'sec-carousel-semua')?.badge || 'Katalog Lengkap'}
                  title={siteContent.homeSections?.find(s => s.id === 'sec-carousel-semua')?.title || 'Preview Semua Buku Terbitan'}
                  subtitle={siteContent.homeSections?.find(s => s.id === 'sec-carousel-semua')?.subtitle || `Seluruh ${books.length} monografi akademik dan buku teks ber-ISBN resmi Perpustakaan Nasional`}
                  books={books}
                  onSelectBook={handleSelectBook}
                  onAddToCart={(b) => handleAddToCart(b, 1)}
                  onQuickBuy={handleBuyNow}
                  onViewMore={() => {
                    setCatalogCategory('all');
                    navigateTo('katalog');
                  }}
                  viewMoreText={`Jelajahi Semua ${books.length} Buku di Katalog`}
                />
              </ScrollReveal>
            )}
          </div>
        )}

        {/* VIEW 2: KATALOG (BOOK DETAIL OR GRID LIST) */}
        {activePage === 'katalog' && (
          <div>
            {selectedBook ? (
              <BookDetailView
                book={selectedBook}
                onBack={handleGoBack}
                onAddToCart={handleAddToCart}
                onBuyNow={handleBuyNow}
                relatedBooks={books.filter(b => b.category === selectedBook.category && b.id !== selectedBook.id).slice(0, 4)}
                onSelectRelatedBook={handleSelectBook}
              />
            ) : (
              <div className="py-8">
                <BookGrid
                  books={books}
                  onSelectBook={handleSelectBook}
                  onAddToCart={handleAddToCart}
                  onQuickBuy={handleBuyNow}
                  selectedCategory={catalogCategory}
                  onSelectCategory={setCatalogCategory}
                  searchQuery={catalogSearch}
                  onSearchChange={setCatalogSearch}
                  onNavigateToPenerbitan={() => navigateTo('penerbitan', 'kirim-naskah')}
                />
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: PENERBITAN (SUB-PAGES: LAYANAN, KIRIM NASKAH, PANDUAN, PROSES, FAQ) */}
        {activePage === 'penerbitan' && (
          <PenerbitanView 
            initialSubSection={activeSubSection} 
            onNavigateSubSection={(sub) => navigateTo('penerbitan', sub)}
          />
        )}

        {/* VIEW 4: PELATIHAN & WORKSHOPS */}
        {activePage === 'pelatihan' && (
          <PelatihanView />
        )}

        {/* VIEW 5: JURNAL ILMIAH */}
        {activePage === 'jurnal' && (
          <JurnalView />
        )}

        {/* VIEW 6: TENTANG KAMI (PROFIL, VISI MISI, TIM, LEGALITAS) */}
        {activePage === 'tentang-kami' && (
          <TentangKamiView initialSubSection={activeSubSection} />
        )}

        {/* VIEW 7: BLOG / COMMENTARY */}
        {activePage === 'blog' && (
          <BlogView />
        )}

        {/* VIEW 8: KARIR */}
        {(activePage === 'karir' || activePage === 'career') && (
          <CareerView siteContent={siteContent} />
        )}

        {/* VIEW 9: KONTAK */}
        {activePage === 'kontak' && (
          <KontakView />
        )}

        {/* VIEW 10: ADMIN DASHBOARD (CRUD & DEDICATED SIDEBAR) */}
        {activePage === 'admin' && (
          <AdminLoginGate onBackHome={() => navigateTo('beranda')}>
          <AdminDashboard
            books={books}
            orders={orders}
            onAddBook={handleAddBook}
            onUpdateBook={handleUpdateBook}
            onDeleteBook={handleDeleteBook}
            onToggleBukuTerbaru={handleToggleBukuTerbaru}
            onResetSeedData={handleResetSeedData}
            onViewBookDetail={handleSelectBook}
            onUpdateOrder={handleUpdateOrder}
            seoSettings={seoSettings}
            onUpdateSeoSettings={setSeoSettings}
            siteContent={siteContent}
            onUpdateSiteContent={handleUpdateSiteContent}
            onNavigateHome={() => navigateTo('beranda')}
            onGoBack={handleGoBack}
          />
          </AdminLoginGate>
        )}

        {/* VIEW 11: FULL-PAGE CHECKOUT FLOW */}
        {activePage === 'checkout' && (
          <div className="py-12 bg-[#F8FAFC]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <CheckoutForm
                cartItems={directBookBuy ? [directBookBuy] : cart}
                onOrderCompleted={(order) => {
                  handleOrderSuccess(order);
                  showNotification(`Pesanan #${order.orderNumber} berhasil dicatat. Terima kasih!`);
                }}
                onCancel={() => {
                  setDirectBookBuy(null);
                  navigateTo('katalog');
                }}
              />
            </div>
          </div>
        )}

      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveFromCart}
        onProceedCheckout={handleCartProceedCheckout}
      />

      {/* Checkout Modal with Midtrans Snap Gateway Simulator */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => {
          setIsCheckoutOpen(false);
          setDirectBookBuy(null);
        }}
        items={cart}
        directBookBuy={directBookBuy}
        onOrderSuccess={handleOrderSuccess}
      />

      {/* Quick Search Modal (Cmd+K / Search Icon) */}
      <QuickSearchModal
        isOpen={isQuickSearchOpen}
        onClose={() => setIsQuickSearchOpen(false)}
        books={books}
        onSelectBook={handleSelectBook}
      />

      {/* Global Footer (Hidden in Admin Panel) */}
      {activePage !== 'admin' && <Footer onNavigate={navigateTo} siteContent={siteContent} />}

    </div>
  );
}
