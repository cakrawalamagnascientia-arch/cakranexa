import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { INITIAL_BOOKS, withLocalBookCover } from './data/booksData';
import { INITIAL_AUTHORS, INITIAL_BOOK_AUTHORS, normalizeAuthors, authorNameKey } from './data/authorsData';
import { Book, CartItem, Order, ActivePage, SubSection, BookCategory, SeoSettings, SiteContentSettings, Author } from './types';
import { apiClient, ApiError } from './services/apiClient';
import { parseLocation, pushRoute, RouteState, languageFromLocation, replaceLanguageInUrl } from './utils/router';
import { AdminLoginGate } from './components/AdminLoginGate';
import { useSeoMetadata } from './hooks/useSeoMetadata';
import { getStoredSeoSettings, fetchSeoSettingsApi } from './services/seoService';
import { DEFAULT_SITE_CONTENT, getStoredSiteContent, saveStoredSiteContent, fetchSiteContentApi, saveSiteContentApi } from './services/siteContentService';
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
import { AuthorsListingView } from './components/AuthorsListingView';
import { AuthorDetailView } from './components/AuthorDetailView';
import { ScrollReveal } from './components/ScrollReveal';
import { ScrollProgress } from './components/ScrollProgress';
import { isAdminAuthenticated } from './services/adminAuth';
import i18n, { changeAppLanguage, getCurrentLanguage, isAppLanguage } from './i18n/index';
import { useBookText, useCategoryLabel, useCmsText } from './i18n/hooks';
import { buildDigitalCatalog, DigitalCatalogContext, useDigitalProducts, type DigitalEntry } from './hooks/useDigitalCatalog';
import { DigitalListingView } from './components/digital/DigitalListingView';
import { DigitalDetailView } from './components/digital/DigitalDetailView';
import { DigitalSampleView } from './components/digital/DigitalSampleView';
import { MembershipView } from './components/digital/MembershipView';
import { InstitutionsView } from './components/digital/InstitutionsView';
import { LibraryView } from './components/digital/LibraryView';

// Label halaman pada sub-header (common:subheader.pages.*); halaman lain memakai slug apa adanya.
type SubheaderPageKey = 'katalog' | 'katalogDetail' | 'penerbitan' | 'pelatihan' | 'jurnal' | 'tentangKami' | 'blog' | 'career' | 'karir' | 'checkout' | 'kontak';
const SUBHEADER_PAGE_KEYS: Partial<Record<ActivePage, SubheaderPageKey>> = {
  katalog: 'katalog',
  'katalog-detail': 'katalogDetail',
  penerbitan: 'penerbitan',
  pelatihan: 'pelatihan',
  jurnal: 'jurnal',
  'tentang-kami': 'tentangKami',
  blog: 'blog',
  career: 'career',
  karir: 'karir',
  checkout: 'checkout',
  kontak: 'kontak'
};

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
    serverSynced: true,
    language: r.language || undefined
  };
}

const serverErrorMessage = (err: unknown): string =>
  err instanceof ApiError ? err.message : i18n.t('errors:serverUnreachable');

export default function App() {
  const { t } = useTranslation(['common', 'home', 'errors']);
  const categoryLabel = useCategoryLabel();
  const cmsText = useCmsText();
  const bookText = useBookText();
  // Field bawaan hanya mengisi yang belum ada; harga 0 / sinopsis kosong dari admin tetap dihormati.
  const withSeedDefaults = (book: Book): Book => {
    const initial = INITIAL_BOOKS.find((item) => item.id === book.id);
    if (!initial) return book;
    return {
      ...initial,
      ...book,
      harga: book.harga ?? initial.harga,
      sinopsis: book.sinopsis ?? initial.sinopsis,
      // Terjemahan bawaan dipakai bila data server belum punya terjemahan (mis. kolom i18n masih {}).
      i18n: book.i18n && Object.keys(book.i18n).length > 0 ? book.i18n : initial.i18n
    };
  };

  // Cache lokal (first paint) dilengkapi buku bawaan yang belum ada.
  const mergeInitialBooks = (existingBooks: Book[]): Book[] => {
    const existingIds = new Set(existingBooks.map((book) => book.id));
    return [
      ...existingBooks.map(withSeedDefaults),
      ...INITIAL_BOOKS.filter((book) => !existingIds.has(book.id))
    ];
  };

  const appendMissingSeedAuthors = (existingAuthors: Author[]): Author[] => {
    const keys = new Set(existingAuthors.map((author) => authorNameKey(author.name)));
    return [...existingAuthors, ...INITIAL_AUTHORS.filter((author) => !keys.has(authorNameKey(author.name)))];
  };

  // 1. Persistent Book Inventory State
  const [books, setBooks] = useState<Book[]>(() => {
    try {
      const saved = localStorage.getItem('cakranexa_books_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return mergeInitialBooks(parsed).map((b: any) => ({
            ...withLocalBookCover(b),
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

  /** Mengembalikan pesan error server, atau null bila tersimpan. */
  const handleUpdateSiteContent = async (newContent: SiteContentSettings): Promise<string | null> => {
    setSiteContent(newContent);
    saveStoredSiteContent(newContent);
    try {
      await saveSiteContentApi(newContent);
      return null;
    } catch (err) {
      return serverErrorMessage(err);
    }
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
      // null = server tidak terjangkau: pertahankan cache, jangan ditimpa data bawaan.
      if (isMounted && remoteBooks) {
        // Backend adalah sumber kebenaran katalog (sudah termasuk buku bawaan & yang dihapus admin).
        setBooks(remoteBooks.map(withSeedDefaults).map((b) => ({
          ...withLocalBookCover(b),
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

  // 1b. Persistent Authors & Contributors State
  const [authors, setAuthors] = useState<Author[]>(() => {
    try {
      const saved = localStorage.getItem('cakranexa_authors_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return normalizeAuthors(appendMissingSeedAuthors(parsed));
      }
    } catch {
      // fallback to initial
    }
    return normalizeAuthors(INITIAL_AUTHORS);
  });

  useEffect(() => {
    try {
      localStorage.setItem('cakranexa_authors_v1', JSON.stringify(authors));
    } catch {
      // ignore storage limits
    }
  }, [authors]);

  useEffect(() => {
    let isMounted = true;
    apiClient.getAuthors().then((remoteAuthors) => {
      // Server sudah menggabungkan penulis bawaan; null = tidak terjangkau, pertahankan cache.
      if (isMounted && remoteAuthors) {
        setAuthors(normalizeAuthors(remoteAuthors));
      }
    }).catch((err) => {
      console.warn('Silent API authors sync fallback:', err);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null);

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
  const [activeSubSection, setActiveSubSection] = useState<SubSection>(initialRoute.subSection ?? null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  // Slug buku dari URL (/katalog/<slug>) yang belum bisa di-resolve sebelum katalog termuat
  const [pendingBookSlug, setPendingBookSlug] = useState<string | null>(initialRoute.bookSlug || null);
  // Halaman digital: slug buku (/digital/<format>/<slug>) atau id produk (/digital/sample/<id>).
  const [digitalItem, setDigitalItem] = useState<string | null>(initialRoute.digitalItem ?? null);

  // Katalog produk digital (e-book & audiobook), dibagikan ke navbar, kartu buku, dan halaman digital.
  const digitalProducts = useDigitalProducts();
  const digitalCatalog = React.useMemo(() => buildDigitalCatalog(books, digitalProducts), [books, digitalProducts]);
  const digitalFormat = activeSubSection === 'audiobook' ? 'audiobook' : 'ebook';
  const activeDigitalEntry: DigitalEntry | undefined = activePage !== 'digital' || !digitalItem
    ? undefined
    : activeSubSection === 'sample'
      ? digitalCatalog.findById(digitalItem)
      : digitalCatalog.findByBook(digitalFormat, digitalItem);

  // Pulihkan detail penulis dari URL saat halaman dibuka langsung atau di-refresh.
  useEffect(() => {
    if (initialRoute.page !== 'katalog' || !initialRoute.selectedAuthorId) return;
    const author = authors.find((item) => item.id === initialRoute.selectedAuthorId);
    if (!author) return;
    setSelectedAuthor(attachAuthorBooks(author));
    setActivePage('katalog');
    setActiveSubSection('penulis');
  }, [authors, initialRoute]);

  // 4b. Step-by-Step Navigation History Stack
  const [navHistory, setNavHistory] = useState<Array<{
    page: ActivePage;
    subSection?: SubSection;
    selectedBookId?: string | null;
    selectedAuthorId?: string | null;
    catalogCategory?: string;
    catalogSearch?: string;
    digitalItem?: string | null;
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

  // Prefix bahasa di URL (/en, /zh) mengikuti bahasa aktif. Dijalankan sebelum sinkronisasi rute di bawah
  // agar kunjungan ulang dengan bahasa tersimpan (atau ?lang=) langsung memakai URL berprefiks tanpa
  // menambah riwayat. Mengganti bahasa mengganti prefix URL halaman saat ini.
  useEffect(() => {
    replaceLanguageInUrl(getCurrentLanguage());
    const onLanguageChanged = (language: string) => {
      if (isAppLanguage(language)) replaceLanguageInUrl(language);
    };
    i18n.on('languageChanged', onLanguageChanged);
    return () => i18n.off('languageChanged', onLanguageChanged);
  }, []);

  // Sinkronkan state -> URL (History API) agar bisa di-refresh, dibagikan, dan di-crawl
  useEffect(() => {
    if (pendingBookSlug) return; // tunggu resolve
    pushRoute({
      page: activePage,
      subSection: activeSubSection,
      bookSlug: activePage === 'katalog' && selectedBook ? selectedBook.slug || selectedBook.id : null,
      selectedAuthorId: activePage === 'katalog' && selectedAuthor ? selectedAuthor.id : null,
      category: activePage === 'katalog' && !selectedBook && !selectedAuthor ? catalogCategory : undefined,
      search: activePage === 'katalog' && !selectedBook && !selectedAuthor ? catalogSearch : undefined,
      digitalItem: activePage === 'digital' ? digitalItem : null
    }, activePage === 'katalog' && !selectedBook && !selectedAuthor && (catalogSearch !== '' || catalogCategory !== 'all'));
  }, [activePage, activeSubSection, selectedBook, selectedAuthor, catalogCategory, catalogSearch, pendingBookSlug, digitalItem]);

  // Tombol Back/Forward browser
  useEffect(() => {
    const onPopState = () => {
      // Back/Forward ke URL berbahasa lain: ikuti bahasa di URL.
      const urlLanguage = languageFromLocation();
      if (urlLanguage !== getCurrentLanguage()) void changeAppLanguage(urlLanguage);
      const route = parseLocation();
      setActivePage(route.page);
      setActiveSubSection(route.subSection ?? null);
      setCatalogCategory(route.category || 'all');
      setCatalogSearch(route.search || '');
      setDigitalItem(route.digitalItem ?? null);
      if (route.selectedAuthorId) {
        const foundA = authors.find((a) => a.id === route.selectedAuthorId);
        if (foundA) {
          setSelectedAuthor(foundA);
          setSelectedBook(null);
        } else {
          setSelectedAuthor(null);
        }
      } else if (route.bookSlug) {
        const found = books.find((b) => b.slug === route.bookSlug || b.id === route.bookSlug);
        if (found) {
          setSelectedBook(found);
          setSelectedAuthor(null);
        } else {
          setPendingBookSlug(route.bookSlug);
        }
      } else {
        setSelectedBook(null);
        setSelectedAuthor(null);
      }
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [books, authors]);
  const [homeCategoryPreview, setHomeCategoryPreview] = useState<string>('all');

  // Universal Back 1 Step handler across all views
  const handleGoBack = () => {
    if (navHistory.length === 0 && activePage === 'digital' && digitalItem) {
      // Detail/sampel digital dibuka langsung dari URL: kembali ke daftar format yang sama.
      setActiveSubSection(activeDigitalEntry?.product.format ?? digitalFormat);
      setDigitalItem(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (navHistory.length > 0) {
      const prev = navHistory[navHistory.length - 1];
      setNavHistory((prevHistory) => prevHistory.slice(0, -1));
      setActivePage(prev.page);
      setActiveSubSection(prev.subSection ?? null);
      setDigitalItem(prev.digitalItem ?? null);
      if (prev.selectedAuthorId) {
        const foundA = authors.find((a) => a.id === prev.selectedAuthorId);
        setSelectedAuthor(foundA || null);
        setSelectedBook(null);
      } else if (prev.selectedBookId) {
        const found = books.find((b) => b.id === prev.selectedBookId);
        setSelectedBook(found || null);
        setSelectedAuthor(null);
      } else {
        setSelectedBook(null);
        setSelectedAuthor(null);
      }
      if (prev.catalogCategory) {
        setCatalogCategory(prev.catalogCategory);
      }
      if (prev.catalogSearch !== undefined) {
        setCatalogSearch(prev.catalogSearch);
      }
    } else {
      // Fallback if no prior history was tracked yet
      if (selectedAuthor) {
        setSelectedAuthor(null);
        setActivePage('katalog');
        setActiveSubSection('penulis');
      } else if (selectedBook) {
        setSelectedBook(null);
        setActivePage('katalog');
      } else if (activePage !== 'beranda' && activePage !== 'home') {
        setActivePage('beranda');
        setActiveSubSection(null);
        setSelectedBook(null);
        setSelectedAuthor(null);
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
      katalog: selectedAuthor
        ? `${toTitleCase(selectedAuthor.name)} | Profil Penulis & Kontributor`
        : selectedBook
          ? `${toTitleCase(selectedBook.title || selectedBook.name)} | Katalog Buku`
          : activeSubSection === 'penulis'
            ? 'Penulis & Kontributor CakraNexa'
            : 'Katalog Buku Akademik & Monograf',
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
  }, [activePage, selectedBook, selectedAuthor, activeSubSection]);

  // Apply dynamic Open Graph, meta tags, and Book Schema JSON-LD on route/book change
  useSeoMetadata({
    activePage,
    selectedBook,
    subSection: activeSubSection,
    seoSettings,
    digitalEntry: activeDigitalEntry
  });

  // Global Notification Toast
  const [toast, setToast] = useState<string | null>(null);

  const showNotification = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Scroll to top upon page navigation
  const navigateTo = (page: ActivePage, subSection?: SubSection, categoryFilter?: BookCategory) => {
    const hasDigitalItem = activePage === 'digital' && digitalItem !== null;
    if (page !== activePage || subSection !== activeSubSection || selectedBook !== null || selectedAuthor !== null || hasDigitalItem) {
      setNavHistory((prev) => [
        ...prev,
        {
          page: activePage,
          subSection: activeSubSection,
          selectedBookId: selectedBook ? selectedBook.id : null,
          selectedAuthorId: selectedAuthor ? selectedAuthor.id : null,
          catalogCategory,
          catalogSearch,
          digitalItem: hasDigitalItem ? digitalItem : null
        }
      ]);
    }
    setActivePage(page);
    setActiveSubSection(subSection ?? null);
    setDigitalItem(null);
    if (page !== 'katalog') {
      setSelectedBook(null);
      setSelectedAuthor(null);
    } else {
      if (subSection === 'penulis') {
        setSelectedBook(null);
      } else if ((activeSubSection as string) === 'penulis' && (subSection as string) !== 'penulis') {
        setSelectedAuthor(null);
      }
      if (!subSection || (subSection !== 'penulis' && !['Perpajakan', 'Akuntansi', 'Hukum', 'Ekonomi & Bisnis', 'Filsafat', 'Teologia'].includes(subSection))) {
        setSelectedAuthor(null);
      }
    }
    // Handle category preset if navigating from dropdown
    if (subSection && ['Perpajakan', 'Akuntansi', 'Hukum', 'Ekonomi & Bisnis', 'Filsafat', 'Teologia'].includes(subSection as string)) {
      setCatalogCategory(subSection as string);
    } else if (categoryFilter) {
      setCatalogCategory(categoryFilter);
    } else if (page === 'katalog' && (!subSection || (subSection as string) === 'all')) {
      setCatalogCategory('all');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cart operations
  const handleAddToCart = (book: Book, quantity: number = 1) => {
    if (!(Number(book.harga) > 0)) {
      showNotification(t('toast.forthcomingNoPrice', { title: bookText.title(book) }));
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
    showNotification(t('toast.addedToCart', { title: bookText.title(book) }));
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
    showNotification(t('toast.removedFromCart'));
  };

  const handleBuyNow = (book: Book) => {
    if (!(Number(book.harga) > 0)) {
      showNotification(t('toast.forthcomingNoPrice', { title: bookText.title(book) }));
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
        showNotification(t('toast.orderSyncFailed', { reason: err instanceof ApiError ? err.message : t('errors:backendOffline') }));
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
      showNotification(err instanceof ApiError ? t('toast.orderUpdateFailed', { message: err.message }) : t('toast.orderUpdateOffline'));
    });
  };

  // Admin CRUD operations — state lokal diperbarui optimistis, lalu disinkronkan ke backend (Supabase).
  // Handler mengembalikan pesan error (atau null bila tersimpan) agar dashboard admin menampilkan hasil sebenarnya.
  const syncBookToServer = async (book: Book): Promise<string | null> => {
    try {
      await apiClient.saveBook(book);
      return null;
    } catch (err) {
      return serverErrorMessage(err);
    }
  };

  const sanitizeBook = (book: Book): Book => ({
    ...book,
    name: toTitleCase(book.name || ''),
    title: toTitleCase(book.title || book.name || ''),
    tahunTerbit: Number(book.tahunTerbit) || new Date().getFullYear()
  });

  // Perubahan diterapkan setelah server menyimpannya, agar tampilan tidak menunjukkan data yang gagal tersimpan
  // (mis. sesi admin habis: dashboard berganti ke layar login sebelum pesan gagal terlihat).
  const handleAddBook = async (newBook: Book): Promise<string | null> => {
    const sanitized = sanitizeBook(newBook);
    const error = await syncBookToServer(sanitized);
    if (!error) setBooks((prev) => [sanitized, ...prev]);
    return error;
  };

  const handleUpdateBook = async (updatedBook: Book): Promise<string | null> => {
    const sanitized = sanitizeBook(updatedBook);
    const error = await syncBookToServer(sanitized);
    if (error) return error;
    setBooks((prev) => prev.map((b) => (b.id === sanitized.id ? sanitized : b)));
    setSelectedBook((current) => (current && current.id === sanitized.id ? sanitized : current));
    return null;
  };

  const handleDeleteBook = async (id: string): Promise<string | null> => {
    try {
      await apiClient.deleteBook(id);
    } catch (err) {
      return serverErrorMessage(err);
    }
    setBooks((prev) => prev.filter((b) => b.id !== id));
    setSelectedBook((current) => (current && current.id === id ? null : current));
    return null;
  };

  const handleToggleBukuTerbaru = (id: string) => {
    const target = books.find((b) => b.id === id);
    if (!target) return;
    const toggled = { ...target, bukuTerbaru: !target.bukuTerbaru };
    setBooks((prev) => prev.map((b) => (b.id === id ? toggled : b)));
    syncBookToServer(toggled).then((error) => {
      if (!error) return;
      setBooks((prev) => prev.map((b) => (b.id === id ? target : b))); // batalkan perubahan
      showNotification(t('toast.bookUpdateFailed', { message: error }));
    });
  };

  const handleResetSeedData = () => {
    setBooks(INITIAL_BOOKS);
    localStorage.removeItem('cakranexa_books_v1');
    // Sinkronkan ulang seed ke server agar katalog konsisten di semua perangkat
    INITIAL_BOOKS.forEach((b) => apiClient.saveBook(b).catch(() => undefined));
  };

  const attachAuthorBooks = (author: Author): Author => {
    if (author.books && Array.isArray(author.books) && author.books.length > 0) return author;
    // Penulis bawaan yang sudah dipindah ke UUID Supabase dicocokkan lewat nama.
    const seedAuthor = INITIAL_AUTHORS.find((a) => a.id === author.id || authorNameKey(a.name) === authorNameKey(author.name || ''));
    const bookIds = INITIAL_BOOK_AUTHORS
      .filter((r) => r.author_id === seedAuthor?.id)
      .sort((a, b) => a.author_order - b.author_order)
      .map((r) => r.book_id);
    const relatedBooks = books.filter((b) => bookIds.includes(b.id));
    return { ...author, books: relatedBooks };
  };

  const handleSelectAuthor = (author: Author) => {
    setNavHistory((prev) => [
      ...prev,
      {
        page: activePage,
        subSection: activeSubSection,
        selectedBookId: selectedBook ? selectedBook.id : null,
        selectedAuthorId: selectedAuthor ? selectedAuthor.id : null,
        catalogCategory,
        catalogSearch
      }
    ]);
    const enriched = attachAuthorBooks(author);
    setSelectedAuthor(enriched);
    setSelectedBook(null);
    setActivePage('katalog');
    setActiveSubSection('penulis');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const syncAuthorToServer = (author: Author, verb: string, operation: 'create' | 'update') => {
    apiClient.saveAuthor(author, operation).catch((err) => {
      // Teks dipilih per operasi (create/update) agar bisa diterjemahkan; `verb` dipertahankan demi kompatibilitas pemanggil.
      showNotification(err instanceof ApiError
        ? t(`toast.authorSync.${operation}Failed` as const, { message: err.message })
        : t(`toast.authorSync.${operation}Offline` as const));
    });
  };

  const handleAddAuthor = (newAuthor: Author) => {
    setAuthors((prev) => normalizeAuthors([newAuthor, ...prev]));
  };

  const handleUpdateAuthor = (updatedAuthor: Author) => {
    // Server bisa mengganti id penulis bawaan ("author-1") menjadi UUID Supabase; cocokkan lewat nama bila id berubah.
    const key = authorNameKey(updatedAuthor.name);
    setAuthors((prev) => {
      const next = prev.some((a) => a.id === updatedAuthor.id)
        ? prev.map((a) => (a.id === updatedAuthor.id ? updatedAuthor : a))
        : [...prev.filter((a) => authorNameKey(a.name) !== key), updatedAuthor];
      return normalizeAuthors(next);
    });
    if (selectedAuthor && (selectedAuthor.id === updatedAuthor.id || authorNameKey(selectedAuthor.name) === key)) {
      setSelectedAuthor(attachAuthorBooks(updatedAuthor));
    }
  };

  const handleDeleteAuthor = async (id: string): Promise<string | null> => {
    try {
      await apiClient.deleteAuthor(id);
    } catch (err) {
      return serverErrorMessage(err);
    }
    setAuthors((prev) => prev.filter((a) => a.id !== id));
    setSelectedAuthor((current) => (current && current.id === id ? null : current));
    return null;
  };

  const handleSelectBook = (book: Book) => {
    setNavHistory((prev) => [
      ...prev,
      {
        page: activePage,
        subSection: activeSubSection,
        selectedBookId: selectedBook ? selectedBook.id : null,
        selectedAuthorId: selectedAuthor ? selectedAuthor.id : null,
        catalogCategory,
        catalogSearch,
        digitalItem: activePage === 'digital' ? digitalItem : null
      }
    ]);
    const normalized: Book = {
      ...book,
      name: toTitleCase(book.name || ''),
      title: toTitleCase(book.title || book.name || '')
    };
    setSelectedBook(normalized);
    setSelectedAuthor(null);
    if (activePage === 'digital') setActiveSubSection(null); // dari halaman digital ke versi cetak
    setActivePage('katalog');
    trackViewContent(normalized);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Halaman produk digital: detail (/digital/<format>/<slug-buku>) dan sampel (/digital/sample/<id-produk>).
  const openDigitalView = (subSection: SubSection, item: string) => {
    setNavHistory((prev) => [
      ...prev,
      {
        page: activePage,
        subSection: activeSubSection,
        selectedBookId: selectedBook ? selectedBook.id : null,
        selectedAuthorId: selectedAuthor ? selectedAuthor.id : null,
        catalogCategory,
        catalogSearch,
        digitalItem: activePage === 'digital' ? digitalItem : null
      }
    ]);
    setActivePage('digital');
    setActiveSubSection(subSection);
    setDigitalItem(item);
    setSelectedBook(null);
    setSelectedAuthor(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openDigitalProduct = (entry: DigitalEntry) => openDigitalView(entry.product.format, entry.book.slug || entry.book.id);
  const openDigitalSample = (entry: DigitalEntry) => openDigitalView('sample', entry.product.id);

  const cartTotalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const { t: tDigital } = useTranslation('digital');
  const subheaderPageKey = SUBHEADER_PAGE_KEYS[activePage];
  // Halaman digital & keanggotaan: label sub-header dari namespace digital.
  const digitalSubheaderLabel = activePage === 'digital'
    ? activeSubSection === 'sample'
      ? tDigital('subheader.sample')
      : digitalItem ? tDigital('subheader.digitalDetail') : tDigital(`subheader.${digitalFormat}`)
    : activePage === 'membership' || activePage === 'institutions' || activePage === 'library'
      ? tDigital(`subheader.${activePage}`)
      : null;
  const subheaderPageLabel = digitalSubheaderLabel
    ?? (subheaderPageKey ? t(`subheader.pages.${subheaderPageKey}` as const) : activePage.replace('-', ' '));

  // Teks section beranda dari CMS; nilai kosong jatuh ke teks bawaan (terjemahan home:sections.*).
  const homeSectionText = (sectionId: string, field: 'badge' | 'title' | 'subtitle', translated: string): string =>
    cmsText(
      siteContent.homeSections?.find((s) => s.id === sectionId)?.[field] || undefined,
      DEFAULT_SITE_CONTENT.homeSections.find((s) => s.id === sectionId)?.[field],
      translated
    );

  return (
    <DigitalCatalogContext.Provider value={digitalCatalog}>
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
              title={t('subheader.backTitle')}
            >
              <ArrowLeft className="w-4 h-4 text-[#DFBF64] group-hover:-translate-x-1 transition-transform" />
              <span className="hidden sm:inline">{t('subheader.backLabel')}</span>
              <span className="sm:hidden">{t('common:back')}</span>
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="hidden sm:inline">{t('subheader.sectionLabel')}</span>
              <span className="font-semibold text-slate-800 uppercase tracking-wide bg-slate-100 px-2.5 py-0.5 rounded text-[11px] font-mono border border-slate-200">
                {selectedAuthor ? t('subheader.authorDetail') : selectedBook ? t('subheader.bookDetail') : activeSubSection === 'penulis' ? t('subheader.contributingAuthors') : subheaderPageLabel}
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
                  branding={siteContent.heroBranding}
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
                  badge={cmsText(siteContent.bestSellerSection?.badge || undefined, DEFAULT_SITE_CONTENT.bestSellerSection.badge, t('home:bestSeller.badge'))}
                  title={cmsText(siteContent.bestSellerSection?.title || undefined, DEFAULT_SITE_CONTENT.bestSellerSection.title, t('home:bestSeller.title'))}
                  subtitle={cmsText(siteContent.bestSellerSection?.subtitle || undefined, DEFAULT_SITE_CONTENT.bestSellerSection.subtitle, t('home:bestSeller.subtitle'))}
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
                  badge={homeSectionText('sec-carousel-kategori', 'badge', t('home:sections.categories.badge'))}
                  title={homeSectionText('sec-carousel-kategori', 'title', t('home:sections.categories.title'))}
                  subtitle={homeSectionText('sec-carousel-kategori', 'subtitle', t('home:sections.categories.subtitle'))}
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
                  viewMoreText={homeCategoryPreview && homeCategoryPreview !== 'all' ? t('home:carousel.viewCategory', { category: categoryLabel(homeCategoryPreview) }) : t('home:carousel.viewAllCategories')}
                />
              </ScrollReveal>
            )}

            {/* 6. Carousel Preview Buku Terbaru (Filtered via Admin Scheduling & Toggle) */}
            {(siteContent.homeSections?.find(s => s.id === 'sec-carousel-terbaru')?.isEnabled ?? true) && (
              <ScrollReveal direction="up" distance={24} duration={0.65}>
                <BookCarousel
                  id="carousel-preview-terbaru"
                  badge={homeSectionText('sec-carousel-terbaru', 'badge', t('home:sections.latest.badge'))}
                  title={homeSectionText('sec-carousel-terbaru', 'title', t('home:sections.latest.title'))}
                  subtitle={homeSectionText('sec-carousel-terbaru', 'subtitle', t('home:sections.latest.subtitle'))}
                  books={(() => {
                    const latest = (books || []).filter(b => {
                      if (b?.bukuTerbaru) return true;
                      if (b?.scheduledUpload) {
                        if (typeof b.scheduledUpload === 'boolean') {
                          if (b?.releaseDate) {
                            const rDate = new Date(b.releaseDate);
                            if (!isNaN(rDate.getTime()) && rDate <= new Date()) return true;
                          }
                        } else {
                          const sDate = new Date(b.scheduledUpload);
                          if (!isNaN(sDate.getTime()) && sDate <= new Date()) return true;
                        }
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
                  viewMoreText={t('home:carousel.viewLatest')}
                />
              </ScrollReveal>
            )}

            {/* 7. Carousel Preview Semua Buku */}
            {(siteContent.homeSections?.find(s => s.id === 'sec-carousel-semua')?.isEnabled ?? true) && (
              <ScrollReveal direction="up" distance={24} duration={0.65}>
                <BookCarousel
                  id="carousel-preview-semua"
                  badge={homeSectionText('sec-carousel-semua', 'badge', t('home:sections.all.badge'))}
                  title={homeSectionText('sec-carousel-semua', 'title', t('home:sections.all.title'))}
                  subtitle={homeSectionText('sec-carousel-semua', 'subtitle', t('home:sections.all.subtitle', { count: books.length }))}
                  books={books}
                  onSelectBook={handleSelectBook}
                  onAddToCart={(b) => handleAddToCart(b, 1)}
                  onQuickBuy={handleBuyNow}
                  onViewMore={() => {
                    setCatalogCategory('all');
                    navigateTo('katalog');
                  }}
                  viewMoreText={t('home:carousel.exploreAll', { count: books.length })}
                />
              </ScrollReveal>
            )}
          </div>
        )}

        {/* VIEW 2: KATALOG (AUTHOR DETAIL, BOOK DETAIL, PENULIS LISTING, OR GRID LIST) */}
        {activePage === 'katalog' && (
          <div>
            {selectedAuthor ? (
              <AuthorDetailView
                author={selectedAuthor}
                allBooks={books}
                onBack={handleGoBack}
                onSelectBook={handleSelectBook}
              />
            ) : selectedBook ? (
              <BookDetailView
                book={selectedBook}
                onBack={handleGoBack}
                onAddToCart={handleAddToCart}
                onBuyNow={handleBuyNow}
                relatedBooks={books.filter(b => b.category === selectedBook.category && b.id !== selectedBook.id).slice(0, 4)}
                onSelectRelatedBook={handleSelectBook}
                onOpenDigital={(product) => {
                  const entry = digitalCatalog.findById(product.id);
                  if (entry) openDigitalProduct(entry);
                }}
              />
            ) : activeSubSection === 'penulis' ? (
              <AuthorsListingView
                authors={authors}
                onSelectAuthor={handleSelectAuthor}
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
          <BlogView articles={siteContent.blogArticles} />
        )}

        {/* VIEW 8: KARIR */}
        {(activePage === 'karir' || activePage === 'career') && (
          <CareerView siteContent={siteContent} />
        )}

        {/* VIEW 9: KONTAK */}
        {activePage === 'kontak' && (
          <KontakView />
        )}

        {/* VIEW 12: PRODUK DIGITAL (DAFTAR, DETAIL, SAMPEL) */}
        {activePage === 'digital' && (
          activeSubSection === 'sample' ? (
            <DigitalSampleView
              entry={activeDigitalEntry}
              onNavigate={navigateTo}
              onBackToDetail={openDigitalProduct}
            />
          ) : digitalItem ? (
            <DigitalDetailView
              entry={activeDigitalEntry}
              format={digitalFormat}
              onNavigate={navigateTo}
              onOpenProduct={openDigitalProduct}
              onOpenSample={openDigitalSample}
              onOpenPrintBook={handleSelectBook}
            />
          ) : (
            <DigitalListingView
              key={digitalFormat}
              format={digitalFormat}
              onNavigate={navigateTo}
              onOpenProduct={openDigitalProduct}
              onOpenSample={openDigitalSample}
            />
          )
        )}

        {/* VIEW 13: KEANGGOTAAN, INSTITUSI, PUSTAKA SAYA */}
        {activePage === 'membership' && <MembershipView onNavigate={navigateTo} />}
        {activePage === 'institutions' && <InstitutionsView />}
        {activePage === 'library' && <LibraryView onNavigate={navigateTo} />}

        {/* VIEW 10: ADMIN DASHBOARD (CRUD & DEDICATED SIDEBAR) */}
        {activePage === 'admin' && (
          <AdminLoginGate onBackHome={() => navigateTo('beranda')}>
          <AdminDashboard
            books={books}
            orders={orders}
            authors={authors}
            onAddBook={handleAddBook}
            onUpdateBook={handleUpdateBook}
            onDeleteBook={handleDeleteBook}
            onAddAuthor={handleAddAuthor}
            onUpdateAuthor={handleUpdateAuthor}
            onDeleteAuthor={handleDeleteAuthor}
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
                  showNotification(t('toast.orderRecorded', { orderNumber: order.orderNumber }));
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
    </DigitalCatalogContext.Provider>
  );
}
