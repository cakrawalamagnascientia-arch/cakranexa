export type BookCategory = 
  | 'Perpajakan' 
  | 'Akuntansi' 
  | 'Hukum' 
  | 'Ekonomi & Bisnis' 
  | 'Filsafat' 
  | 'Teologia';

export interface Book {
  id: string;
  name: string;
  title?: string;
  slug: string;
  author: string;
  category: BookCategory;
  isbn: string;
  tahunTerbit: number;
  jumlahHalaman: number;
  ukuranBuku: string;
  harga: number;
  sinopsis: string;
  linkPembelian: string;
  bukuTerbaru: boolean;
  penerbit: string;
  coverBuku: string;
  badge?: string;
  originalHarga?: number;
  discountPercentage?: number;
  releaseDate?: string;
  scheduledUpload?: string | boolean;
  rating?: number;
  reviewsCount?: number;
  daftarIsi?: string[];
  tentangPenulis?: string;
  beratGram?: number;
  stock?: number;
  featured?: boolean;
  isBestSeller?: boolean;
  bestSellerRank?: number;
}

export interface CartItem {
  book: Book;
  quantity: number;
}

export interface Author {
  id: string;
  name: string;
  academic_titles?: string;
  photo_url?: string;
  scopus_id?: string;
  orcid_id?: string;
  linkedin_url?: string;
  email?: string;
  profile_education?: string | string[];
  work_experience?: string | string[];
  organization_seminar?: string | string[];
  publications?: string | string[];
  created_at?: string;
  updated_at?: string;
  books?: Book[];
}

export interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
  address: string;
  province: string;
  city: string;
  district: string;
  postalCode: string;
  courier: string;
  shippingService?: string;
  notes?: string;
}

export type PaymentMethod = 
  | 'bca_va' 
  | 'mandiri_bill' 
  | 'bni_va' 
  | 'bri_va' 
  | 'permata_va'
  | 'qris'
  | 'gopay'
  | 'ovo'
  | 'dana'
  | 'shopeepay'
  | 'linkaja'
  | 'credit_card'
  | 'manual_mandiri';

export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'failed' | 'cancelled';

export interface Order {
  id: string;
  orderNumber: string;
  items: CartItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  totalWeightGram?: number;
  customer: CustomerDetails;
  paymentMethod: PaymentMethod;
  paymentStatus: OrderStatus;
  snapToken?: string;
  vaNumber?: string;
  trackingNumber?: string;
  paymentProofUrl?: string;
  paymentProofName?: string;
  whatsappDispatched?: boolean;
  emailDispatched?: boolean;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** true jika pesanan sudah tercatat di backend (POST /api/orders berhasil) */
  serverSynced?: boolean;
  /** 'midtrans_production' | 'midtrans_sandbox' | 'simulation' | 'offline' */
  paymentMode?: string;
}

export type ActivePage = 
  | 'home' 
  | 'beranda'
  | 'katalog' 
  | 'katalog-detail'
  | 'penerbitan' 
  | 'pelatihan' 
  | 'jurnal' 
  | 'tentang-kami' 
  | 'blog' 
  | 'career' 
  | 'karir'
  | 'checkout'
  | 'kontak' 
  | 'admin';

export type SubSection = 
  | 'all'
  | 'Perpajakan'
  | 'Akuntansi'
  | 'Hukum'
  | 'Ekonomi & Bisnis'
  | 'Filsafat'
  | 'Teologia'
  | 'terbaru' 
  | 'kategori' 
  | 'penulis' 
  | 'layanan' 
  | 'kirim-naskah' 
  | 'panduan' 
  | 'panduan-penulis'
  | 'proses' 
  | 'faq' 
  | 'isbn'
  | 'dewan-redaksi'
  | 'profil' 
  | 'visi-misi' 
  | 'tim' 
  | 'legalitas' 
  | null;

export interface SeoSettings {
  siteTitle: string;
  slogan: string;
  targetKeywords: string;
  metaDescription: string;
  siteUrl: string;
  ogImage: string;
  noindex: boolean;
  responsiveViewport: boolean;
  customHeaderTags: string;
  googleAnalyticsId: string;
  googleMapsApiKey: string;
  metaPixelId?: string;
  gtmId?: string;
  googleAdsConversionId?: string;
  googleAdsConversionLabel?: string;
  updatedAt?: string;
}

export interface SeoAuditCheck {
  id: string;
  category: 'title' | 'description' | 'h1' | 'images' | 'opengraph' | 'mobile' | 'schema' | 'indexing';
  label: string;
  status: 'passed' | 'warning' | 'failed';
  scoreImpact: number;
  message: string;
  recommendation?: string;
  value?: string;
}

export interface SeoAuditResult {
  url: string;
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  status: string;
  totalChecks: number;
  passedChecks: number;
  warningChecks: number;
  failedChecks: number;
  checks: SeoAuditCheck[];
  timestamp: string;
  pageType: string;
}

export interface ShippingMethod {
  id: string;
  courierCode: 'JNE' | 'J&T' | 'POS' | 'SICEPAT' | 'TIKI' | 'ANTERAJA' | string;
  name: string;
  service: string;
  estimatedDays: string;
  baseRatePerKg: number;
  minCost: number;
  freeShippingThreshold?: number; // threshold in IDR (e.g. 300000), 0 or undefined if none
  isActive: boolean;
  description: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminBankAccount {
  id: string;
  bankName: string; // e.g. Bank Mandiri, Bank Central Asia (BCA)
  bankCode: string; // e.g. MANDIRI, BCA, BNI, BRI, BSI
  accountNumber: string;
  accountHolder: string;
  branch?: string;
  isActive: boolean;
  isDefault?: boolean;
}

export interface PaymentSettings {
  // Method Toggles
  enableManualTransfer: boolean;
  enableMidtransVA: boolean;
  enableQris: boolean;
  enableEWallet: boolean;
  enableCreditCard: boolean;

  // Bank Accounts for Direct Transfer
  bankAccounts: AdminBankAccount[];

  // QRIS Configuration
  qrisMerchantName: string;
  qrisNmid: string;
  qrisImageUrl?: string;

  // Notifications & Instructions
  adminNotificationWhatsapp: string;
  adminNotificationEmail: string;
  manualTransferInstructions: string;
  paymentSuccessNote: string;
  updatedAt?: string;
}

// ============================================================================
// DYNAMIC SITE CONTENT & CMS INTERFACES (CRUD FOR ALL SECTIONS & MENUS)
// ============================================================================

export interface SiteSubmenuItem {
  id: string;
  label: string;
  subSection?: string;
  categoryParam?: string;
  badge?: string;
  order: number;
}

export interface SiteNavigationItem {
  id: string;
  label: string;
  page: ActivePage;
  subSection?: SubSection;
  order: number;
  isEnabled: boolean;
  hasDropdown: boolean;
  submenus?: SiteSubmenuItem[];
}

export interface HeroSlide {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  primaryCtaText: string;
  primaryCtaPage: ActivePage;
  primaryCtaSubSection?: SubSection;
  secondaryCtaText: string;
  secondaryCtaPage: ActivePage;
  secondaryCtaSubSection?: SubSection;
  bgImageUrl?: string;
  order: number;
}

export interface BestSellerSectionSettings {
  isEnabled: boolean;
  badge: string;
  title: string;
  subtitle: string;
  speed: 'slow' | 'normal' | 'fast';
  autoScroll: boolean;
  pauseOnHover: boolean;
  showRankNumber: boolean;
  showRating: boolean;
  showIsbn: boolean;
  showQuickBuy: boolean;
  customBookIds?: string[]; // If empty, filters books where isBestSeller === true or badge === 'Best Seller'
}

export interface HomeSectionConfig {
  id: string;
  name: string;
  isEnabled: boolean;
  order: number;
  badge?: string;
  title?: string;
  subtitle?: string;
}

export interface FooterTrustBadge {
  id: string;
  title: string;
  subtitle: string;
  iconName: string;
  order: number;
}

export interface FooterLink {
  id: string;
  label: string;
  page: ActivePage;
  subSection?: SubSection;
  category?: string;
  isExternal?: boolean;
  url?: string;
}

export interface FooterColumn {
  id: string;
  title: string;
  links: FooterLink[];
  order: number;
}

export interface FooterSettings {
  companyName: string;
  brandTagline: string;
  description: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  workingHours: string;
  mapsEmbedUrl: string;
  copyrightText: string;
  trustBadges: FooterTrustBadge[];
  columns: FooterColumn[];
}

export interface ContactSettings {
  address?: string;
  phone?: string;
  email?: string;
  workingHours?: string;
}

export interface PenerbitanPackage {
  id: string;
  name: string;
  badge: string;
  priceFormatted: string;
  priceNumber: number;
  description: string;
  features: string[];
  isPopular?: boolean;
  order: number;
}

export interface WorkshopItem {
  id: string;
  title: string;
  speaker: string;
  dateFormatted: string;
  priceFormatted: string;
  badge: string;
  description: string;
  benefits: string[];
  order: number;
}

export interface JournalItem {
  id: string;
  title: string;
  abbreviation: string;
  issn: string;
  sintaRank: string;
  description: string;
  frequency: string;
  focusScope: string[];
  order: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  affiliation: string;
  expertise: string;
  avatarUrl: string;
  order: number;
}

export interface LegalDoc {
  id: string;
  title: string;
  number: string;
  issuer: string;
  description: string;
  order: number;
}

export interface CompanyCredentials {
  kemenkumham: string; // Pengesahan Kemenkumham RI
  kemenkumhamNote: string;
  nib: string; // Nomor Induk Berusaha (NIB)
  nibNote: string;
  npwp: string; // NPWP Perusahaan
  npwpNote: string;
  keanggotaanPenerbit: string; // Keanggotaan Penerbit Resmi (IKAPI / Asosiasi)
  keanggotaanPenerbitNote: string;
}

export interface AcademicModule {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  category: 'penulisan' | 'riset' | 'hukum';
  badge: string;
  duration: string;
  format: string;
  schedule: string;
  investment: string;
  targetAudience: string;
  curriculum: string[];
  facilities: string[];
  order?: number;
}

export interface CareerItem {
  id: string;
  title: string;
  department: string;
  type: string;
  location: string;
  deadline: string;
  requirements: string[];
  isActive: boolean;
  order: number;
  tagline?: string;
  quote?: string;
  description?: string;
  responsibilities?: string[];
  benefits?: string[];
  email?: string;
  emailSubject?: string;
  badge?: string;
  isFeatured?: boolean;
}

export interface BlogArticleItem {
  id: string;
  title: string;
  slug: string;
  author: string;
  category: string;
  publishDate: string;
  readTime: string;
  excerpt: string;
  content: string;
  coverImage: string;
  order: number;
}

export interface SiteContentSettings {
  brandName: string;
  brandSubname: string;
  companyFullName: string;
  companyCredentials: CompanyCredentials;
  navigation: SiteNavigationItem[];
  heroSlides: HeroSlide[];
  bestSellerSection: BestSellerSectionSettings;
  homeSections: HomeSectionConfig[];
  footer: FooterSettings;
  contact?: ContactSettings;
  penerbitanPackages: PenerbitanPackage[];
  workshops: WorkshopItem[];
  academicModules?: AcademicModule[];
  journals: JournalItem[];
  teamMembers: TeamMember[];
  legalDocs: LegalDoc[];
  careers: CareerItem[];
  blogArticles: BlogArticleItem[];
  updatedAt?: string;
}

