import React, { useState } from 'react';
import { 
  ArrowLeft,
  Plus, 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  Eye, 
  Upload, 
  Check, 
  X, 
  Layers, 
  BookOpen, 
  Book,
  DollarSign, 
  ShoppingBag, 
  RotateCcw, 
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Hash,
  Truck,
  Send,
  FileText,
  Clock,
  Bookmark,
  Globe,
  BarChart2,
  Sliders,
  TrendingUp,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Printer,
  FileDown,
  Barcode,
  Copy,
  CheckCircle,
  RefreshCw,
  Save,
  Users,
  UserPlus,
  GraduationCap,
  Building2,
  Award,
  Mail,
  Linkedin,
  Languages
} from 'lucide-react';
import { Book as BookType, BookCategory, Order, OrderStatus, SeoSettings, SiteContentSettings, Author } from '../types';
import i18n from '../i18n/index';
import { apiClient } from '../services/apiClient';
import { notificationService } from '../services/NotificationService';
import { resolveImageUrl, handleImageError } from '../utils/imageUtils';
import { toTitleCase } from '../utils/formatters';
import { generateCakraNexaTrackingNumber } from '../services/shippingService';
import { formatOrderDate } from '../utils/orderUtils';
import { SeoSettingsTab } from './SeoSettingsTab';
import { SeoAnalysisTab } from './SeoAnalysisTab';
import { ExecutiveAnalyticsDashboard } from './ExecutiveAnalyticsDashboard';
import { ShippingManagementTab } from './ShippingManagementTab';
import { PaymentManagementTab } from './PaymentManagementTab';
import { DigitalProductsTab } from './DigitalProductsTab';
import { InstitutionInquiriesTab } from './InstitutionInquiriesTab';
import { TabletSmartphone as DigitalProductsIcon, Building2 as InstitutionIcon } from 'lucide-react';
import { CmsDashboardManager } from './CmsDashboardManager';
import { ShippingLabelModal } from './ShippingLabelModal';
import { getStoredSeoSettings, saveStoredSeoSettings, DEFAULT_SEO_SETTINGS } from '../services/seoService';
import { getStoredSiteContent, saveStoredSiteContent, resetSiteContentToDefault } from '../services/siteContentService';
import { INITIAL_BOOKS } from '../data/booksData';
import { INITIAL_AUTHORS, INITIAL_BOOK_AUTHORS, authorNameKey } from '../data/authorsData';
import type { ContentTranslations, TranslatableLanguage } from '../i18n/localized';

// ---------- TERJEMAHAN KONTEN (EN / ZH) ----------
// Field terjemahan yang kosong tidak disimpan: situs publik lalu menampilkan versi Bahasa Indonesia.
type TranslationLang = TranslatableLanguage;
type Translations<F extends string, V = string> = ContentTranslations<F, V>;

const TRANSLATION_META: Record<TranslationLang, { label: string; suffix: string; languageName: string; htmlLang: string }> = {
  en: { label: 'English (EN)', suffix: '(EN)', languageName: 'Inggris', htmlLang: 'en' },
  zh: { label: '中文 (ZH)', suffix: '(中文)', languageName: 'Mandarin', htmlLang: 'zh-CN' }
};
const TRANSLATION_LANGUAGES = Object.keys(TRANSLATION_META) as TranslationLang[];

type BookTranslationField = 'name' | 'subtitle' | 'sinopsis';
type AuthorBioField = 'profile_education' | 'work_experience' | 'organization_seminar' | 'publications';
type BookTranslations = Translations<BookTranslationField>;
type AuthorBioTranslations = Translations<AuthorBioField>;

const AUTHOR_BIO_TRANSLATION_FIELDS: { field: AuthorBioField; label: string }[] = [
  { field: 'profile_education', label: 'Pendidikan' },
  { field: 'work_experience', label: 'Pengalaman Kerja' },
  { field: 'organization_seminar', label: 'Organisasi & Seminar' },
  { field: 'publications', label: 'Publikasi' }
];

/** Salin terjemahan lewat `normalize`; field bernilai undefined dan bahasa tanpa isi dibuang. */
const compactTranslations = <F extends string, In, Out>(
  source: Translations<F, In> | undefined,
  normalize: (value: In) => Out | undefined
): Translations<F, Out> => {
  const result: Translations<F, Out> = {};
  TRANSLATION_LANGUAGES.forEach((lang) => {
    const fields: Partial<Record<F, Out>> = {};
    (Object.entries(source?.[lang] ?? {}) as [F, In | undefined][]).forEach(([field, value]) => {
      if (value === undefined) return;
      const normalized = normalize(value);
      if (normalized !== undefined) fields[field] = normalized;
    });
    if (Object.keys(fields).length > 0) result[lang] = fields;
  });
  return result;
};

const trimTranslation = (value: string): string | undefined => value.trim() || undefined;
const bioToText = (value: string | string[]): string | undefined =>
  (Array.isArray(value) ? value.join('\n') : value) || undefined;

const hasTranslationContent = (fields: Record<string, unknown> | undefined): boolean =>
  Object.values(fields ?? {}).some((value) =>
    Array.isArray(value) ? value.some((item) => String(item).trim() !== '') : typeof value === 'string' && value.trim() !== ''
  );

const TranslationLanguageSwitch: React.FC<{
  value: TranslationLang;
  onChange: (lang: TranslationLang) => void;
  translations: Partial<Record<TranslationLang, Record<string, unknown>>> | undefined;
}> = ({ value, onChange, translations }) => (
  <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shrink-0">
    {TRANSLATION_LANGUAGES.map((lang) => (
      <button
        key={lang}
        type="button"
        onClick={() => onChange(lang)}
        className={`px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer transition-colors flex items-center gap-1 ${value === lang ? 'bg-[#0F172A] text-[#DFBF64]' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        {TRANSLATION_META[lang].label}
        {hasTranslationContent(translations?.[lang]) && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Sudah ada terjemahan" />
        )}
      </button>
    ))}
  </div>
);

interface AdminDashboardProps {
  books: BookType[];
  orders: Order[];
  authors?: Author[];
  // Handler penyimpanan mengembalikan pesan error server (atau null bila tersimpan).
  onAddBook: (book: BookType) => void | Promise<string | null>;
  onUpdateBook: (book: BookType) => void | Promise<string | null>;
  onDeleteBook: (id: string) => void | Promise<string | null>;
  onAddAuthor?: (author: Author) => void;
  onUpdateAuthor?: (author: Author) => void;
  onDeleteAuthor?: (id: string) => void | Promise<string | null>;
  onToggleBukuTerbaru: (id: string) => void;
  onResetSeedData: () => void;
  onViewBookDetail: (book: BookType) => void;
  onUpdateOrder?: (order: Order) => void;
  seoSettings?: SeoSettings;
  onUpdateSeoSettings?: (settings: SeoSettings) => void;
  siteContent?: SiteContentSettings;
  onUpdateSiteContent?: (content: SiteContentSettings) => void | Promise<string | null>;
  onNavigateHome?: () => void;
  onGoBack?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  books = [],
  orders = [],
  authors = [],
  onAddBook,
  onUpdateBook,
  onDeleteBook,
  onAddAuthor,
  onUpdateAuthor,
  onDeleteAuthor,
  onToggleBukuTerbaru,
  onResetSeedData,
  onViewBookDetail,
  onUpdateOrder,
  seoSettings,
  onUpdateSeoSettings,
  siteContent,
  onUpdateSiteContent,
  onNavigateHome,
  onGoBack
}) => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'inventory' | 'orders' | 'shipping' | 'payments' | 'cms' | 'seo-settings' | 'seo-analysis' | 'authors' | 'digital-products' | 'institution-inquiries'>('analytics');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // SEO State Management
  const [isSeoModalOpen, setIsSeoModalOpen] = useState(false);
  const [seoState, setSeoState] = useState<SeoSettings>(() => seoSettings || getStoredSeoSettings());

  // Site Content (CMS) State Management
  const [cmsContentState, setCmsContentState] = useState<SiteContentSettings>(() => siteContent || getStoredSiteContent());

  React.useEffect(() => {
    if (siteContent) {
      setCmsContentState(siteContent);
    }
  }, [siteContent]);

  // Status backend: peringatkan admin bila server berjalan tanpa database (perubahan tidak permanen).
  const [backendHealth, setBackendHealth] = useState<{ supabaseConnected?: boolean } | null>(null);
  React.useEffect(() => {
    apiClient.health().then(setBackendHealth);
  }, []);

  // Pesan WhatsApp pelanggan (NotificationService.formatCustomerWhatsAppMessage) dibuat dalam bahasa
  // pelanggan lewat i18n.getFixedT, yang membutuhkan terjemahan en/zh sudah dimuat.
  React.useEffect(() => {
    void i18n.loadLanguages(['en', 'zh']);
  }, []);

  /** Hasil disampaikan oleh CmsDashboardManager: pesan error server, atau null bila tersimpan. */
  const handleSaveSiteContent = async (newContent: SiteContentSettings): Promise<string | null> => {
    setCmsContentState(newContent);
    saveStoredSiteContent(newContent);
    const error = await onUpdateSiteContent?.(newContent);
    return typeof error === 'string' ? error : null;
  };

  const handleResetSiteContent = () => {
    const defaultData = resetSiteContentToDefault();
    setCmsContentState(defaultData);
    if (onUpdateSiteContent) {
      onUpdateSiteContent(defaultData);
    }
    showNotification('Seluruh konten website di-reset ke pengaturan standar.');
  };

  React.useEffect(() => {
    if (seoSettings) {
      setSeoState(seoSettings);
    }
  }, [seoSettings]);

  const handleSaveSeoSettings = (newSettings: SeoSettings) => {
    setSeoState(newSettings);
    if (onUpdateSeoSettings) {
      onUpdateSeoSettings(newSettings);
    }
    saveStoredSeoSettings(newSettings)
      .then(() => showNotification('Pengaturan SEO & Meta Tags berhasil disimpan & tersinkron ke server.'))
      .catch((err: any) => showNotification(`SEO tersimpan lokal, sinkron server gagal: ${err?.message || 'backend offline'}`));
  };

  const handleResetSeoSettings = () => {
    if (window.confirm('Kembalikan konfigurasi SEO ke template bawaan CakraNexa?')) {
      handleSaveSeoSettings(DEFAULT_SEO_SETTINGS);
      showNotification('Pengaturan SEO di-reset ke nilai default.');
    }
  };
  
  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<BookType | null>(null);
  const [isSavingBook, setIsSavingBook] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Authors Management state
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [editingAuthor, setEditingAuthor] = useState<Author | null>(null);
  const [authorDeleteConfirmId, setAuthorDeleteConfirmId] = useState<string | null>(null);
  const [authorSearchQuery, setAuthorSearchQuery] = useState('');
  const [isSavingAllAuthors, setIsSavingAllAuthors] = useState(false);
  const [tempAuthorPhotoPreview, setTempAuthorPhotoPreview] = useState<string | null>(null);
  const [selectedAuthorBookIds, setSelectedAuthorBookIds] = useState<Set<string>>(new Set());
  const [initialAuthorBookIds, setInitialAuthorBookIds] = useState<Set<string>>(new Set());
  const [isSavingAuthor, setIsSavingAuthor] = useState(false);
  const [authorForm, setAuthorForm] = useState<{
    name: string;
    academic_titles: string;
    photo_url: string;
    scopus_id: string;
    orcid_id: string;
    linkedin_url: string;
    email: string;
    profile_education: string;
    work_experience: string;
    organization_seminar: string;
    publications: string;
    /** Terjemahan bio per bahasa, format teks sama dengan field Indonesia (1 poin = 1 baris). */
    i18n: AuthorBioTranslations;
  }>({
    name: '',
    academic_titles: '',
    photo_url: '',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: '',
    profile_education: '',
    work_experience: '',
    organization_seminar: '',
    publications: '',
    i18n: {}
  });
  const [authorTranslationLang, setAuthorTranslationLang] = useState<TranslationLang>('en');

  const updateAuthorTranslation = (lang: TranslationLang, field: AuthorBioField, value: string) => {
    setAuthorForm((prev) => {
      const translations: AuthorBioTranslations = { ...prev.i18n };
      const fields = { ...translations[lang] };
      fields[field] = value;
      translations[lang] = fields;
      return { ...prev, i18n: translations };
    });
  };

  // Orders Management state
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [viewingProofOrder, setViewingProofOrder] = useState<Order | null>(null);
  const [editingTrackingOrderId, setEditingTrackingOrderId] = useState<string | null>(null);
  const [editingTrackingValue, setEditingTrackingValue] = useState<string>('');
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);
  const [shippingLabelOrder, setShippingLabelOrder] = useState<Order | null>(null);

  const handleOpenShippingLabel = (order: Order) => {
    setShippingLabelOrder(order);
  };

  const handleCopyTrackingNumber = (orderId: string, trackingNum: string) => {
    navigator.clipboard.writeText(trackingNum);
    setCopiedTrackingId(orderId);
    setTimeout(() => setCopiedTrackingId(null), 2000);
  };

  const handleUpdateTrackingFromLabel = (orderId: string, newTracking: string) => {
    const target = (orders || []).find(o => o.id === orderId);
    if (target && onUpdateOrder) {
      const updated: Order = {
        ...target,
        trackingNumber: newTracking,
        paymentStatus: 'shipped' // Status auto-update: Changing/inputting tracking automatically updates to "Dikirim"
      };
      onUpdateOrder(updated);
      if (shippingLabelOrder && shippingLabelOrder.id === orderId) {
        setShippingLabelOrder(updated);
      }
      showNotification(`Nomor resi ${newTracking} berhasil disimpan. Status pesanan diubah menjadi DIKIRIM.`);
    }
  };

  const handleStatusChange = (order: Order, newStatus: OrderStatus) => {
    const updated: Order = { ...order, paymentStatus: newStatus };
    if (onUpdateOrder) {
      onUpdateOrder(updated);
    }
    showNotification(`Status pesanan ${order?.orderNumber || 'transaksi'} diubah menjadi ${newStatus.toUpperCase()}`);
  };

  const handleSaveTracking = (order: Order, customVal?: string) => {
    const finalTracking = (customVal !== undefined ? customVal : editingTrackingValue).trim();
    const updated: Order = {
      ...order,
      trackingNumber: finalTracking || undefined,
      paymentStatus: finalTracking ? 'shipped' : order?.paymentStatus || 'processing' // Auto-update to shipped when resi entered
    };
    if (onUpdateOrder) {
      onUpdateOrder(updated);
    }
    setEditingTrackingOrderId(null);
    if (finalTracking) {
      showNotification(`Nomor resi ${finalTracking} berhasil disimpan. Status pesanan diubah menjadi DIKIRIM.`);
    } else {
      showNotification(`Nomor resi untuk ${order?.orderNumber || 'pesanan'} dihapus.`);
    }
  };

  const handleGenerateAutoTracking = (order: Order) => {
    const autoResi = generateCakraNexaTrackingNumber();
    const updated: Order = {
      ...order,
      trackingNumber: autoResi,
      paymentStatus: 'shipped' // Auto-update to shipped
    };
    if (onUpdateOrder) {
      onUpdateOrder(updated);
    }
    showNotification(`Nomor resi otomatis ${autoResi} dibuat. Status pesanan diubah menjadi DIKIRIM.`);
  };

  const handleDispatchWhatsApp = async (order: Order) => {
    await notificationService.dispatchWhatsAppToAdmin(order);
    const phone = order?.customer?.phone || '';
    const url = notificationService.getWhatsAppDispatchUrl(
      phone,
      notificationService.formatCustomerWhatsAppMessage(order)
    );
    window.open(url, '_blank');
    showNotification(`Notifikasi WhatsApp untuk ${order?.customer?.name || 'Pelanggan'} telah disiapkan.`);
  };

  const handleDispatchEmail = async (order: Order) => {
    await notificationService.dispatchEmailReceipt(order);
    showNotification(`Email faktur resmi telah dikirim ke SMTP relay untuk ${order?.customer?.email || 'Pelanggan'}`);
  };

  // Form input state
  const [formData, setFormData] = useState<Partial<BookType>>({
    name: '',
    subtitle: '',
    coverQuote: '',
    slug: '',
    author: 'Scientia Integritas Utama',
    category: 'Perpajakan',
    isbn: '978-623-8120-XX-X',
    tahunTerbit: 2026,
    jumlahHalaman: 350,
    ukuranBuku: '15.5 x 23 cm (UNESCO B5)',
    harga: 215000,
    sinopsis: '',
    linkPembelian: '#',
    bukuTerbaru: false,
    penerbit: 'PT Scientia Integritas Utama',
    coverBuku: '',
    stock: 50
  });
  const [bookTranslationLang, setBookTranslationLang] = useState<TranslationLang>('en');
  const bookTranslations = (formData.i18n ?? {}) as BookTranslations;

  const updateBookTranslation = (lang: TranslationLang, field: BookTranslationField, value: string) => {
    setFormData((prev) => {
      const translations: BookTranslations = { ...(prev.i18n as BookTranslations | undefined) };
      const fields = { ...translations[lang] };
      fields[field] = value;
      translations[lang] = fields;
      return { ...prev, i18n: translations };
    });
  };

  const categories: BookCategory[] = [
    'Perpajakan', 
    'Akuntansi', 
    'Hukum', 
    'Ekonomi & Bisnis', 
    'Filsafat', 
    'Teologia'
  ];

  const PENERBIT_OPTIONS = [
    'PT Scientia Integritas Utama',
    'PT Cakrawala Magna Scientia'
  ];

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Safe book filtering
  const filteredBooks = (books || []).filter(b => {
    if (!b) return false;
    const matchesSearch = 
      (b?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b?.author || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b?.isbn || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || b?.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Calculate stats safely
  const totalInventoryValue = (books || []).reduce((acc, curr) => acc + ((curr?.harga || 0) * (curr?.stock || 0)), 0);

  const handleOpenCreateModal = () => {
    setEditingBook(null);
    setFormData({
      name: '',
      subtitle: '',
      coverQuote: '',
      slug: '',
      author: 'Scientia Integritas Utama',
      category: 'Perpajakan',
      isbn: '',
      tahunTerbit: new Date().getFullYear(),
      jumlahHalaman: 0,
      ukuranBuku: '15.5 x 23 cm (UNESCO B5)',
      harga: 210000,
      sinopsis: '',
      linkPembelian: '#',
      bukuTerbaru: true,
      penerbit: 'PT Scientia Integritas Utama',
      coverBuku: '',
      stock: 50,
      i18n: {}
    });
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (book: BookType) => {
    if (!book) return;
    setEditingBook(book);
    setFormData({ ...book });
    setIsFormModalOpen(true);
  };

  // ---------- AUTHORS CRUD HELPERS ----------
  const handleOpenCreateAuthor = () => {
    setEditingAuthor(null);
    setAuthorForm({
      name: '',
      academic_titles: '',
      photo_url: '',
      scopus_id: '',
      orcid_id: '',
      linkedin_url: '',
      email: '',
      profile_education: '',
      work_experience: '',
      organization_seminar: '',
      publications: '',
      i18n: {}
    });
    setTempAuthorPhotoPreview(null);
    setSelectedAuthorBookIds(new Set());
    setInitialAuthorBookIds(new Set());
    setShowAuthorModal(true);
  };

  const handleOpenEditAuthor = (author: Author) => {
    if (!author) return;
    setEditingAuthor(author);
    setAuthorForm({
      name: author.name || '',
      academic_titles: author.academic_titles || '',
      photo_url: author.photo_url || '',
      scopus_id: author.scopus_id || '',
      orcid_id: author.orcid_id || '',
      linkedin_url: author.linkedin_url || '',
      email: author.email || '',
      profile_education: Array.isArray(author.profile_education) ? author.profile_education.join('\n') : author.profile_education || '',
      work_experience: Array.isArray(author.work_experience) ? author.work_experience.join('\n') : author.work_experience || '',
      organization_seminar: Array.isArray(author.organization_seminar) ? author.organization_seminar.join('\n') : author.organization_seminar || '',
      publications: Array.isArray(author.publications) ? author.publications.join('\n') : author.publications || '',
      i18n: compactTranslations<AuthorBioField, string | string[], string>(author.i18n, bioToText)
    });
    setTempAuthorPhotoPreview(author.photo_url || null);
    const existingIds = new Set<string>();
    (author.books || []).forEach((b: any) => existingIds.add(typeof b === 'object' ? b.id : b));
    if (existingIds.size === 0) {
      // Daftar penulis dari server tidak memuat relasi buku; pakai relasi bawaan agar checklist tidak tampil kosong.
      const seedAuthor = INITIAL_AUTHORS.find((a) => a.id === author.id || authorNameKey(a.name) === authorNameKey(author.name || ''));
      INITIAL_BOOK_AUTHORS.filter((r) => r.author_id === seedAuthor?.id).forEach((r) => existingIds.add(r.book_id));
    }
    setSelectedAuthorBookIds(existingIds);
    setInitialAuthorBookIds(new Set(existingIds));
    setShowAuthorModal(true);
  };

  const handleAuthorPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!['image/png', 'image/jpeg'].includes(file.type)) {
        alert('Foto penulis harus berformat JPG/JPEG atau PNG.');
        e.target.value = '';
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        alert('Ukuran file foto penulis maksimal 2MB.');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setTempAuthorPhotoPreview(dataUrl);
        setAuthorForm({ ...authorForm, photo_url: dataUrl });
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleAuthorBook = (bookId: string) => {
    const next = new Set(selectedAuthorBookIds);
    if (next.has(bookId)) next.delete(bookId);
    else next.add(bookId);
    setSelectedAuthorBookIds(next);
  };

  const handleSaveAllAuthors = async () => {
    if (!authors.length) {
      showNotification('Tidak ada data penulis untuk disimpan.');
      return;
    }
    setIsSavingAllAuthors(true);
    authors.forEach((author) => onUpdateAuthor?.(author));
    const results = await Promise.allSettled(authors.map((author) => apiClient.saveAuthor(author, 'update')));
    const savedAuthors = results
      .filter((result): result is PromiseFulfilledResult<Author> => result.status === 'fulfilled')
      .map((result) => result.value);
    // Server bisa memberi UUID baru untuk penulis bawaan; terapkan agar penyimpanan berikutnya memakai id itu.
    savedAuthors.forEach((author) => onUpdateAuthor?.(author));
    setIsSavingAllAuthors(false);
    const failedCount = results.length - savedAuthors.length;
    showNotification(failedCount === 0
      ? `${savedAuthors.length} data penulis berhasil disimpan ke server.`
      : `${savedAuthors.length} tersimpan, ${failedCount} gagal. Periksa login admin/backend.`);
  };

  const handleSaveAuthor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingAuthor) return;
    if (!authorForm.name.trim()) {
      alert('Nama penulis wajib diisi.');
      return;
    }
    const parseBio = (raw: string): string[] | string => {
      const arr = raw.split('\n').map(l => l.trim()).filter(Boolean);
      return arr.length > 0 ? arr : '';
    };
    const profile = {
      name: authorForm.name.trim(),
      academic_titles: authorForm.academic_titles.trim(),
      photo_url: tempAuthorPhotoPreview || authorForm.photo_url || '',
      scopus_id: authorForm.scopus_id.trim() || undefined,
      orcid_id: authorForm.orcid_id.trim() || undefined,
      linkedin_url: authorForm.linkedin_url.trim() || undefined,
      email: authorForm.email.trim() || undefined,
      profile_education: parseBio(authorForm.profile_education) as any,
      work_experience: parseBio(authorForm.work_experience) as any,
      organization_seminar: parseBio(authorForm.organization_seminar) as any,
      publications: parseBio(authorForm.publications) as any,
      // Selalu dikirim (bisa {}), agar terjemahan yang dikosongkan admin ikut terhapus di server.
      i18n: compactTranslations(authorForm.i18n, (raw: string) => {
        const parsed = parseBio(raw);
        return parsed === '' ? undefined : parsed;
      })
    };
    const payload: Author = editingAuthor
      ? { ...editingAuthor, ...profile }
      : {
          id: crypto?.randomUUID ? crypto.randomUUID() : `auth-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          ...profile,
          created_at: new Date().toISOString()
        };

    // Daftar penulis baru diperbarui setelah server menyimpan; bila gagal, modal tetap terbuka untuk disimpan ulang.
    setIsSavingAuthor(true);
    let savedAuthor: Author;
    try {
      savedAuthor = await apiClient.saveAuthor(payload, editingAuthor ? 'update' : 'create');
    } catch (err) {
      setIsSavingAuthor(false);
      showNotification(`Data penulis GAGAL disimpan ke server: ${err instanceof Error ? err.message : 'server tidak dapat dihubungi'}`);
      return;
    }
    if (editingAuthor) onUpdateAuthor?.(savedAuthor);
    else onAddAuthor?.(savedAuthor);

    // Relasi buku hanya dikirim bila checklist diubah, agar relasi yang sudah ada tidak terhapus.
    const bookIdsArr = [...selectedAuthorBookIds];
    const booksChanged = bookIdsArr.length !== initialAuthorBookIds.size || bookIdsArr.some((id) => !initialAuthorBookIds.has(id));
    const relationsSaved = !booksChanged || await apiClient.setAuthorBooks(savedAuthor.id, bookIdsArr);
    setIsSavingAuthor(false);
    showNotification(`${editingAuthor ? `Data penulis ${savedAuthor.name} berhasil diperbarui.` : `Penulis baru ${savedAuthor.name} berhasil ditambahkan.`}${relationsSaved ? '' : ' Namun relasi buku gagal disimpan.'}`);
    setShowAuthorModal(false);
    setEditingAuthor(null);
    setTempAuthorPhotoPreview(null);
  };

  const handleDeleteAuthor = async (id: string, alreadyConfirmed = false) => {
    const target = (authors || []).find(a => a.id === id);
    if (alreadyConfirmed || window.confirm(`Hapus penulis "${target?.name || id}" dari daftar penulis & kontributor? Aksi ini tidak bisa dibatalkan.`)) {
      const error = await onDeleteAuthor?.(id);
      showNotification(error
        ? `Penulis GAGAL dihapus di server: ${error}`
        : `Penulis ${target?.name || ''} berhasil dihapus.`);
    }
    setAuthorDeleteConfirmId(null);
  };
  // ---------- END AUTHORS CRUD HELPERS ----------

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Ukuran file cover maksimal 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, coverBuku: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingBook) return;
    if (!formData.name) {
      alert('Nama buku wajib diisi.');
      return;
    }

    const sanitizedTitle = toTitleCase(formData.name.trim());
    const slug = formData.slug || sanitizedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    // ISBN boleh kosong (buku Segera Terbit); harga 0 = "Harga menyusul".
    const isbn = (formData.isbn || '').trim();
    const harga = Math.max(0, Number(formData.harga) || 0);
    // Hanya terjemahan yang terisi; {} bila tidak ada (situs memakai versi Bahasa Indonesia).
    const bookI18n = compactTranslations<BookTranslationField, string, string>(formData.i18n, trimTranslation);

    if (editingBook) {
      const updated: BookType = {
        ...editingBook,
        ...formData,
        slug,
        name: sanitizedTitle,
        title: sanitizedTitle,
        author: formData.author || 'Scientia Integritas Utama',
        category: (formData.category as BookCategory) || 'Perpajakan',
        isbn,
        tahunTerbit: Number(formData.tahunTerbit) || editingBook.tahunTerbit || new Date().getFullYear(),
        jumlahHalaman: Math.max(0, Number(formData.jumlahHalaman) || 0), // 0 = baris halaman disembunyikan
        ukuranBuku: formData.ukuranBuku || editingBook.ukuranBuku || '15.5 x 23 cm',
        harga,
        originalHarga: formData.originalHarga ? Number(formData.originalHarga) : undefined,
        discountPercentage: formData.discountPercentage ? Number(formData.discountPercentage) : undefined,
        releaseDate: formData.releaseDate || undefined,
        scheduledUpload: formData.scheduledUpload || undefined,
        sinopsis: formData.sinopsis || '',
        linkPembelian: formData.linkPembelian || editingBook.linkPembelian || '#',
        bukuTerbaru: Boolean(formData.bukuTerbaru),
        penerbit: formData.penerbit || 'PT Scientia Integritas Utama',
        coverBuku: formData.coverBuku || editingBook.coverBuku || '',
        i18n: bookI18n
      };
      setIsSavingBook(true);
      const error = await onUpdateBook(updated);
      setIsSavingBook(false);
      if (error) {
        showNotification(`Buku "${updated.name}" GAGAL disimpan ke server: ${error}`);
        return; // form tetap terbuka agar bisa disimpan ulang
      }
      showNotification(`Buku "${updated.name}" berhasil disimpan ke server.`);
    } else {
      const newBook: BookType = {
        id: `book-${Date.now()}`,
        name: sanitizedTitle,
        title: sanitizedTitle,
        slug,
        author: formData.author || 'Scientia Integritas Utama',
        category: (formData.category as BookCategory) || 'Perpajakan',
        isbn,
        tahunTerbit: Number(formData.tahunTerbit) || new Date().getFullYear(),
        jumlahHalaman: Math.max(0, Number(formData.jumlahHalaman) || 0),
        ukuranBuku: formData.ukuranBuku || '15.5 x 23 cm',
        harga,
        originalHarga: formData.originalHarga ? Number(formData.originalHarga) : undefined,
        discountPercentage: formData.discountPercentage ? Number(formData.discountPercentage) : undefined,
        releaseDate: formData.releaseDate || '2026-06-01',
        scheduledUpload: formData.scheduledUpload || undefined,
        sinopsis: formData.sinopsis || 'Sinopsis monografi ilmiah PT Scientia Integritas Utama.',
        linkPembelian: formData.linkPembelian || '#',
        bukuTerbaru: Boolean(formData.bukuTerbaru),
        penerbit: formData.penerbit || 'PT Scientia Integritas Utama',
        coverBuku: formData.coverBuku || '',
        stock: formData.stock !== undefined && formData.stock !== null && String(formData.stock) !== '' ? Number(formData.stock) : undefined,
        rating: 5.0,
        reviewsCount: 1,
        i18n: bookI18n
      };
      setIsSavingBook(true);
      const error = await onAddBook(newBook);
      setIsSavingBook(false);
      if (error) {
        showNotification(`Buku baru "${newBook.name}" GAGAL disimpan ke server: ${error}`);
        return;
      }
      showNotification(`Buku baru "${newBook.name}" berhasil disimpan ke server.`);
    }
    setIsFormModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmId) {
      const error = await onDeleteBook(deleteConfirmId);
      showNotification(error
        ? `Buku dihapus dari tampilan, tetapi GAGAL dihapus di server: ${error}`
        : 'Buku berhasil dihapus dari server.');
      setDeleteConfirmId(null);
    }
  };

  return (
    <div 
      id="admin-dashboard-container" 
      className="min-h-screen bg-slate-50 text-slate-900 flex text-left relative overflow-x-hidden"
    >
      
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-lg bg-slate-900 text-[#DFBF64] border border-slate-700 shadow-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* MOBILE BACKDROP OVERLAY */}
      {isMobileSidebarOpen && (
        <div 
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/60 z-30 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* FIXED-LEFT SIDEBAR (w-64 bg-slate-900 text-slate-300 min-h-screen fixed left-0 top-0 z-40) */}
      <aside className={`fixed top-0 bottom-0 left-0 w-64 bg-slate-900 text-slate-300 z-40 flex flex-col justify-between border-r border-slate-800 transition-transform duration-200 ease-in-out ${
        isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        {/* Top Brand Header */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#D4AF37] text-slate-950 font-black flex items-center justify-center text-sm tracking-tighter shrink-0 shadow-sm">
                CN
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-white tracking-wide truncate">CakraNexa</div>
                <div className="text-[10px] text-[#D4AF37] font-semibold tracking-wider uppercase truncate">Portal Admin</div>
              </div>
            </div>
            {/* Close on mobile */}
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="mt-3 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700/60 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="truncate">Penerbit Resmi IKAPI</span>
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-2 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Menu Utama
          </div>

          {/* 1. Executive Analytics */}
          <button
            id="sidebar-btn-analytics"
            onClick={() => { setActiveTab('analytics'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LayoutDashboard className={`w-4 h-4 ${activeTab === 'analytics' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>Executive Analytics</span>
            </div>
          </button>

          {/* 2. Katalog & Inventaris */}
          <button
            id="sidebar-btn-inventory"
            onClick={() => { setActiveTab('inventory'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className={`w-4 h-4 ${activeTab === 'inventory' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>Katalog & Inventaris</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
              {(books || []).length}
            </span>
          </button>

          {/* 2b. Penulis & Kontributor */}
          <button
            id="sidebar-btn-authors"
            onClick={() => { setActiveTab('authors'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'authors'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Users className={`w-4 h-4 ${activeTab === 'authors' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>Penulis &amp; Kontributor</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
              {(authors || []).length}
            </span>
          </button>

          {/* 3. Pesanan & Dispatcher */}
          <button
            id="sidebar-btn-orders"
            onClick={() => { setActiveTab('orders'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'orders'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShoppingBag className={`w-4 h-4 ${activeTab === 'orders' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>Pesanan & Dispatcher</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
              {(orders || []).length}
            </span>
          </button>

          {/* 4. Management Pengiriman */}
          <button
            id="sidebar-btn-shipping"
            onClick={() => { setActiveTab('shipping'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'shipping'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Truck className={`w-4 h-4 ${activeTab === 'shipping' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>Management Pengiriman</span>
            </div>
          </button>

          {/* 5. Management Pembayaran */}
          <button
            id="sidebar-btn-payments"
            onClick={() => { setActiveTab('payments'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'payments'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CreditCard className={`w-4 h-4 ${activeTab === 'payments' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>Management Pembayaran</span>
            </div>
          </button>

          {/* 6. Manajemen Konten & Menu (CMS) */}
          <button
            id="sidebar-btn-cms"
            onClick={() => { setActiveTab('cms'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'cms'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Layers className={`w-4 h-4 ${activeTab === 'cms' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>Konten & Menu (CMS)</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
              Realtime
            </span>
          </button>

          <div className="pt-4 px-2 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Produk Digital
          </div>

          {/* Produk Digital (E-Book & Audiobook) */}
          <button
            id="sidebar-btn-digital-products"
            onClick={() => { setActiveTab('digital-products'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'digital-products'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <DigitalProductsIcon className={`w-4 h-4 ${activeTab === 'digital-products' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>Produk Digital</span>
            </div>
          </button>

          {/* Permintaan Institusi (/institutions) */}
          <button
            id="sidebar-btn-institution-inquiries"
            onClick={() => { setActiveTab('institution-inquiries'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'institution-inquiries'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <InstitutionIcon className={`w-4 h-4 ${activeTab === 'institution-inquiries' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>Permintaan Institusi</span>
            </div>
          </button>

          <div className="pt-4 px-2 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Optimasi & SEO
          </div>

          {/* 7. SEO / Meta Settings */}
          <button
            id="sidebar-btn-seo-settings"
            onClick={() => { setActiveTab('seo-settings'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'seo-settings'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Globe className={`w-4 h-4 ${activeTab === 'seo-settings' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>SEO / Meta Settings</span>
            </div>
          </button>

          {/* 8. Audit SEO & Analytics */}
          <button
            id="sidebar-btn-seo-analysis"
            onClick={() => { setActiveTab('seo-analysis'); setIsMobileSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'seo-analysis'
                ? 'bg-slate-800 text-[#DFBF64] font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Search className={`w-4 h-4 ${activeTab === 'seo-analysis' ? 'text-[#DFBF64]' : 'text-slate-400'}`} />
              <span>Audit SEO & Analytics</span>
            </div>
          </button>
        </div>

        {/* Sidebar Footer: Profile & Logout */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-[#DFBF64] font-bold text-xs flex items-center justify-center shrink-0">
              AD
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">Administrator Redaksi</div>
              <div className="text-[10px] text-slate-400 truncate">PT Cakrawala Magna Scientia</div>
            </div>
          </div>
          
          <button
            type="button"
            id="sidebar-btn-logout"
            onClick={onNavigateHome}
            className="w-full py-2 px-3 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            <span>Kembali ke Toko</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER SHIFTED RIGHT (ml-0 md:ml-64 w-full) */}
      <main className="flex-1 md:ml-64 min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Mobile Header Bar */}
        <div className="md:hidden flex items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2">
            <button
              id="admin-mobile-btn-back"
              onClick={onGoBack || onNavigateHome}
              className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              title="Kembali ke halaman sebelumnya (1 step)"
            >
              <ArrowLeft className="w-5 h-5 text-[#DFBF64]" />
            </button>
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              title="Buka Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
          <div className="text-xs font-semibold text-slate-900 truncate max-w-[150px]">
            {activeTab === 'analytics' && 'Executive Analytics'}
            {activeTab === 'inventory' && 'Katalog & Inventaris'}
            {activeTab === 'authors' && 'Penulis & Kontributor'}
            {activeTab === 'orders' && 'Pesanan & Dispatcher'}
            {activeTab === 'shipping' && 'Management Pengiriman'}
            {activeTab === 'payments' && 'Management Pembayaran'}
            {activeTab === 'cms' && 'Konten & Menu (CMS)'}
            {activeTab === 'seo-settings' && 'SEO / Meta Settings'}
            {activeTab === 'seo-analysis' && 'Audit SEO & Analytics'}
            {activeTab === 'digital-products' && 'Produk Digital'}
            {activeTab === 'institution-inquiries' && 'Permintaan Institusi'}
          </div>
          <button
            onClick={onNavigateHome}
            className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
            title="Kembali ke Toko"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {backendHealth?.supabaseConnected === false && (
          <div role="alert" className="p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-xs leading-relaxed">
            <p className="font-bold text-sm">Database belum terhubung: perubahan tidak permanen</p>
            <p className="mt-1">
              Server berjalan tanpa Supabase, sehingga perubahan buku, penulis, dan konten CMS hanya tersimpan di memori server
              dan kembali ke data bawaan setiap kali server Render tidur/restart. Isi <strong>SUPABASE_URL</strong> dan{' '}
              <strong>SUPABASE_SERVICE_ROLE_KEY</strong> di Environment Render, lalu deploy ulang.
            </p>
          </div>
        )}

        {/* Global Page Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <button
                id="admin-btn-back-step"
                onClick={onGoBack || onNavigateHome}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-700 hover:text-[#0F172A] border border-slate-300 text-xs font-semibold transition-all shadow-xs cursor-pointer group"
                title="Kembali ke halaman sebelumnya (1 step)"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#DFBF64] group-hover:-translate-x-0.5 transition-transform" />
                <span>Kembali ke Halaman Sebelumnya</span>
              </button>
              <span className="text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                PT CAKRAWALA MAGNA SCIENTIA
              </span>
              <span className="text-xs text-slate-500 font-medium">Portal Redaksi & Toko</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
              {activeTab === 'analytics' && 'Executive Analytics & Performance'}
              {activeTab === 'inventory' && 'Katalog & Inventaris Buku'}
              {activeTab === 'authors' && 'Manajemen Penulis & Kontributor'}
              {activeTab === 'orders' && 'Pesanan & Dispatcher Penjualan'}
              {activeTab === 'shipping' && 'Management Pengiriman & Ekspedisi'}
              {activeTab === 'payments' && 'Management Pembayaran & Rekening Bank'}
              {activeTab === 'cms' && 'Manajemen Konten & Menu (CMS Beranda & Ticker)'}
              {activeTab === 'seo-settings' && 'Pengaturan SEO & Meta Tags Google'}
              {activeTab === 'seo-analysis' && 'Audit Checklist On-Page SEO'}
              {activeTab === 'digital-products' && 'Produk Digital: E-Book & Audiobook'}
              {activeTab === 'institution-inquiries' && 'Permintaan Institution & Library Network'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeTab === 'analytics' && 'Laporan eksekutif metrik penjualan, tren volume, dan performa redaksi.'}
              {activeTab === 'inventory' && 'Kelola katalog buku akademik, status Buku Terbaru (Featured), dan data ISBN.'}
              {activeTab === 'authors' && 'Kelola database penulis, gelar akademik, foto profil, biografi, dan relasi buku karya.'}
              {activeTab === 'orders' && 'Verifikasi bukti transfer, dispatch faktur email, dan input nomor resi pengiriman.'}
              {activeTab === 'shipping' && 'Konfigurasi tarif kurir logistik (JNE, SiCepat, POS, J&T) dan free shipping promo.'}
              {activeTab === 'payments' && 'Kelola nomor rekening resmi perusahaan PT Cakrawala Magna Scientia & QRIS.'}
              {activeTab === 'cms' && 'Kustomisasi Best Seller running ticker, hero banner, menu navigasi, kontak footer, dan semua section secara dinamis & real-time.'}
              {activeTab === 'seo-settings' && 'Kustomisasi title tag, meta description, Open Graph, dan Google Search preview.'}
              {activeTab === 'seo-analysis' && 'Audit kepatuhan SEO on-page, skor kesehatan, dan rekomendasi optimasi web.'}
              {activeTab === 'digital-products' && 'Kelola harga satuan, status, tanggal masuk Digital Reading Shelf, dan file sampel e-book & audiobook.'}
              {activeTab === 'institution-inquiries' && 'Daftar permintaan penawaran dari halaman /institutions beserta status tindak lanjutnya.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'authors' && (
              <>
                <button
                  id="btn-admin-create-author"
                  onClick={handleOpenCreateAuthor}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F172A] text-[#DFBF64] hover:bg-slate-800 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer border border-[#D4AF37]/40"
                >
                  <UserPlus className="w-4 h-4 stroke-[2.5]" />
                  <span>Tambah Penulis Baru</span>
                </button>
              </>
            )}
            {activeTab === 'inventory' && (
              <>
                <button
                  id="btn-admin-reset-seed"
                  onClick={() => {
                    if (window.confirm('Kembalikan katalog ke 17 judul resmi (sesuai dokumen redaksi)?')) {
                      onResetSeedData();
                      showNotification('Data buku berhasil di-reset ke 17 judul resmi.');
                    }
                  }}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Reset ke 17 judul resmi"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset Seed</span>
                </button>

                <button
                  id="btn-admin-create-book"
                  onClick={handleOpenCreateModal}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-[#DFBF64] hover:bg-slate-800 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Tambah Buku</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Metric Cards for Inventory & General Catalog Management */}
        {(activeTab === 'inventory' || activeTab === 'orders') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeIn">
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
                <span>Total Judul Buku</span>
                <BookOpen className="w-4 h-4 text-slate-700" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {(books || []).length}
              </div>
              <span className="text-xs text-emerald-600 font-medium mt-1 block">Semua ber-ISBN resmi</span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
                <span>Buku Terbaru</span>
                <Bookmark className="w-4 h-4 text-slate-700" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {(books || []).filter(b => b?.bukuTerbaru).length}
              </div>
              <span className="text-xs text-slate-500 font-medium mt-1 block">Ditampilkan di beranda</span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
                <span>Pesanan Masuk</span>
                <ShoppingBag className="w-4 h-4 text-slate-700" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {(orders || []).length}
              </div>
              <span className="text-xs text-slate-500 font-medium mt-1 block">Transaksi checkout pembeli</span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
                <span>Valuasi Stok Buku</span>
                <DollarSign className="w-4 h-4 text-slate-700" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono truncate">
                Rp {(totalInventoryValue / 1000000).toFixed(1)} Jt
              </div>
              <span className="text-xs text-slate-500 font-medium mt-1 block">Total nilai eksemplar fisik</span>
            </div>
          </div>
        )}

      {/* INVENTORY TAB CONTENT */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          
          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari judul, penulis, atau ISBN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                id="admin-category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs py-2 px-3 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:border-slate-800 cursor-pointer w-full sm:w-auto"
              >
                <option value="all">Semua Kategori ({(books || []).length})</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} ({(books || []).filter(b => b?.category === cat).length})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Book Inventory Table Container - Figma Standard Card */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[760px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Buku & ISBN</th>
                    <th className="py-3.5 px-4 font-semibold">Kategori</th>
                    <th className="py-3.5 px-4 font-semibold">Penerbit</th>
                    <th className="py-3.5 px-4 font-semibold">Harga (IDR)</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Tahun / Hlm</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Buku Terbaru</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Aksi Manajemen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredBooks.map((book) => (
                    <tr key={book?.id} className="hover:bg-slate-50/80 transition-colors">
                      
                      {/* Title, Cover & ISBN */}
                      <td className="py-3.5 px-4 max-w-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-14 flex-shrink-0 book-shadow rounded overflow-hidden bg-slate-800">
                            <img 
                              src={resolveImageUrl(book?.coverBuku, 'book', book?.id)} 
                              alt={book?.name || 'Cover'} 
                              onError={(e) => handleImageError(e, {
                                title: book?.name,
                                author: book?.author,
                                category: book?.category,
                                isbn: book?.isbn
                              }, 'book')}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover" 
                            />
                          </div>
                          <div className="truncate">
                            <div 
                              onClick={() => onViewBookDetail(book)}
                              className="font-semibold text-slate-900 hover:text-[#9A7B38] cursor-pointer truncate max-w-xs transition-colors"
                              title={toTitleCase(book?.title || book?.name)}
                            >
                              {toTitleCase(book?.title || book?.name) || '-'}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                              <span>ISBN: {book?.isbn || '-'}</span>
                              <span>•</span>
                              <span className="truncate max-w-[140px]">{book?.author || '-'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                          {book?.category || 'Katalog'}
                        </span>
                      </td>

                      {/* Penerbit */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-[11px]">
                        {book?.penerbit ? (
                          <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold ${
                            book.penerbit === 'PT Scientia Integritas Utama'
                              ? 'bg-[#DFBF64]/10 text-[#8a6e16] border-[#D4AF37]/40'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {book.penerbit.replace('PT ', '')}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        Rp {book?.harga ? book.harga.toLocaleString('id-ID') : '0'}
                      </td>

                      {/* Specs */}
                      <td className="py-3.5 px-4 text-center text-slate-600 font-mono whitespace-nowrap">
                        {book?.tahunTerbit || 2026} / {book?.jumlahHalaman || 300} hlm
                      </td>

                      {/* Toggle Switch Buku Terbaru & Scheduling */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            id={`toggle-terbaru-${book?.id}`}
                            onClick={() => onToggleBukuTerbaru(book?.id)}
                            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              book?.bukuTerbaru ? 'bg-emerald-600' : 'bg-slate-300'
                            }`}
                            title="Klik untuk mengubah status buku terbaru"
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                book?.bukuTerbaru ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          {book?.releaseDate && (
                            <span className="text-[9px] font-mono text-slate-500 block">
                              {book.scheduledUpload ? 'Terjadwal: ' : 'Rilis: '} {book.releaseDate}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            id={`btn-admin-view-${book?.id}`}
                            onClick={() => onViewBookDetail(book)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Lihat Tampilan Pembeli"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            id={`btn-admin-edit-${book?.id}`}
                            onClick={() => handleOpenEditModal(book)}
                            className="p-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Edit Data Buku"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            id={`btn-admin-delete-${book?.id}`}
                            onClick={() => setDeleteConfirmId(book?.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus Buku"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredBooks.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-xs">
                Tidak ada data buku yang sesuai dengan filter pencarian.
              </div>
            )}
          </div>

        </div>
      )}

      {/* AUTHORS TAB CONTENT */}
      {activeTab === 'authors' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeIn">
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
                <span>Total Penulis &amp; Kontributor</span>
                <Users className="w-4 h-4 text-slate-700" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {(authors || []).length}
              </div>
              <span className="text-xs text-emerald-600 font-medium mt-1 block">Dosen, Peneliti &amp; Praktisi</span>
            </div>
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
                <span>Punya Scopus ID</span>
                <Search className="w-4 h-4 text-slate-700" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {(authors || []).filter(a => a?.scopus_id).length}
              </div>
              <span className="text-xs text-slate-500 font-medium mt-1 block">Terindeks Scopus Elsevier</span>
            </div>
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
                <span>Punya ORCID iD</span>
                <GraduationCap className="w-4 h-4 text-slate-700" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {(authors || []).filter(a => a?.orcid_id).length}
              </div>
              <span className="text-xs text-slate-500 font-medium mt-1 block">Open Researcher &amp; Contributor ID</span>
            </div>
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
                <span>Total Buku Karya</span>
                <Book className="w-4 h-4 text-slate-700" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {(authors || []).reduce((sum, a) => sum + ((a as any)?.books?.length || 0), 0)}
              </div>
              <span className="text-xs text-slate-500 font-medium mt-1 block">Total relasi buku &amp; kontributor</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama penulis, scopus, orcid, email..."
                value={authorSearchQuery}
                onChange={(e) => setAuthorSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-slate-800"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Menampilkan {(authors || []).length} penulis &amp; kontributor
            </div>
            <button
              type="button"
              onClick={handleSaveAllAuthors}
              disabled={isSavingAllAuthors}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 text-[#DFBF64] text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-wait"
            >
              <Save className={`w-3.5 h-3.5 ${isSavingAllAuthors ? 'animate-pulse' : ''}`} />
              {isSavingAllAuthors ? 'Menyimpan...' : 'Simpan Semua Perubahan'}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Profil</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Nama &amp; Gelar</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Scopus ID</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">ORCID iD</th>
                    <th className="py-3 px-4 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Jumlah Buku</th>
                    <th className="py-3 px-4 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(authors || [])
                    .filter((a: Author) => {
                      if (!authorSearchQuery.trim()) return true;
                      const q = authorSearchQuery.toLowerCase();
                      return (
                        a.name?.toLowerCase().includes(q) ||
                        a.scopus_id?.toLowerCase().includes(q) ||
                        a.orcid_id?.toLowerCase().includes(q) ||
                        a.email?.toLowerCase().includes(q) ||
                        a.academic_titles?.toLowerCase().includes(q)
                      );
                    })
                    .map((author: Author) => {
                      const bookCount = (author as any)?.books?.length || 0;
                      return (
                        <tr key={author.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 border-[#D4AF37]/40 overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
                              {author.photo_url ? (
                                <img
                                  src={resolveImageUrl(author.photo_url)}
                                  alt={author.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => handleImageError(e, undefined, 'avatar')}
                                />
                              ) : (
                                <Users className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 min-w-[180px]">
                            <div className="text-sm font-semibold text-slate-900 leading-tight">{author.name}</div>
                            {author.academic_titles && (
                              <div className="text-[11px] text-[#0F172A]/70 font-medium mt-0.5 line-clamp-1">{author.academic_titles}</div>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {author.email && (
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                                  <Mail className="w-2.5 h-2.5" />
                                  <span className="truncate max-w-[120px]">{author.email}</span>
                                </span>
                              )}
                              {author.linkedin_url && (
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                                  <Linkedin className="w-2.5 h-2.5" />
                                  LinkedIn
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 hidden md:table-cell whitespace-nowrap">
                            {author.scopus_id ? (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono font-semibold">
                                {author.scopus_id}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Belum terdaftar</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 hidden lg:table-cell whitespace-nowrap">
                            {author.orcid_id ? (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-semibold">
                                {author.orcid_id}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Belum terdaftar</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${bookCount > 0 ? 'bg-[#0F172A] text-[#DFBF64] border border-[#D4AF37]/40' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                              {bookCount}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                id={`btn-admin-edit-author-${author.id}`}
                                onClick={() => handleOpenEditAuthor(author)}
                                className="p-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Edit Data Penulis"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                id={`btn-admin-delete-author-${author.id}`}
                                onClick={() => handleDeleteAuthor(author.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Hapus Penulis"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {(authors || []).filter(a => !authorSearchQuery.trim() ||
              a.name?.toLowerCase().includes(authorSearchQuery.toLowerCase()) ||
              a.scopus_id?.toLowerCase().includes(authorSearchQuery.toLowerCase()) ||
              a.orcid_id?.toLowerCase().includes(authorSearchQuery.toLowerCase()) ||
              a.email?.toLowerCase().includes(authorSearchQuery.toLowerCase())).length === 0 && (
              <div className="p-8 text-center text-slate-500 text-xs">
                Tidak ada data penulis yang sesuai dengan filter pencarian.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ORDERS TAB CONTENT */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          
          {/* Order Metrics Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Pesanan</span>
                <span className="font-mono text-xl font-bold text-slate-900">{(orders || []).length} Transaksi</span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-800">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Omzet Sirkulasi</span>
                <span className="font-mono text-xl font-bold text-emerald-700">
                  Rp {(orders || []).reduce((sum, o) => sum + (o?.total || 0), 0).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Perlu Diproses</span>
                <span className="font-mono text-xl font-bold text-amber-600">
                  {(orders || []).filter(o => ['pending', 'paid', 'processing'].includes(o?.paymentStatus)).length} Pesanan
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Selesai / Terkirim</span>
                <span className="font-mono text-xl font-bold text-slate-800">
                  {(orders || []).filter(o => o?.paymentStatus === 'shipped').length} Paket
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-800">
                <Truck className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Orders Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari no invoice, nama customer, kota..."
                value={orderSearchQuery}
                onChange={(e) => setOrderSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                id="admin-order-status-filter"
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="text-xs py-2 px-3 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:border-slate-800 cursor-pointer w-full sm:w-auto"
              >
                <option value="all">Semua Status ({(orders || []).length})</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid (Terbayar)</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped (Terkirim)</option>
                <option value="failed">Failed / Cancelled</option>
              </select>
            </div>
          </div>

          {/* Orders Management Table - Figma Standard Card */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            {(orders || []).length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Belum ada transaksi pesanan yang tersimpan. Coba lakukan checkout di katalog untuk menguji aliran data.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[880px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4 font-semibold">Invoice & Tanggal</th>
                      <th className="py-3.5 px-4 font-semibold">Customer & Alamat</th>
                      <th className="py-3.5 px-4 font-semibold">Buku Dipesan</th>
                      <th className="py-3.5 px-4 font-semibold">Ekspedisi & Nomor Resi</th>
                      <th className="py-3.5 px-4 font-semibold">Total & Metode</th>
                      <th className="py-3.5 px-4 font-semibold text-center">Status Pembayaran</th>
                      <th className="py-3.5 px-4 font-semibold text-right">Aksi Dispatcher</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(orders || [])
                      .filter((ord) => {
                        if (!ord) return false;
                        const num = ord?.orderNumber || '';
                        const name = ord?.customer?.name || '';
                        const phone = ord?.customer?.phone || '';
                        const city = ord?.customer?.city || '';
                        const matchesSearch = 
                          num.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                          name.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                          phone.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                          city.toLowerCase().includes(orderSearchQuery.toLowerCase());
                        const matchesStatus = orderStatusFilter === 'all' || ord?.paymentStatus === orderStatusFilter;
                        return matchesSearch && matchesStatus;
                      })
                      .map((ord) => {
                        const isEditingResi = editingTrackingOrderId === ord?.id;

                        return (
                          <tr key={ord?.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Invoice & Time */}
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900 align-top">
                              <div className="text-xs text-slate-900">{ord?.orderNumber}</div>
                              <span className="text-[10px] text-slate-400 font-normal block mt-0.5">
                                {formatOrderDate(ord?.createdAt)}
                              </span>
                              {ord?.vaNumber && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 block mt-1 font-mono">
                                  VA: {ord.vaNumber}
                                </span>
                              )}
                            </td>

                            {/* Customer & Address */}
                            <td className="py-3.5 px-4 align-top max-w-xs">
                              <div className="font-semibold text-slate-900">{ord?.customer?.name || '-'}</div>
                              <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                                {ord?.customer?.phone || '-'}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                                {ord?.customer?.address || ''}, {ord?.customer?.district || ''}, {ord?.customer?.city || ''} ({ord?.customer?.postalCode || ''})
                              </div>
                            </td>

                            {/* Items */}
                            <td className="py-3.5 px-4 align-top max-w-xs">
                              <div className="space-y-1">
                                {(ord?.items || []).map((it, idx) => (
                                  <div key={idx} className="text-[11px] text-slate-700">
                                    <span className="font-bold font-mono">{it?.quantity || 1}x</span> {toTitleCase(it?.book?.title || it?.book?.name || 'Buku')}
                                  </div>
                                ))}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                                Berat total: {ord?.totalWeightGram || 500} g
                              </div>
                            </td>

                            {/* Courier & Resi */}
                            <td className="py-3.5 px-4 align-top min-w-[190px]">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-[11px] font-bold text-slate-800 uppercase flex items-center gap-1">
                                  <Truck className="w-3.5 h-3.5 text-slate-500" />
                                  {ord?.customer?.courier || 'JNE'} {ord?.customer?.shippingService ? `(${ord.customer.shippingService})` : ''}
                                </span>
                              </div>
                              
                              {/* Inline Resi Form / Display */}
                              <div>
                                {isEditingResi ? (
                                  <div className="space-y-1.5 p-2 bg-slate-50 border border-slate-300 rounded-lg shadow-xs">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        value={editingTrackingValue}
                                        onChange={(e) => setEditingTrackingValue(e.target.value)}
                                        placeholder="e.g. JP1234567890"
                                        className="text-[11px] px-2 py-1 bg-white border border-slate-300 rounded-md font-mono w-36 focus:outline-none focus:border-slate-800"
                                        autoFocus
                                      />
                                      <button
                                        onClick={() => handleSaveTracking(ord)}
                                        className="px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                                        title="Simpan Resi & Ubah Status ke DIKIRIM"
                                      >
                                        <CheckCircle className="w-3 h-3" />
                                        <span>Simpan</span>
                                      </button>
                                      <button
                                        onClick={() => setEditingTrackingOrderId(null)}
                                        className="p-1 rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer"
                                        title="Batal"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const autoCode = generateCakraNexaTrackingNumber();
                                        setEditingTrackingValue(autoCode);
                                      }}
                                      className="text-[10px] text-[#DFBF64] hover:text-[#c9a84a] font-semibold flex items-center gap-1 cursor-pointer"
                                    >
                                      <RefreshCw className="w-2.5 h-2.5" />
                                      <span>Isi Resi Otomatis CNX</span>
                                    </button>
                                  </div>
                                ) : ord?.trackingNumber ? (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-mono font-bold text-slate-800">
                                      <Barcode className="w-3 h-3 text-slate-600" />
                                      <span>{ord.trackingNumber}</span>
                                    </div>
                                    <button
                                      onClick={() => handleCopyTrackingNumber(ord.id, ord.trackingNumber!)}
                                      className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer rounded hover:bg-slate-100 transition-colors"
                                      title="Salin Nomor Resi"
                                    >
                                      {copiedTrackingId === ord.id ? (
                                        <Check className="w-3 h-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingTrackingOrderId(ord?.id);
                                        setEditingTrackingValue(ord?.trackingNumber || '');
                                      }}
                                      className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer rounded hover:bg-slate-100 transition-colors"
                                      title="Ubah / Input Resi Kurir Resmi"
                                    >
                                      <Edit3 className="w-3 h-3 text-slate-600" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-medium text-slate-400 italic">
                                      Belum ada resi
                                    </span>
                                    <button
                                      onClick={() => handleGenerateAutoTracking(ord)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#DFBF64]/15 text-[#9e8334] hover:bg-[#DFBF64]/25 border border-[#DFBF64]/30 cursor-pointer transition-colors"
                                      title="Buat Resi Otomatis & Ubah Status ke DIKIRIM"
                                    >
                                      <Barcode className="w-2.5 h-2.5" />
                                      <span>Auto Resi</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingTrackingOrderId(ord?.id);
                                        setEditingTrackingValue('');
                                      }}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer transition-colors"
                                      title="Input Manual Waybill Kurir (JNE / J&T)"
                                    >
                                      <Edit3 className="w-2.5 h-2.5" />
                                      <span>Input Resi</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Total & Payment Method */}
                            <td className="py-3.5 px-4 align-top whitespace-nowrap">
                              <div className="font-mono font-bold text-slate-900">
                                Rp {ord?.total ? ord.total.toLocaleString('id-ID') : '0'}
                              </div>
                              <span className="text-[10px] text-slate-500 uppercase font-mono block mt-0.5">
                                {ord?.paymentMethod?.replace('_', ' ') || 'Gateway Resmi'}
                              </span>
                            </td>

                            {/* Payment Status Dropdown */}
                            <td className="py-3.5 px-4 align-top text-center">
                              <select
                                value={ord?.paymentStatus || 'pending'}
                                onChange={(e) => handleStatusChange(ord, e.target.value as OrderStatus)}
                                className={`text-[10px] font-bold px-2 py-1 rounded-full border cursor-pointer ${
                                  ord?.paymentStatus === 'paid'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : ord?.paymentStatus === 'shipped'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : ord?.paymentStatus === 'processing'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : ord?.paymentStatus === 'failed' || ord?.paymentStatus === 'cancelled'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                <option value="pending">PENDING</option>
                                <option value="paid">PAID</option>
                                <option value="processing">PROCESSING</option>
                                <option value="shipped">SHIPPED</option>
                                <option value="cancelled">CANCELLED</option>
                              </select>

                              {/* Manual Transfer Proof button */}
                              {ord?.paymentProofUrl && (
                                <button
                                  onClick={() => setViewingProofOrder(ord)}
                                  className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline cursor-pointer"
                                >
                                  <FileText className="w-3 h-3" />
                                  <span>Lihat Bukti</span>
                                </button>
                              )}
                            </td>

                            {/* Dispatcher Actions */}
                            <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => handleOpenShippingLabel(ord)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#DFBF64]/20 hover:bg-[#DFBF64]/35 text-slate-900 border border-[#DFBF64]/50 font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
                                  title="Cetak Resi & Download PDF Thermal A6 / A4"
                                >
                                  <Printer className="w-3.5 h-3.5 text-slate-900" />
                                  <span>Cetak Resi / PDF</span>
                                </button>
                                <button
                                  onClick={() => handleDispatchWhatsApp(ord)}
                                  className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                                  title="Kirim Konfirmasi Resi WhatsApp ke Customer"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDispatchEmail(ord)}
                                  className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                                  title="Trigger Resi Email Otomatis"
                                >
                                  <MailIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* PAYMENT PROOF MODAL */}
          {viewingProofOrder && (
            <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4 shadow-xl border border-slate-200">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-800" />
                    <h4 className="font-bold text-slate-900 text-sm">
                      Bukti Transfer: {viewingProofOrder?.orderNumber}
                    </h4>
                  </div>
                  <button
                    onClick={() => setViewingProofOrder(null)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-h-80 flex items-center justify-center p-2">
                  {viewingProofOrder?.paymentProofUrl ? (
                    <img
                      src={viewingProofOrder.paymentProofUrl}
                      alt="Bukti Transfer"
                      className="max-h-72 w-auto object-contain rounded"
                    />
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Tidak ada gambar bukti terlampir
                    </div>
                  )}
                </div>

                <div className="text-xs space-y-1 text-slate-600 bg-slate-50 p-3 rounded-lg">
                  <div><strong>Nama File:</strong> {viewingProofOrder?.paymentProofName || 'Bukti_Transfer.jpg'}</div>
                  <div><strong>Pengirim:</strong> {viewingProofOrder?.customer?.name}</div>
                  <div><strong>Total Transfer:</strong> Rp {viewingProofOrder?.total ? viewingProofOrder.total.toLocaleString('id-ID') : '0'}</div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      handleStatusChange(viewingProofOrder, 'paid');
                      setViewingProofOrder(null);
                    }}
                    className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Verifikasi Sebagai Terbayar (Paid)
                  </button>
                  <button
                    onClick={() => setViewingProofOrder(null)}
                    className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* EXECUTIVE PERFORMANCE ANALYTICS TAB CONTENT */}
      {activeTab === 'analytics' && (
        <ExecutiveAnalyticsDashboard
          books={books}
          orders={orders}
          onViewBookDetail={onViewBookDetail}
          onNavigateToOrders={() => setActiveTab('orders')}
          onNavigateToInventory={() => setActiveTab('inventory')}
          onPrintShippingLabel={handleOpenShippingLabel}
        />
      )}

      {/* SEO / META SETTINGS TAB CONTENT */}
      {activeTab === 'seo-settings' && (
        <SeoSettingsTab
          settings={seoState}
          onSaveSettings={handleSaveSeoSettings}
          onResetSettings={handleResetSeoSettings}
          onRunAuditFromSettings={() => setActiveTab('seo-analysis')}
        />
      )}

      {/* SEO ANALYSIS & AUDIT TAB CONTENT */}
      {activeTab === 'seo-analysis' && (
        <SeoAnalysisTab
          settings={seoState}
          books={books}
          onOpenSeoSettingsTab={() => setActiveTab('seo-settings')}
        />
      )}

      {/* SHIPPING & LOGISTICS CRUD TAB CONTENT */}
      {activeTab === 'shipping' && (
        <ShippingManagementTab />
      )}

      {/* PAYMENT METHODS & BANK ACCOUNTS CRUD TAB CONTENT */}
      {activeTab === 'payments' && (
        <PaymentManagementTab />
      )}

      {/* CMS & HOMEPAGE SECTIONS CRUD TAB CONTENT */}
      {activeTab === 'cms' && (
        <CmsDashboardManager
          books={books}
          siteContent={cmsContentState}
          onSaveContent={handleSaveSiteContent}
          onResetContent={handleResetSiteContent}
          onUpdateBook={onUpdateBook}
          onNavigateHome={onNavigateHome}
        />
      )}

      {/* PRODUK DIGITAL (E-BOOK & AUDIOBOOK) */}
      {activeTab === 'digital-products' && (
        <DigitalProductsTab books={books} />
      )}

      {/* PERMINTAAN INSTITUSI (/institutions) */}
      {activeTab === 'institution-inquiries' && (
        <InstitutionInquiriesTab />
      )}

      </main>

      {/* CREATE / EDIT BOOK MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#DFBF64]" />
                <h3 className="font-bold text-base text-white">
                  {editingBook ? 'Edit Data Literatur Buku' : 'Tambah Monografi Baru ke Katalog'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSaveBook} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              
              {/* Judul Buku */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Judul Lengkap Buku (ID) (Format Title Case Otomatis) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onBlur={() => {
                    if (formData.name) {
                      const formatted = toTitleCase(formData.name);
                      setFormData(prev => ({ ...prev, name: formatted, title: formatted }));
                    }
                  }}
                  placeholder="Contoh: Reformulasi Subjek Pajak Pertambahan Nilai (PPN) di Era Digitalisasi..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800"
                />
                {formData.name && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Pratinjau Title Case: <strong className="text-slate-800 font-semibold">{toTitleCase(formData.name)}</strong>
                  </p>
                )}
              </div>

              {/* Author & Kategori */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Subjudul (ID) (Opsional)</label>
                  <input
                    type="text"
                    value={formData.subtitle || ''}
                    onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                    placeholder="Subjudul buku"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kutipan Sampul (Opsional)</label>
                  <input
                    type="text"
                    value={formData.coverQuote || ''}
                    onChange={(e) => setFormData({ ...formData, coverQuote: e.target.value })}
                    placeholder="Kutipan di atas judul sampul"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              {/* Author & Kategori */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Penulis / Kontributor *</label>
                  <input
                    type="text"
                    required
                    value={formData.author || ''}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kategori Bidang Ilmu *</label>
                  <select
                    value={formData.category || 'Perpajakan'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as BookCategory })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 bg-white cursor-pointer"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Penerbit & Stok */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Penerbit Utama *</label>
                  <select
                    value={formData.penerbit || 'PT Scientia Integritas Utama'}
                    onChange={(e) => setFormData({ ...formData, penerbit: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 bg-white cursor-pointer"
                  >
                    {PENERBIT_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Stok / Inventaris</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.stock !== undefined && formData.stock !== null ? String(formData.stock) : ''}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="Contoh: 50"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>
              </div>

              {/* ISBN & Harga */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nomor ISBN</label>
                  <input
                    type="text"
                    value={formData.isbn || ''}
                    onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                    placeholder="Kosongkan jika belum terbit, mis. 978-634-05-4139-7"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Harga Resmi (IDR) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formData.harga ?? 0}
                    onChange={(e) => setFormData({ ...formData, harga: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>
              </div>

              {/* Original Price & Discount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Harga Asli / Coret (Opsional)</label>
                  <input
                    type="number"
                    value={formData.originalHarga || ''}
                    onChange={(e) => setFormData({ ...formData, originalHarga: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="Contoh: 260000"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Persentase Diskon (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={formData.discountPercentage || ''}
                    onChange={(e) => setFormData({ ...formData, discountPercentage: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="Contoh: 15"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Tahun, Halaman, Ukuran */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tahun Terbit</label>
                  <input
                    type="number"
                    value={formData.tahunTerbit ?? ''}
                    onChange={(e) => setFormData({ ...formData, tahunTerbit: Number(e.target.value) })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Jumlah Hlm</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.jumlahHalaman ?? ''}
                    onChange={(e) => setFormData({ ...formData, jumlahHalaman: Number(e.target.value) })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Ukuran Buku</label>
                  <input
                    type="text"
                    value={formData.ukuranBuku || '15.5 x 23 cm'}
                    onChange={(e) => setFormData({ ...formData, ukuranBuku: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              {/* Cover Image Upload / URL Handler */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="font-semibold text-slate-800 block">
                  Cover Buku (Image Upload Handler & URL)
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-18 rounded book-shadow overflow-hidden bg-slate-800 flex-shrink-0">
                    <img 
                      src={resolveImageUrl(formData.coverBuku, 'book', formData.id)} 
                      alt="Preview" 
                      onError={(e) => handleImageError(e, {
                        title: formData.name,
                        author: formData.author,
                        category: formData.category,
                        isbn: formData.isbn
                      }, 'book')}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={formData.coverBuku || ''}
                      onChange={(e) => setFormData({ ...formData, coverBuku: e.target.value })}
                      placeholder="Masukkan URL Gambar Cover..."
                      className="w-full p-2 rounded border border-slate-300 font-mono text-[11px]"
                    />
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-slate-600" />
                      <span>Unggah File Cover (Otomatis Base64)</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Sinopsis */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Sinopsis & Deskripsi Ilmiah Monografi (ID)
                </label>
                <textarea
                  rows={4}
                  value={formData.sinopsis || ''}
                  onChange={(e) => setFormData({ ...formData, sinopsis: e.target.value })}
                  placeholder="Uraikan intisari naskah, latar belakang hukum, signifikansi riset..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800"
                />
              </div>

              {/* Terjemahan Konten (EN / ZH) — field kosong tidak disimpan */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Languages className="w-3.5 h-3.5 text-slate-600" />
                      Terjemahan Konten
                    </span>
                    <span className="text-slate-500 text-[11px] font-medium">
                      Kosongkan jika belum ada terjemahan — situs akan menampilkan versi Bahasa Indonesia.
                    </span>
                  </div>
                  <TranslationLanguageSwitch value={bookTranslationLang} onChange={setBookTranslationLang} translations={bookTranslations} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Judul Buku {TRANSLATION_META[bookTranslationLang].suffix}
                  </label>
                  <input
                    type="text"
                    lang={TRANSLATION_META[bookTranslationLang].htmlLang}
                    value={bookTranslations[bookTranslationLang]?.name || ''}
                    onChange={(e) => updateBookTranslation(bookTranslationLang, 'name', e.target.value)}
                    placeholder={`Judul buku dalam bahasa ${TRANSLATION_META[bookTranslationLang].languageName}`}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Subjudul {TRANSLATION_META[bookTranslationLang].suffix}
                  </label>
                  <input
                    type="text"
                    lang={TRANSLATION_META[bookTranslationLang].htmlLang}
                    value={bookTranslations[bookTranslationLang]?.subtitle || ''}
                    onChange={(e) => updateBookTranslation(bookTranslationLang, 'subtitle', e.target.value)}
                    placeholder={`Subjudul dalam bahasa ${TRANSLATION_META[bookTranslationLang].languageName} (opsional)`}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Sinopsis {TRANSLATION_META[bookTranslationLang].suffix}
                  </label>
                  <textarea
                    rows={4}
                    lang={TRANSLATION_META[bookTranslationLang].htmlLang}
                    value={bookTranslations[bookTranslationLang]?.sinopsis || ''}
                    onChange={(e) => updateBookTranslation(bookTranslationLang, 'sinopsis', e.target.value)}
                    placeholder={`Sinopsis dalam bahasa ${TRANSLATION_META[bookTranslationLang].languageName}`}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 bg-white"
                  />
                </div>
              </div>

              {/* Toggle Buku Terbaru */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="font-semibold text-slate-800 block">Tandai Sebagai Buku Terbaru</span>
                  <span className="text-slate-500 text-[11px] font-medium">Buku akan mendapatkan badge khusus dan diprioritaskan di filter beranda.</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(formData.bukuTerbaru)}
                  onChange={(e) => setFormData({ ...formData, bukuTerbaru: e.target.checked })}
                  className="w-5 h-5 text-slate-900 rounded border-slate-300 focus:ring-slate-900 cursor-pointer"
                />
              </div>

              {/* Admin Scheduling System */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-800 block">Jadwal Rilis / Publikasi (Scheduling)</span>
                    <span className="text-slate-500 text-[11px] font-medium">Atur tanggal peluncuran resmi buku ke katalog publik.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.scheduledUpload)}
                    onChange={(e) => setFormData({ ...formData, scheduledUpload: e.target.checked })}
                    className="w-5 h-5 text-slate-900 rounded border-slate-300 focus:ring-slate-900 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Tanggal Rilis Publikasi (Release Date)</label>
                  <input
                    type="date"
                    value={formData.releaseDate || ''}
                    onChange={(e) => setFormData({ ...formData, releaseDate: e.target.value })}
                    className="w-full sm:w-60 p-2 rounded border border-slate-300 text-xs font-mono bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingBook}
                  className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-[#DFBF64] font-bold cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
                >
                  {isSavingBook ? 'Menyimpan ke server...' : editingBook ? 'Simpan Perubahan' : 'Terbitkan Buku'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-900 text-base">
              Hapus Buku dari Inventaris?
            </h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Tindakan ini akan menghapus buku terpilih dari katalog dan database lokal. Anda dapat mengembalikannya kapan saja melalui tombol "Reset Data Seed".
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="py-2.5 px-3 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmDelete}
                className="py-2.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer transition-colors"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SEO SETTINGS MODAL */}
      {isSeoModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="font-bold text-base text-slate-900">
                  Pengaturan SEO & Meta Tags
                </h3>
              </div>
              <button
                onClick={() => setIsSeoModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SeoSettingsTab
              settings={seoState}
              onSaveSettings={(s) => {
                handleSaveSeoSettings(s);
                setIsSeoModalOpen(false);
              }}
              onResetSettings={handleResetSeoSettings}
              onRunAuditFromSettings={() => {
                setIsSeoModalOpen(false);
                setActiveTab('seo-analysis');
              }}
            />
          </div>
        </div>
      )}

      {/* AUTHOR CREATE / EDIT FORM MODAL */}
      {showAuthorModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 sm:p-4">
          <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-8 max-h-[93vh] flex flex-col">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-[#0F172A] via-[#0F172A] to-[#1e293b] sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#DFBF64]/15 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                  <UserPlus className="w-4.5 h-4.5 text-[#DFBF64]" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    {editingAuthor ? 'Edit Data Penulis &amp; Kontributor' : 'Tambah Penulis &amp; Kontributor Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-300 mt-0.5 hidden sm:block">
                    Isi biodata lengkap, foto profil, dan hubungkan dengan buku karya di katalog.
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowAuthorModal(false); setEditingAuthor(null); setTempAuthorPhotoPreview(null); }}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAuthor} className="flex-1 overflow-y-auto">
              <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
                <div className="lg:col-span-1 space-y-5">
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2.5">
                      Foto Profil Penulis
                    </label>
                    <div className="aspect-[3/4] w-full max-w-[200px] mx-auto rounded-xl border-2 border-dashed border-slate-300 bg-white overflow-hidden flex items-center justify-center relative group">
                      {tempAuthorPhotoPreview || authorForm.photo_url ? (
                        <>
                          <img
                            src={resolveImageUrl(tempAuthorPhotoPreview || authorForm.photo_url)}
                            alt="Preview Foto"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); setTempAuthorPhotoPreview(null); setAuthorForm({ ...authorForm, photo_url: '' }); }}
                            className="absolute top-2 right-2 p-1.5 rounded-full bg-rose-600 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="Hapus foto"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-slate-400 p-4 text-center">
                          <Users className="w-14 h-14 opacity-60" />
                          <span className="text-[11px] leading-relaxed">Belum ada foto.<br />Klik tombol dibawah untuk upload.</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3">
                      <label className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold rounded-lg bg-[#0F172A] text-[#DFBF64] hover:bg-slate-800 cursor-pointer transition-colors border border-[#D4AF37]/40">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Foto (Max 2MB)</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={handleAuthorPhotoUpload}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                        Format: JPG/JPEG atau PNG • Maksimal 2MB • Rasio 3:4 portrait direkomendasikan
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#DFBF64]" />
                      ID Akademik &amp; Kontak
                    </h4>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Scopus ID (Elsevier)</label>
                      <input
                        type="text"
                        value={authorForm.scopus_id}
                        onChange={(e) => setAuthorForm({ ...authorForm, scopus_id: e.target.value })}
                        placeholder="con: 57194873201"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-slate-800 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">ORCID iD</label>
                      <input
                        type="text"
                        value={authorForm.orcid_id}
                        onChange={(e) => setAuthorForm({ ...authorForm, orcid_id: e.target.value })}
                        placeholder="con: 0000-0002-1825-0097"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-slate-800 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        <Linkedin className="w-3 h-3 text-[#0A66C2]" />
                        LinkedIn URL
                      </label>
                      <input
                        type="text"
                        value={authorForm.linkedin_url}
                        onChange={(e) => setAuthorForm({ ...authorForm, linkedin_url: e.target.value })}
                        placeholder="https://linkedin.com/in/username"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-slate-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        <Mail className="w-3 h-3 text-sky-600" />
                        Email Kontak
                      </label>
                      <input
                        type="email"
                        value={authorForm.email}
                        onChange={(e) => setAuthorForm({ ...authorForm, email: e.target.value })}
                        placeholder="nama.lecturer@universitas.ac.id"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-[#DFBF64]" />
                      Hubungkan dengan Buku Karya <span className="text-[10px] font-normal normal-case text-slate-400">(Pilih semua yang relevan)</span>
                    </h4>
                    <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1 border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                      {(books || []).length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic text-center py-4">Belum ada buku di katalog.</p>
                      ) : (books || []).map((book) => (
                        <label
                          key={book.id}
                          className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors border ${selectedAuthorBookIds.has(book.id) ? 'bg-[#0F172A] border-[#D4AF37]/40' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedAuthorBookIds.has(book.id)}
                            onChange={() => toggleAuthorBook(book.id)}
                            className="mt-0.5 shrink-0 accent-[#DFBF64]"
                          />
                          <div className="min-w-0">
                            <div className={`text-[11px] font-semibold leading-tight ${selectedAuthorBookIds.has(book.id) ? 'text-[#DFBF64]' : 'text-slate-800'}`}>
                              {toTitleCase(book.title || book.name || '')}
                            </div>
                            <div className={`text-[10px] mt-0.5 truncate ${selectedAuthorBookIds.has(book.id) ? 'text-slate-300' : 'text-slate-500'}`}>
                              {book.category} • {book.isbn || 'ISBN -'}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      Dipilih: {selectedAuthorBookIds.size} dari {(books || []).length} judul buku
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-5">
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3.5">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#DFBF64]" />
                      Identitas Utama
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                      <div className="sm:col-span-6">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Nama Lengkap <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={authorForm.name}
                          onChange={(e) => setAuthorForm({ ...authorForm, name: e.target.value })}
                          placeholder="Contoh: Prof. Dr. Ir. Nama Lengkap, M.Sc."
                          className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:border-[#0F172A] focus:outline-none font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-6">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Gelar Akademik &amp; Jabatan / Profesi
                        </label>
                        <input
                          type="text"
                          value={authorForm.academic_titles}
                          onChange={(e) => setAuthorForm({ ...authorForm, academic_titles: e.target.value })}
                          placeholder="Contoh: Guru Besar Tetap Bidang Ilmu Perpajakan, Fakultas Ekonomi dan Bisnis Universitas Indonesia"
                          className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:border-[#0F172A] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                      <GraduationCap className="w-3.5 h-3.5 text-[#DFBF64]" />
                      4 Bagian Biografi Detail (ID) <span className="text-[10px] font-normal normal-case text-slate-400 ml-auto">(1 poin = 1 baris, pisahkan dengan enter)</span>
                    </h4>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-sky-600" />
                        Profil &amp; Riwayat Pendidikan
                      </label>
                      <textarea
                        rows={4}
                        value={authorForm.profile_education}
                        onChange={(e) => setAuthorForm({ ...authorForm, profile_education: e.target.value })}
                        placeholder={"S1 - Universitas Indonesia, Akuntansi (2005)\nS2 - Universitas Gadjah Mada, Ilmu Perpajakan (2009)\nS3 - Vrije Universiteit Amsterdam, Tax Law & Economics (2015)\n... (tambahkan baris lain)"}
                        className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:border-sky-700 focus:outline-none leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                        Pengalaman Kerja &amp; Karir
                      </label>
                      <textarea
                        rows={4}
                        value={authorForm.work_experience}
                        onChange={(e) => setAuthorForm({ ...authorForm, work_experience: e.target.value })}
                        placeholder={"2018 - Sekarang: Profesor Bidang Ilmu Perpajakan, FE UI\n2013 - 2018: Ketua Program Magister Ilmu Perpajakan\n... (tambahkan baris lain)"}
                        className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:border-indigo-700 focus:outline-none leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-amber-600" />
                        Organisasi, Keprofesian &amp; Seminar
                      </label>
                      <textarea
                        rows={4}
                        value={authorForm.organization_seminar}
                        onChange={(e) => setAuthorForm({ ...authorForm, organization_seminar: e.target.value })}
                        placeholder={"Ketua Ikatan Ahli Perpajakan Indonesia (IAPI) 2022-2025\nKeynote Speaker - International Tax Symposium Singapore 2024\n... (tambahkan baris lain)"}
                        className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:border-amber-700 focus:outline-none leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-600" />
                        Publikasi &amp; Karya Ilmiah Unggulan
                      </label>
                      <textarea
                        rows={4}
                        value={authorForm.publications}
                        onChange={(e) => setAuthorForm({ ...authorForm, publications: e.target.value })}
                        placeholder={"Tax Policy in Developing Countries (Scopus Q1, 2023)\nPeran Transformasi Digital dalam Kepatuhan Pajak UMKM (2024)\n... (tambahkan baris lain)"}
                        className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:border-emerald-700 focus:outline-none leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* Terjemahan Bio (EN / ZH) — format sama (1 poin = 1 baris); field kosong tidak disimpan */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 pb-1 border-b border-slate-100">
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                          <Languages className="w-3.5 h-3.5 text-[#DFBF64]" />
                          Terjemahan Bio
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Kosongkan jika belum ada terjemahan — situs akan menampilkan versi Bahasa Indonesia.
                        </p>
                      </div>
                      <TranslationLanguageSwitch value={authorTranslationLang} onChange={setAuthorTranslationLang} translations={authorForm.i18n} />
                    </div>
                    {AUTHOR_BIO_TRANSLATION_FIELDS.map(({ field, label }) => (
                      <div key={field}>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                          {label} {TRANSLATION_META[authorTranslationLang].suffix}
                        </label>
                        <textarea
                          rows={3}
                          lang={TRANSLATION_META[authorTranslationLang].htmlLang}
                          value={authorForm.i18n[authorTranslationLang]?.[field] || ''}
                          onChange={(e) => updateAuthorTranslation(authorTranslationLang, field, e.target.value)}
                          placeholder={`${label} dalam bahasa ${TRANSLATION_META[authorTranslationLang].languageName} (1 poin = 1 baris)`}
                          className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:border-slate-800 focus:outline-none leading-relaxed"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  {editingAuthor ? (
                    <>
                      <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                      <span>Mode Edit: Mengubah data penulis yang sudah ada.</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Mode Baru: Menambahkan penulis baru ke database.</span>
                    </>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setShowAuthorModal(false); setEditingAuthor(null); setTempAuthorPhotoPreview(null); }}
                    className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    Batal
                  </button>
                  {editingAuthor && onDeleteAuthor && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        if (window.confirm(`Hapus penulis "${editingAuthor.name}"? Aksi ini tidak bisa dibatalkan.`)) {
                          handleDeleteAuthor(editingAuthor.id, true);
                          setShowAuthorModal(false);
                          setEditingAuthor(null);
                        }
                      }}
                      className="px-4 py-2 text-xs font-bold rounded-lg border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Penulis</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSavingAuthor}
                    className="px-5 py-2 text-xs font-bold rounded-lg bg-[#0F172A] text-[#DFBF64] hover:bg-slate-800 cursor-pointer transition-colors shadow-sm border border-[#D4AF37]/40 flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{isSavingAuthor ? 'Menyimpan ke server...' : editingAuthor ? 'Simpan Perubahan' : 'Simpan Penulis Baru'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIGITAL SHIPPING LABEL / RESI PDF GENERATOR MODAL */}
      <ShippingLabelModal
        order={shippingLabelOrder}
        isOpen={Boolean(shippingLabelOrder)}
        onClose={() => setShippingLabelOrder(null)}
        onUpdateTrackingNumber={handleUpdateTrackingFromLabel}
      />

    </div>
  );
};

// Internal clean line mail icon component to avoid missing import
const MailIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);
