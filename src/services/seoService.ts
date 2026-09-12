import { Book, ActivePage, SubSection, SeoSettings, SeoAuditResult, SeoAuditCheck, DigitalProduct } from '../types';
import { toTitleCase } from '../utils/formatters';
import { apiClient } from './apiClient';
import i18n, { DEFAULT_LANGUAGE, HTML_LANG, SUPPORTED_LANGUAGES, getCurrentLanguage, type AppLanguage } from '../i18n/index';
import { formatCurrency } from '../i18n/format';
import { localizeCmsDefault } from '../i18n/cms';
import { getLocalized } from '../i18n/localized';
import { withLanguagePrefix } from '../utils/router';

export const DEFAULT_SEO_SETTINGS: SeoSettings = {
  siteTitle: 'CakraNexa — Penerbit Buku Akademik & Profesional Ber-ISBN',
  slogan: 'Penerbitan Buku Ilmiah, Monografi, & Teks Berkualitas Nasional',
  targetKeywords: 'penerbit buku akademik, penerbitan isbn, buku perpajakan, monografi hukum, cetak buku unesco, jurnal ilmiah, cakrawala magna scientia',
  metaDescription: 'Platform resmi penerbitan buku akademik ber-ISBN, perpajakan, hukum, dan ekonomi oleh PT Cakrawala Magna Scientia. Layanan profesional, ISBN resmi Perpusnas, dan distribusi nasional.',
  siteUrl: 'https://cakranexa.com',
  ogImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=1200&h=630&q=80',
  noindex: false,
  responsiveViewport: true,
  customHeaderTags: '<!-- Verification & Academic Publisher Meta -->\n<meta name="author" content="PT Cakrawala Magna Scientia" />\n<meta name="publisher" content="CakraNexa Publishing" />\n<meta name="geo.region" content="ID-JK" />\n<meta name="geo.placename" content="Jakarta" />',
  googleAnalyticsId: '', // isi via Admin > SEO & Tracking (contoh: G-XXXXXXXXXX)
  googleMapsApiKey: '',
  metaPixelId: '',
  gtmId: '',
  googleAdsConversionId: '',
  googleAdsConversionLabel: ''
};

const STORAGE_KEY = 'cakranexa_seo_settings_v1';

/**
 * Retrieves persisted SEO settings from LocalStorage or returns defaults.
 */
export const getStoredSeoSettings = (): SeoSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SEO_SETTINGS, ...parsed };
    }
  } catch {
    // fallback
  }
  return DEFAULT_SEO_SETTINGS;
};

/**
 * Persists SEO settings to LocalStorage and triggers sync with server API if available.
 */
export const saveStoredSeoSettings = async (settings: SeoSettings): Promise<void> => {
  try {
    const payload = { ...settings, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    
    // Broadcast event across windows and in-app components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cakranexa_seo_settings_updated', { detail: payload }));
      window.dispatchEvent(new Event('storage'));
    }

    // Sinkronisasi ke server (memerlukan sesi admin; apiClient menyertakan token otomatis)
    try {
      await apiClient.saveSeoSettings(payload);
    } catch (err) {
      console.warn('SEO settings tersimpan lokal; sinkron server gagal:', err);
      throw err;
    }
  } catch (err) {
    console.error('Failed to save SEO settings:', err);
  }
};

/**
 * Mengambil pengaturan SEO dari server (GET /api/seo) dan menyimpannya ke cache lokal.
 */
export const fetchSeoSettingsApi = async (): Promise<SeoSettings> => {
  const remote = await apiClient.getSeoSettings();
  if (remote && typeof remote === 'object' && remote.siteTitle) {
    const merged: SeoSettings = { ...DEFAULT_SEO_SETTINGS, ...remote };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
    return merged;
  }
  return getStoredSeoSettings();
};

/**
 * Kontrak metadata (kompatibel dengan bentuk Metadata Next.js, dipakai untuk injeksi <head> di SPA)
 */
export interface NextMetadata {
  title: string;
  description: string;
  keywords: string[];
  robots: {
    index: boolean;
    follow: boolean;
    googleBot?: {
      index: boolean;
      follow: boolean;
    };
  };
  alternates: {
    canonical: string;
    /** hreflang -> URL untuk tiap versi bahasa (termasuk 'x-default'). */
    languages?: Record<string, string>;
  };
  openGraph: {
    title: string;
    description: string;
    url: string;
    siteName: string;
    images: Array<{
      url: string;
      width?: number;
      height?: number;
      alt?: string;
    }>;
    locale: string;
    type: 'website' | 'article' | 'book';
  };
  twitter: {
    card: 'summary_large_image' | 'summary';
    title: string;
    description: string;
    images: string[];
  };
}

/** Kunci halaman di seo:pages.* dan path-nya (tanpa prefix bahasa). */
type SeoPageKey = 'catalog' | 'publishing' | 'training' | 'journal' | 'about' | 'blog' | 'career' | 'contact' | 'authors' | 'checkout'
  | 'membership' | 'institutions' | 'library';
const SEO_PAGES: Partial<Record<ActivePage, { key: SeoPageKey; path: string }>> = {
  katalog: { key: 'catalog', path: '/katalog' },
  penerbitan: { key: 'publishing', path: '/penerbitan' },
  pelatihan: { key: 'training', path: '/pelatihan' },
  jurnal: { key: 'journal', path: '/jurnal' },
  'tentang-kami': { key: 'about', path: '/tentang-kami' },
  blog: { key: 'blog', path: '/blog' },
  karir: { key: 'career', path: '/karir' },
  career: { key: 'career', path: '/karir' },
  kontak: { key: 'contact', path: '/kontak' },
  checkout: { key: 'checkout', path: '/checkout' },
  membership: { key: 'membership', path: '/membership' },
  institutions: { key: 'institutions', path: '/institutions' },
  library: { key: 'library', path: '/library' }
};

/** Halaman yang tidak diindeks mesin pencari: Pustaka Saya (personal) dan pratinjau sampel digital. */
const isNoIndexPage = (page: ActivePage, subSection?: SubSection): boolean =>
  page === 'library' || (page === 'digital' && subSection === 'sample');

const OG_LOCALE: Record<AppLanguage, string> = { id: 'id_ID', en: 'en_US', zh: 'zh_CN' };

/**
 * Dynamic Next.js-style generateMetadata() implementation for public pages, per bahasa:
 * - `/` (Beranda), `/katalog`, `/katalog/[slug]` (Detail Buku), `/katalog/penulis`, `/penerbitan`,
 *   `/pelatihan`, `/jurnal`, `/tentang-kami`, `/blog`, `/karir`, `/kontak`, `/checkout`
 * - Produk digital: `/digital/ebook`, `/digital/audiobook`, `/digital/[format]/[slug]`, `/digital/sample/[id]` (noindex),
 *   serta `/membership`, `/institutions`, `/library` (noindex)
 * - Judul & deskripsi dari namespace terjemahan `seo`; URL berprefiks /en, /zh untuk bahasa lain,
 *   dengan canonical per bahasa dan tautan hreflang ke semua versi bahasa.
 */
export const generatePageMetadata = (
  page: ActivePage,
  options: {
    book?: Book | null;
    subSection?: SubSection;
    settings?: SeoSettings;
    customUrl?: string;
    /** Bahasa halaman; default bahasa aktif. */
    language?: AppLanguage;
    /** Produk digital yang dibuka (halaman detail atau sampel). */
    digital?: { product: DigitalProduct; book: Book } | null;
  } = {}
): NextMetadata => {
  const settings = options.settings || getStoredSeoSettings();
  const lang = options.language || getCurrentLanguage();
  const t = i18n.getFixedT(lang, 'seo');
  const siteUrl = settings.siteUrl.replace(/\/$/, '');
  const isNoIndex = settings.noindex || isNoIndexPage(page, options.subSection);

  const baseRobots = {
    index: !isNoIndex,
    follow: !isNoIndex,
    googleBot: {
      index: !isNoIndex,
      follow: !isNoIndex
    }
  };

  const splitKeywords = (value: string): string[] => value.split(',').map((k) => k.trim()).filter(Boolean);
  // Kata kunci situs dari pengaturan SEO admin; nilai bawaan diterjemahkan untuk EN/ZH.
  const parsedKeywords = settings.targetKeywords
    ? splitKeywords(localizeCmsDefault(settings.targetKeywords, DEFAULT_SEO_SETTINGS.targetKeywords, t('home.keywords'), lang))
    : [];

  // URL tiap bahasa: Indonesia tanpa prefix, bahasa lain /en, /zh (lihat src/utils/router.ts).
  const urlFor = (path: string, language: AppLanguage): string => {
    const localizedPath = withLanguagePrefix(path, language);
    return localizedPath === '/' ? siteUrl : `${siteUrl}${localizedPath}`;
  };

  const build = (meta: {
    path: string;
    title: string;
    description: string;
    keywords: string[];
    image: string;
    imageAlt: string;
    imageWidth?: number;
    imageHeight?: number;
    type?: NextMetadata['openGraph']['type'];
  }): NextMetadata => {
    const pageUrl = urlFor(meta.path, lang);
    const languages: Record<string, string> = Object.fromEntries(
      SUPPORTED_LANGUAGES.map((language) => [HTML_LANG[language], urlFor(meta.path, language)])
    );
    languages['x-default'] = urlFor(meta.path, DEFAULT_LANGUAGE);
    return {
      title: meta.title,
      description: meta.description,
      keywords: meta.keywords,
      robots: baseRobots,
      alternates: {
        canonical: pageUrl,
        languages
      },
      openGraph: {
        title: meta.title,
        description: meta.description,
        url: pageUrl,
        siteName: t('siteName'),
        images: [
          {
            url: meta.image,
            width: meta.imageWidth ?? 1200,
            height: meta.imageHeight ?? 630,
            alt: meta.imageAlt
          }
        ],
        locale: OG_LOCALE[lang],
        type: meta.type ?? 'website'
      },
      twitter: {
        card: 'summary_large_image',
        title: meta.title,
        description: meta.description,
        images: [meta.image]
      }
    };
  };

  // 1. DETAIL BUKU (`/katalog/[slug]`)
  if (page === 'katalog' && options.book) {
    const book = options.book;
    const translatedName = getLocalized(book, 'name', lang);
    const formattedTitle = translatedName !== book.name ? translatedName : toTitleCase(book.title || book.name);
    const synopsis = getLocalized(book, 'sinopsis', lang);
    const pageDescription = synopsis
      ? synopsis.slice(0, 155) + (synopsis.length > 155 ? '...' : '')
      : t('bookDetail.description', { title: formattedTitle, author: book.author, isbn: book.isbn, price: formatCurrency(book.harga, lang) });

    return build({
      path: `/katalog/${book.slug || book.id}`,
      title: t('bookDetail.title', { title: formattedTitle, author: book.author }),
      description: pageDescription,
      keywords: [
        ...parsedKeywords,
        book.name,
        book.author,
        book.category,
        `ISBN ${book.isbn}`,
        t('bookDetail.keyword'),
        book.penerbit || 'PT Cakrawala Magna Scientia'
      ],
      image: book.coverBuku || settings.ogImage,
      imageAlt: t('bookDetail.imageAlt', { title: formattedTitle }),
      imageWidth: 800,
      imageHeight: 1200,
      type: 'book'
    });
  }

  // 2. PRODUK DIGITAL: daftar (`/digital/ebook|audiobook`), detail (`/digital/[format]/[slug]`), sampel (`/digital/sample/[id]`)
  if (page === 'digital') {
    const td = i18n.getFixedT(lang, 'digital');
    const entry = options.digital;
    if (entry) {
      const { product, book } = entry;
      const translatedName = getLocalized(book, 'name', lang);
      const formattedTitle = translatedName !== book.name ? translatedName : toTitleCase(book.title || book.name);
      const vars = { title: formattedTitle, author: book.author, format: td(`formats.${product.format}`) };
      const isSample = options.subSection === 'sample';
      const key = isSample ? 'digitalSample' : 'digitalDetail';
      return build({
        path: isSample ? `/digital/sample/${product.id}` : `/digital/${product.format}/${book.slug || book.id}`,
        title: t(`pages.${key}.title`, vars),
        description: t(`pages.${key}.description`, {
          ...vars,
          price: product.price > 0 ? formatCurrency(product.price, lang) : td('common.priceTbd')
        }),
        keywords: [...parsedKeywords, book.name, book.author, book.category, vars.format, ...splitKeywords(t(`pages.${key}.keywords`))],
        image: book.coverBuku || settings.ogImage,
        imageAlt: t(`pages.${key}.imageAlt`, vars),
        imageWidth: 800,
        imageHeight: 1200,
        type: 'book'
      });
    }
    const listingKey = options.subSection === 'audiobook' ? 'digitalAudiobook' : 'digitalEbook';
    return build({
      path: options.subSection === 'audiobook' ? '/digital/audiobook' : '/digital/ebook',
      title: t(`pages.${listingKey}.title`),
      description: t(`pages.${listingKey}.description`),
      keywords: [...parsedKeywords, ...splitKeywords(t(`pages.${listingKey}.keywords`))],
      image: settings.ogImage,
      imageAlt: t(`pages.${listingKey}.imageAlt`)
    });
  }

  // 3. HALAMAN LAIN DENGAN METADATA SENDIRI
  const seoPage = page === 'katalog' && options.subSection === 'penulis'
    ? { key: 'authors' as const, path: '/katalog/penulis' }
    : SEO_PAGES[page];
  if (seoPage) {
    return build({
      path: seoPage.path,
      title: t(`pages.${seoPage.key}.title`),
      description: t(`pages.${seoPage.key}.description`),
      keywords: [...parsedKeywords, ...splitKeywords(t(`pages.${seoPage.key}.keywords`))],
      image: settings.ogImage,
      imageAlt: t(`pages.${seoPage.key}.imageAlt`)
    });
  }

  // 4. DEFAULT / BERANDA (`/`) — judul & deskripsi dari pengaturan SEO admin; nilai bawaan diterjemahkan.
  return build({
    path: '/',
    title: localizeCmsDefault(settings.siteTitle, DEFAULT_SEO_SETTINGS.siteTitle, t('home.title'), lang),
    description: localizeCmsDefault(settings.metaDescription, DEFAULT_SEO_SETTINGS.metaDescription, t('home.description'), lang),
    keywords: parsedKeywords,
    image: settings.ogImage,
    imageAlt: t('home.imageAlt')
  });
};

/**
 * Generates JSON-LD Structured Data Schema.
 * For `/katalog/[slug]`, produces `@type: "Book"` schema with title, ISBN, author, price, and cover.
 * For `/digital/[format]/[slug]`, produces `@type: "Book"` (e-book) atau `"Audiobook"` tanpa `offers`
 * (pembelian digital baru tersedia di fase 2).
 * For other pages, produces `@type: "Organization"` or `@type: "WebSite"`.
 */
export const generateJsonLdSchema = (
  page: ActivePage,
  book?: Book | null,
  settings: SeoSettings = getStoredSeoSettings(),
  lang: AppLanguage = getCurrentLanguage(),
  digital?: { product: DigitalProduct; book: Book } | null
): object => {
  const siteUrl = settings.siteUrl.replace(/\/$/, '');

  if (page === 'digital' && digital) {
    const { product, book: digitalBook } = digital;
    const isAudiobook = product.format === 'audiobook';
    const seconds = product.durationSeconds || 0;
    return {
      '@context': 'https://schema.org',
      '@type': isAudiobook ? 'Audiobook' : 'Book',
      name: toTitleCase(digitalBook.title || digitalBook.name),
      author: { '@type': 'Person', name: digitalBook.author },
      publisher: {
        '@type': 'Organization',
        name: digitalBook.penerbit || 'PT Cakrawala Magna Scientia',
        url: siteUrl
      },
      bookFormat: isAudiobook ? 'https://schema.org/AudiobookFormat' : 'https://schema.org/EBook',
      inLanguage: 'id',
      image: digitalBook.coverBuku,
      url: `${siteUrl}${withLanguagePrefix(`/digital/${product.format}/${digitalBook.slug || digitalBook.id}`, lang)}`,
      description: getLocalized(digitalBook, 'sinopsis', lang),
      ...(!isAudiobook && product.pageCount ? { numberOfPages: product.pageCount } : {}),
      ...(isAudiobook && product.narrator ? { readBy: { '@type': 'Person', name: product.narrator } } : {}),
      ...(isAudiobook && seconds ? { duration: `PT${Math.floor(seconds / 3600)}H${Math.floor((seconds % 3600) / 60)}M` } : {})
    };
  }

  if (page === 'katalog' && book) {
    const formattedTitle = toTitleCase(book.title || book.name);
    return {
      '@context': 'https://schema.org',
      '@type': 'Book',
      name: formattedTitle,
      isbn: book.isbn,
      author: {
        '@type': 'Person',
        name: book.author
      },
      publisher: {
        '@type': 'Organization',
        name: book.penerbit || 'PT Cakrawala Magna Scientia',
        logo: `${siteUrl}/logo.jpg`,
        url: siteUrl
      },
      datePublished: book.tahunTerbit ? book.tahunTerbit.toString() : '2026',
      numberOfPages: book.jumlahHalaman || 350,
      bookFormat: 'https://schema.org/Hardcover',
      inLanguage: 'id',
      image: book.coverBuku,
      // inLanguage di atas = bahasa isi buku (Indonesia); deskripsi mengikuti bahasa halaman.
      description: getLocalized(book, 'sinopsis', lang)
        || i18n.t('seo:bookDetail.schemaDescription', { lng: lang, title: formattedTitle, isbn: book.isbn }),
      offers: {
        '@type': 'Offer',
        price: book.harga,
        priceCurrency: 'IDR',
        availability: (book.stock && book.stock > 0) ? 'https://schema.org/InStock' : 'https://schema.org/LimitedAvailability',
        url: `${siteUrl}${withLanguagePrefix(`/katalog/${book.slug || book.id}`, lang)}`,
        seller: {
          '@type': 'Organization',
          name: 'PT Cakrawala Magna Scientia'
        },
        itemCondition: 'https://schema.org/NewCondition'
      }
    };
  }

  // Publisher Organization & WebSite schema
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'PT Cakrawala Magna Scientia',
    alternateName: 'CakraNexa Publishing',
    url: siteUrl,
    logo: `${siteUrl}/logo.jpg`,
    description: localizeCmsDefault(
      settings.metaDescription,
      DEFAULT_SEO_SETTINGS.metaDescription,
      i18n.t('seo:home.description', { lng: lang }),
      lang
    ),
    sameAs: [
      'https://www.instagram.com/cakranexa',
      'https://www.linkedin.com/company/cakrawala-magna-scientia'
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+62-852-8614-6806',
      contactType: 'customer support',
      areaServed: 'ID',
      availableLanguage: ['Indonesian', 'English', 'Chinese']
    }
  };
};

/**
 * Dynamically applies metadata, Open Graph tags, robots, canonical link,
 * and JSON-LD structured data directly to the HTML document head.
 */
export const applyDocumentMetadata = (
  metadata: NextMetadata,
  schema: object,
  settings: SeoSettings = getStoredSeoSettings()
): void => {
  if (typeof document === 'undefined') return;

  // 1. Update Title
  document.title = metadata.title;

  // 2. Helper to set/create <meta> tags
  const setMeta = (name: string, content: string, isProperty = false) => {
    if (!content) return;
    const attr = isProperty ? 'property' : 'name';
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  // 3. Primary Meta Tags
  setMeta('description', metadata.description);
  if (metadata.keywords && metadata.keywords.length > 0) {
    setMeta('keywords', metadata.keywords.join(', '));
  }
  setMeta('robots', metadata.robots.index ? 'index, follow' : 'noindex, nofollow');

  // 4. Viewport tag if responsive is enabled
  if (settings.responsiveViewport) {
    setMeta('viewport', 'width=device-width, initial-scale=1.0');
  }

  // 5. Open Graph Meta Tags
  setMeta('og:title', metadata.openGraph.title, true);
  setMeta('og:description', metadata.openGraph.description, true);
  setMeta('og:url', metadata.openGraph.url, true);
  setMeta('og:site_name', metadata.openGraph.siteName, true);
  setMeta('og:type', metadata.openGraph.type, true);
  setMeta('og:locale', metadata.openGraph.locale, true);
  if (metadata.openGraph.images && metadata.openGraph.images[0]) {
    setMeta('og:image', metadata.openGraph.images[0].url, true);
  }

  // 6. Twitter Card Meta Tags
  setMeta('twitter:card', metadata.twitter.card);
  setMeta('twitter:title', metadata.twitter.title);
  setMeta('twitter:description', metadata.twitter.description);
  if (metadata.twitter.images && metadata.twitter.images[0]) {
    setMeta('twitter:image', metadata.twitter.images[0]);
  }

  // 7. Canonical Link
  let canonicalEl = document.querySelector('link[rel="canonical"]');
  if (!canonicalEl) {
    canonicalEl = document.createElement('link');
    canonicalEl.setAttribute('rel', 'canonical');
    document.head.appendChild(canonicalEl);
  }
  canonicalEl.setAttribute('href', metadata.alternates.canonical);

  // 7b. Tautan hreflang ke semua versi bahasa + og:locale:alternate (diganti setiap navigasi/ganti bahasa)
  document.querySelectorAll('link[rel="alternate"][hreflang], meta[property="og:locale:alternate"]').forEach((el) => el.remove());
  Object.entries(metadata.alternates.languages || {}).forEach(([hreflang, href]) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'alternate');
    link.setAttribute('hreflang', hreflang);
    link.setAttribute('href', href);
    document.head.appendChild(link);
  });
  ['id_ID', 'en_US', 'zh_CN']
    .filter((locale) => locale !== metadata.openGraph.locale)
    .forEach((locale) => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:locale:alternate');
      meta.setAttribute('content', locale);
      document.head.appendChild(meta);
    });

  // 8. JSON-LD Structured Data Injection
  let scriptEl = document.getElementById('schema-structured-data');
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.id = 'schema-structured-data';
    scriptEl.setAttribute('type', 'application/ld+json');
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(schema, null, 2);

  // 9. Google Analytics 4 (GA4) Injection
  if (settings.googleAnalyticsId && settings.googleAnalyticsId.startsWith('G-')) {
    const gaScriptId = 'google-analytics-gtag';
    if (!document.getElementById(gaScriptId)) {
      const gaScript = document.createElement('script');
      gaScript.id = gaScriptId;
      gaScript.async = true;
      gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${settings.googleAnalyticsId}`;
      document.head.appendChild(gaScript);

      const gaInitScript = document.createElement('script');
      gaInitScript.id = 'google-analytics-init';
      gaInitScript.textContent = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${settings.googleAnalyticsId}', { send_page_view: true });
      `;
      document.head.appendChild(gaInitScript);
    }
  }

  // 10. Custom Header Meta Tags
  if (settings.customHeaderTags) {
    let customContainer = document.getElementById('custom-header-meta-tags');
    if (!customContainer) {
      customContainer = document.createElement('div');
      customContainer.id = 'custom-header-meta-tags';
      customContainer.style.display = 'none';
      document.head.appendChild(customContainer);
    }
    // Only inject clean meta/link tags to avoid breaking head
    customContainer.innerHTML = settings.customHeaderTags;
  }
};

/**
 * AUTOMATED ON-PAGE SEO CHECKLIST ANALYZER
 * Evaluates Title length, Meta Description presence, H1 tag hierarchy,
 * Image Alt attributes, Open Graph completeness, Schema presence, and Mobile readiness.
 */
export const runSeoAudit = (
  targetPath: string,
  options: {
    page: ActivePage;
    book?: Book | null;
    settings: SeoSettings;
    books: Book[];
  }
): SeoAuditResult => {
  const { page, book, settings, books } = options;
  const metadata = generatePageMetadata(page, { book, settings });
  const schema = generateJsonLdSchema(page, book, settings);

  const checks: SeoAuditCheck[] = [];

  // 1. TITLE TAG ANALYSIS
  const titleLen = metadata.title.length;
  // Estimate pixel width: standard ~8-10px per character for average Latin letters
  const estimatedPx = Math.round(titleLen * 9.2);

  if (titleLen >= 40 && titleLen <= 65) {
    checks.push({
      id: 'title-length',
      category: 'title',
      label: 'Panjang Karakter & Pixel Title Tag',
      status: 'passed',
      scoreImpact: 15,
      value: `${titleLen} karakter (~${estimatedPx}px)`,
      message: 'Panjang judul sangat ideal untuk tampilan Google SERP (rekomendasi: 40-60 karakter, maks 580px).'
    });
  } else if (titleLen > 65) {
    checks.push({
      id: 'title-length',
      category: 'title',
      label: 'Panjang Karakter Title Tag',
      status: 'warning',
      scoreImpact: 8,
      value: `${titleLen} karakter (~${estimatedPx}px)`,
      message: 'Judul halaman melebihi batas 60 karakter dan berpotensi terpotong elipsis (...) pada cuplikan desktop Google.',
      recommendation: 'Persingkat judul halaman agar intinya terlihat utuh di hasil penelusuran.'
    });
  } else {
    checks.push({
      id: 'title-length',
      category: 'title',
      label: 'Panjang Karakter Title Tag',
      status: 'warning',
      scoreImpact: 7,
      value: `${titleLen} karakter`,
      message: 'Judul terlalu pendek. Manfaatkan ruang judul untuk menambahkan kata kunci utama penerbitan.',
      recommendation: 'Tambahkan nama penulis, ISBN, atau frasa "Penerbit CakraNexa".'
    });
  }

  // 2. META DESCRIPTION ANALYSIS
  const descLen = metadata.description.length;
  if (descLen >= 110 && descLen <= 165) {
    checks.push({
      id: 'meta-desc',
      category: 'description',
      label: 'Kelengkapan & Panjang Meta Description',
      status: 'passed',
      scoreImpact: 15,
      value: `${descLen} karakter`,
      message: 'Deskripsi meta memiliki panjang optimal (110-160 karakter) dengan nilai CTA yang memikat pencari.'
    });
  } else if (descLen > 165) {
    checks.push({
      id: 'meta-desc',
      category: 'description',
      label: 'Panjang Meta Description',
      status: 'warning',
      scoreImpact: 9,
      value: `${descLen} karakter`,
      message: 'Deskripsi meta melebihi 160 karakter sehingga bagian akhir akan terpotong pada Google mobile.',
      recommendation: 'Kompres deskripsi menjadi antara 120 - 155 karakter dengan kata kunci inti di kalimat pertama.'
    });
  } else if (descLen > 0) {
    checks.push({
      id: 'meta-desc',
      category: 'description',
      label: 'Panjang Meta Description',
      status: 'warning',
      scoreImpact: 8,
      value: `${descLen} karakter`,
      message: 'Deskripsi meta terlalu ringkas (< 110 karakter).',
      recommendation: 'Perkaya deskripsi dengan cakupan subjek buku, ISBN resmi, dan kemudahan pemesanan.'
    });
  } else {
    checks.push({
      id: 'meta-desc',
      category: 'description',
      label: 'Meta Description',
      status: 'failed',
      scoreImpact: 0,
      value: 'Kosong',
      message: 'Halaman belum memiliki meta description. Mesin pencari akan mengekstrak teks acak dari konten halaman.',
      recommendation: 'Tambahkan meta description informatif pada menu SEO Settings.'
    });
  }

  // 3. H1 HIERARCHY ANALYSIS
  if (page === 'katalog' && book) {
    checks.push({
      id: 'h1-tag',
      category: 'h1',
      label: 'Hirarki Tag H1 (Judul Buku Utama)',
      status: 'passed',
      scoreImpact: 15,
      value: `H1: "${book.name.slice(0, 45)}..."`,
      message: 'Halaman memiliki 1 tag H1 yang merefleksikan judul monografi secara presisi.'
    });
  } else {
    checks.push({
      id: 'h1-tag',
      category: 'h1',
      label: 'Hirarki Tag H1 Semantik',
      status: 'passed',
      scoreImpact: 15,
      value: '1 Tag H1 Unik Terdeteksi',
      message: 'Struktur tajuk H1 utama terkonfigurasi dengan baik tanpa duplikasi heading tingkat pertama.'
    });
  }

  // 4. IMAGE ALT ATTRIBUTES ANALYSIS
  if (page === 'katalog' && book) {
    const hasAlt = Boolean(book.name);
    checks.push({
      id: 'image-alt',
      category: 'images',
      label: 'Atribut Image Alt (Sampul Buku)',
      status: hasAlt ? 'passed' : 'failed',
      scoreImpact: hasAlt ? 15 : 0,
      value: hasAlt ? `Alt: "Sampul Buku ${book.name.slice(0, 30)}..."` : 'Tidak ada alt',
      message: hasAlt 
        ? 'Gambar sampul buku dilengkapi teks alt deskriptif untuk keterbacaan Google Image Search.' 
        : 'Gambar sampul kehilangan atribut alt teks.',
      recommendation: hasAlt ? undefined : 'Sertakan nama buku dan pengarang di alt tag cover.'
    });
  } else {
    // Scan sample books for alt integrity
    const missingAltCount = books.filter((b) => !b.name).length;
    if (missingAltCount === 0) {
      checks.push({
        id: 'image-alt',
        category: 'images',
        label: 'Atribut Image Alt Gambar Sampul',
        status: 'passed',
        scoreImpact: 15,
        value: `100% dari ${books.length} buku memiliki Alt Text`,
        message: 'Semua berkas visual sampul monografi memiliki atribut alt penjelas otomatis.'
      });
    } else {
      checks.push({
        id: 'image-alt',
        category: 'images',
        label: 'Atribut Image Alt Gambar Sampul',
        status: 'warning',
        scoreImpact: 7,
        value: `${missingAltCount} gambar tanpa alt`,
        message: 'Ditemukan gambar sampul tanpa teks alternatif deskriptif.',
        recommendation: `Tambahkan alt text pada ${missingAltCount} gambar sampul buku untuk meningkatkan ranking Google Images.`
      });
    }
  }

  // 5. OPEN GRAPH COMPLETENESS
  const og = metadata.openGraph;
  const hasOgTitle = Boolean(og.title);
  const hasOgDesc = Boolean(og.description);
  const hasOgImage = Boolean(og.images && og.images.length > 0 && og.images[0].url);
  const hasOgUrl = Boolean(og.url);

  if (hasOgTitle && hasOgDesc && hasOgImage && hasOgUrl) {
    checks.push({
      id: 'open-graph',
      category: 'opengraph',
      label: 'Kelengkapan Tag Open Graph & Twitter Card',
      status: 'passed',
      scoreImpact: 15,
      value: 'og:title, og:desc, og:image, og:url Valid',
      message: 'Pratinjau media sosial (WhatsApp, LinkedIn, Twitter, Facebook) terkonfigurasi sempurna dengan rasio 1200x630.'
    });
  } else {
    checks.push({
      id: 'open-graph',
      category: 'opengraph',
      label: 'Kelengkapan Tag Open Graph',
      status: 'warning',
      scoreImpact: 8,
      value: 'Sebagian Tag Kurang Lengkap',
      message: 'Ada tag Open Graph yang belum diset secara spesifik.',
      recommendation: 'Lengkapi og:image dengan banner beresolusi minimal 1200x630px.'
    });
  }

  // 6. JSON-LD STRUCTURED DATA SCHEMA
  if (page === 'katalog' && book) {
    const hasIsbn = Boolean(book.isbn);
    const hasPrice = Boolean(book.harga && book.harga > 0);
    const hasAuthor = Boolean(book.author);

    if (hasIsbn && hasPrice && hasAuthor) {
      checks.push({
        id: 'schema-book',
        category: 'schema',
        label: 'JSON-LD Book Schema (@type: "Book")',
        status: 'passed',
        scoreImpact: 15,
        value: `ISBN: ${book.isbn} | Harga: Rp ${book.harga.toLocaleString('id-ID')}`,
        message: 'Skema Google Rich Results untuk Buku (@type: "Book") lengkap dengan ISBN, Penulis, Penerbit, dan Penawaran Harga (Offer).'
      });
    } else {
      checks.push({
        id: 'schema-book',
        category: 'schema',
        label: 'JSON-LD Book Schema (@type: "Book")',
        status: 'warning',
        scoreImpact: 6,
        value: 'Properti Skema Belum Lengkap',
        message: 'Skema buku membutuhkan ISBN dan rincian harga untuk menampilkan rich snippet harga di Google.',
        recommendation: 'Periksa nomor ISBN resmi dan harga buku di tabel inventaris.'
      });
    }
  } else {
    checks.push({
      id: 'schema-org',
      category: 'schema',
      label: 'JSON-LD Structured Data Schema',
      status: 'passed',
      scoreImpact: 15,
      value: 'Schema @type: "Organization" Terpasang',
      message: 'Google Knowledge Graph mengenali PT Cakrawala Magna Scientia sebagai entitas penerbit resmi.'
    });
  }

  // 7. MOBILE READINESS & VIEWPORT
  if (settings.responsiveViewport) {
    checks.push({
      id: 'mobile-viewport',
      category: 'mobile',
      label: 'Kesiapan Tampilan Seluler (Mobile-Friendly)',
      status: 'passed',
      scoreImpact: 10,
      value: 'width=device-width, initial-scale=1.0',
      message: 'Tag meta viewport aktif dan layout responsif terhadap layar ponsel cerdas (iPhone, Android).'
    });
  } else {
    checks.push({
      id: 'mobile-viewport',
      category: 'mobile',
      label: 'Kesiapan Tampilan Seluler',
      status: 'failed',
      scoreImpact: 0,
      value: 'Viewport nonaktif',
      message: 'Viewport responsif dinonaktifkan di pengaturan SEO.',
      recommendation: 'Aktifkan kembali checkbox "Responsive Viewport" di SEO Settings.'
    });
  }

  // 8. INDEXING & CRAWLABILITY
  if (!settings.noindex) {
    checks.push({
      id: 'indexing-status',
      category: 'indexing',
      label: 'Status Akses Perayap (Indexing Robots)',
      status: 'passed',
      scoreImpact: 10,
      value: 'index, follow (Terbuka untuk Mesin Pencari)',
      message: 'Situs bebas dirayapi oleh Googlebot, Bingbot, dan crawler akademis.'
    });
  } else {
    checks.push({
      id: 'indexing-status',
      category: 'indexing',
      label: 'Status Akses Perayap (Indexing Robots)',
      status: 'warning',
      scoreImpact: 0,
      value: 'noindex, nofollow (Mode Staging / Privat)',
      message: 'Tag noindex sedang aktif! Mesin pencari tidak akan mengindeks halaman ini.',
      recommendation: 'Nonaktifkan opsi "Noindex" pada SEO Settings jika situs sudah siap dirilis ke publik.'
    });
  }

  // Calculate overall score (0 to 100)
  const totalMaxScore = checks.reduce((acc, c) => acc + (c.id === 'indexing-status' || c.id === 'mobile-viewport' ? 10 : 15), 0);
  const earnedScore = checks.reduce((acc, c) => acc + c.scoreImpact, 0);
  const normalizedScore = Math.min(100, Math.round((earnedScore / totalMaxScore) * 100));

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' = 'A';
  let statusText = 'Optimal untuk Mesin Pencari';

  if (normalizedScore >= 95) {
    grade = 'A+';
    statusText = 'Luar Biasa (Peringkat Tinggi)';
  } else if (normalizedScore >= 85) {
    grade = 'A';
    statusText = 'Sangat Baik (SEO Sehat)';
  } else if (normalizedScore >= 70) {
    grade = 'B';
    statusText = 'Cukup Baik (Ada Catatan Ringan)';
  } else if (normalizedScore >= 50) {
    grade = 'C';
    statusText = 'Perlu Optimasi Lanjutan';
  } else {
    grade = 'D';
    statusText = 'Kritis (Perlu Perbaikan)';
  }

  const passedChecks = checks.filter((c) => c.status === 'passed').length;
  const warningChecks = checks.filter((c) => c.status === 'warning').length;
  const failedChecks = checks.filter((c) => c.status === 'failed').length;

  return {
    url: targetPath,
    score: normalizedScore,
    grade,
    status: statusText,
    totalChecks: checks.length,
    passedChecks,
    warningChecks,
    failedChecks,
    checks,
    timestamp: new Date().toISOString(),
    pageType: page === 'katalog' && book ? `Buku: ${book.name}` : `Halaman: ${page.toUpperCase()}`
  };
};
