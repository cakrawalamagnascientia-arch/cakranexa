import React, { useState } from 'react';
import { 
  Globe, 
  Search, 
  Smartphone, 
  Monitor, 
  Save, 
  RotateCcw, 
  Check, 
  AlertCircle, 
  Code, 
  BarChart2, 
  BarChart3,
  MapPin, 
  Tag, 
  ShieldAlert,
  HelpCircle,
  Target,
  Layers,
  Activity,
  CheckCircle2,
  Play,
  ExternalLink
} from 'lucide-react';
import { SeoSettings } from '../types';
import { 
  trackPageView, 
  trackViewContent, 
  trackAddToCart, 
  trackInitiateCheckout, 
  trackPurchase 
} from '../services/trackingService';

interface SeoSettingsTabProps {
  settings: SeoSettings;
  onSaveSettings: (newSettings: SeoSettings) => void;
  onResetSettings: () => void;
  onRunAuditFromSettings?: () => void;
}

export const SeoSettingsTab: React.FC<SeoSettingsTabProps> = ({
  settings,
  onSaveSettings,
  onResetSettings,
  onRunAuditFromSettings
}) => {
  const [formData, setFormData] = useState<SeoSettings>({ ...settings });
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testNotification, setTestNotification] = useState<string | null>(null);

  // Sync state if props change
  React.useEffect(() => {
    setFormData({ ...settings });
  }, [settings]);

  const showTestToast = (msg: string) => {
    setTestNotification(msg);
    setTimeout(() => setTestNotification(null), 3500);
  };

  // Pixel and character estimation
  const titleCharCount = formData.siteTitle.length;
  const titleEstimatedPx = Math.round(titleCharCount * 9.2);
  const descCharCount = formData.metaDescription.length;

  // Title validation status
  const isTitleOptimal = titleCharCount >= 40 && titleCharCount <= 65;
  const isTitleTooLong = titleCharCount > 65;
  
  // Description validation status
  const isDescOptimal = descCharCount >= 110 && descCharCount <= 165;
  const isDescTooLong = descCharCount > 165;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const parsedKeywordTags = formData.targetKeywords
    ? formData.targetKeywords.split(',').map(k => k.trim()).filter(Boolean)
    : [];

  // Handlers for testing events
  const handleTestEvent = (eventType: 'pageview' | 'view_content' | 'add_to_cart' | 'initiate_checkout' | 'purchase') => {
    const dummyBook = {
      id: 'demo-tax-101',
      name: 'Hukum & Tata Kelola Perpajakan Indonesia (Edisi 2026)',
      slug: 'hukum-tata-kelola-perpajakan',
      author: 'Dr. Hendra Wibowo, S.H., M.H.',
      category: 'Perpajakan' as const,
      isbn: '978-623-09-8812-4',
      tahunTerbit: 2026,
      jumlahHalaman: 380,
      ukuranBuku: '15.5 x 23 cm',
      harga: 165000,
      sinopsis: 'Buku referensi lengkap hukum pajak Indonesia...',
      linkPembelian: '#',
      bukuTerbaru: true,
      penerbit: 'PT Cakrawala Magna Scientia',
      coverBuku: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'
    };

    if (eventType === 'pageview') {
      trackPageView(window.location.href, 'Uji PageView - Admin Portal');
      showTestToast('Event [PageView] berhasil dikirim ke Meta Pixel & Google Analytics!');
    } else if (eventType === 'view_content') {
      trackViewContent(dummyBook);
      showTestToast('Event [ViewContent / view_item] berhasil ditembakkan!');
    } else if (eventType === 'add_to_cart') {
      trackAddToCart(dummyBook, 1);
      showTestToast('Event [AddToCart / add_to_cart] berhasil ditembakkan (Rp 165.000)!');
    } else if (eventType === 'initiate_checkout') {
      trackInitiateCheckout([{ book: dummyBook, quantity: 1 }], 165000);
      showTestToast('Event [InitiateCheckout / begin_checkout] berhasil ditembakkan!');
    } else if (eventType === 'purchase') {
      const dummyOrder = {
        id: `ord-test-${Date.now()}`,
        orderNumber: `ORD-TEST-${Date.now().toString().slice(-4)}`,
        items: [{ book: dummyBook, quantity: 1 }],
        subtotal: 165000,
        shippingCost: 14000,
        total: 179000,
        customer: {
          name: 'Testing Buyer',
          email: 'test@example.com',
          phone: '081234567890',
          address: 'Jl. Testing No. 1',
          province: 'DKI Jakarta',
          city: 'Jakarta Pusat',
          district: 'Salemba',
          postalCode: '10440',
          courier: 'JNE Express'
        },
        paymentMethod: 'manual_mandiri' as const,
        paymentStatus: 'paid' as const,
        createdAt: new Date().toISOString()
      };
      trackPurchase(dummyOrder, formData);
      showTestToast(`Event [Purchase] berhasil ditembakkan (Rp 179.000 - ${dummyOrder.orderNumber})!`);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {testNotification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{testNotification}</span>
        </div>
      )}
      
      {/* Header & Quick Actions */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-slate-900 text-[#D4AF37]">
              <Globe className="w-4 h-4" />
            </span>
            <h2 className="text-lg font-bold text-slate-900 font-sans tracking-tight">
              SEO, Meta Tags & Tracking Marketing
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded-full">
              Meta Pixel & Google Ads Integrated
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
            Kelola metadata global, penargetan kata kunci akademik, Google Analytics 4, Meta Pixel ID, Google Tag Manager, serta Google Ads Conversion Tracking secara terpusat.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onResetSettings}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Default</span>
          </button>

          {onRunAuditFromSettings && (
            <button
              type="button"
              onClick={onRunAuditFromSettings}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-amber-600" />
              <span>Audit Halaman Ini</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 text-xs font-bold text-slate-900 bg-[#D4AF37] hover:bg-[#c5a059] rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {savedSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{savedSuccess ? 'Tersimpan!' : 'Simpan Perubahan'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Form Inputs (Left) & Real-Time Google SERP Live Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Configuration Form */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            
            {/* Field 1: SEO Title */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>SEO Title (Judul Meta Utama)</span>
                  <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                    isTitleOptimal 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold' 
                      : isTitleTooLong 
                        ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                        : 'bg-slate-100 text-slate-600'
                  }`}>
                    {titleCharCount}/60 karakter (~{titleEstimatedPx}px / 580px max)
                  </span>
                </div>
              </div>
              <input
                type="text"
                value={formData.siteTitle}
                onChange={(e) => setFormData({ ...formData, siteTitle: e.target.value })}
                placeholder="Contoh: CakraNexa — Penerbit Buku Akademik & Profesional Ber-ISBN"
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border ${
                  isTitleTooLong ? 'border-amber-300 focus:border-amber-500' : 'border-slate-200 focus:border-slate-900'
                } focus:outline-none transition-colors font-sans text-slate-900`}
                required
              />
              <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Rekomendasi Google: 50–60 karakter agar tidak terpotong di hasil pencarian.</span>
                {isTitleOptimal && <span className="text-emerald-600 font-semibold flex items-center gap-1"><Check className="w-3 h-3" /> Optimal</span>}
              </p>
            </div>

            {/* Field 2: Slogan & Target Keywords */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">
                  Slogan Publikasi
                </label>
                <input
                  type="text"
                  value={formData.slogan}
                  onChange={(e) => setFormData({ ...formData, slogan: e.target.value })}
                  placeholder="Contoh: Penerbitan Monografi & Buku Ilmiah Terpercaya"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">
                  Target Domain URL
                </label>
                <input
                  type="url"
                  value={formData.siteUrl}
                  onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
                  placeholder="https://cakranexa.com"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none transition-colors font-mono"
                  required
                />
              </div>
            </div>

            {/* Target Keywords with Pills */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-slate-500" />
                  <span>Target Keywords (Pisahkan dengan koma)</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  {parsedKeywordTags.length} kata kunci
                </span>
              </div>
              <input
                type="text"
                value={formData.targetKeywords}
                onChange={(e) => setFormData({ ...formData, targetKeywords: e.target.value })}
                placeholder="buku akademik, penerbitan isbn, buku perpajakan, monografi hukum"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none transition-colors text-slate-900"
              />
              
              {/* Keyword Pills Preview */}
              {parsedKeywordTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {parsedKeywordTags.map((kw, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200/60"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Field 3: SEO Meta Description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>SEO Meta Description (Ringkasan Cuplikan)</span>
                  <span className="text-red-500">*</span>
                </label>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                  isDescOptimal 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold' 
                    : isDescTooLong 
                      ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                      : 'bg-slate-100 text-slate-600'
                }`}>
                  {descCharCount}/160 karakter
                </span>
              </div>
              <textarea
                rows={3}
                value={formData.metaDescription}
                onChange={(e) => setFormData({ ...formData, metaDescription: e.target.value })}
                placeholder="Tuliskan deskripsi meta yang padat mengenai layanan penerbitan dan katalog buku akademik CakraNexa..."
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border ${
                  isDescTooLong ? 'border-amber-300 focus:border-amber-500' : 'border-slate-200 focus:border-slate-900'
                } focus:outline-none transition-colors font-sans text-slate-800 leading-relaxed`}
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Idealnya antara 120–160 karakter untuk memastikan teks terlihat utuh di perangkat seluler dan desktop.
              </p>
            </div>

            {/* Open Graph Image URL */}
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1.5">
                Open Graph Image Banner URL (Rasio 1200x630)
              </label>
              <input
                type="url"
                value={formData.ogImage}
                onChange={(e) => setFormData({ ...formData, ogImage: e.target.value })}
                placeholder="https://cakranexa.com/images/og-banner.jpg"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none transition-colors font-mono"
              />
            </div>

            {/* Robot Checkbox Options */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-900">
                Pengaturan Robot & Tampilan
              </div>

              {/* Noindex toggle */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.noindex}
                  onChange={(e) => setFormData({ ...formData, noindex: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded text-slate-900 focus:ring-slate-800"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Aktifkan tag Noindex (Blokir Perayap Mesin Pencari)
                    </span>
                    {formData.noindex && (
                      <span className="px-1.5 py-0.2 text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200 rounded">
                        Staging Mode
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Gunakan opsi ini hanya ketika situs sedang dalam tahap pemeliharaan atau prapublikasi.
                  </p>
                </div>
              </label>

              {/* Responsive viewport toggle */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.responsiveViewport}
                  onChange={(e) => setFormData({ ...formData, responsiveViewport: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded text-slate-900 focus:ring-slate-800"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    Aktifkan Responsive Viewport Meta Tag
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Menyisipkan tag <code className="text-[10px] bg-slate-200 px-1 py-0.5 rounded font-mono">width=device-width, initial-scale=1.0</code> untuk menjamin indeks Mobile-First Google.
                  </p>
                </div>
              </label>
            </div>

            {/* ============================================================== */}
            {/* DIGITAL MARKETING & TRACKING INFRASTRUCTURE (META & GOOGLE ADS) */}
            {/* ============================================================== */}
            <div className="border-t border-slate-200 pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Digital Marketing & Tracking Pixels
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Konfigurasi Pixel Meta (Facebook Ads), GA4, GTM, dan Konversi Google Ads.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                  E-Commerce Events Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Meta Pixel ID */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-[#1877F2]" />
                      <span>Meta Pixel ID (Facebook Ads)</span>
                    </label>
                    {formData.metaPixelId ? (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                        Aktif
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400">Belum diatur</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.metaPixelId || ''}
                    onChange={(e) => setFormData({ ...formData, metaPixelId: e.target.value.trim() })}
                    placeholder="Contoh: 123456789012345"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-slate-900 focus:outline-none transition-colors font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block">
                    ID Pixel Meta untuk melacak PageView, ViewContent, AddToCart, & Purchase.
                  </span>
                </div>

                {/* Google Analytics 4 (GA4) */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <BarChart2 className="w-3.5 h-3.5 text-[#EA4335]" />
                      <span>Google Analytics 4 (GA4)</span>
                    </label>
                    {formData.googleAnalyticsId ? (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                        Aktif
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400">Belum diatur</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.googleAnalyticsId || ''}
                    onChange={(e) => setFormData({ ...formData, googleAnalyticsId: e.target.value.trim() })}
                    placeholder="G-XXXXXXXXXX"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-slate-900 focus:outline-none transition-colors font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block">
                    Measurement ID dari properti GA4.
                  </span>
                </div>

                {/* Google Tag Manager (GTM) */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#34A853]" />
                      <span>Google Tag Manager (GTM)</span>
                    </label>
                    {formData.gtmId ? (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                        Aktif
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400">Opsional</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.gtmId || ''}
                    onChange={(e) => setFormData({ ...formData, gtmId: e.target.value.trim() })}
                    placeholder="GTM-XXXXXXX"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-slate-900 focus:outline-none transition-colors font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block">
                    Container ID GTM untuk manajemen tag fleksibel.
                  </span>
                </div>

                {/* Google Maps API Key */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-600" />
                      <span>Google Maps API Key</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    value={formData.googleMapsApiKey || ''}
                    onChange={(e) => setFormData({ ...formData, googleMapsApiKey: e.target.value.trim() })}
                    placeholder="AIzaSy..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-slate-900 focus:outline-none transition-colors font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block">
                    Untuk embedding peta kontak kantor penerbitan.
                  </span>
                </div>
              </div>

              {/* Google Ads Conversion Tracking (ID + Label) */}
              <div className="p-4 rounded-xl border border-slate-200 bg-amber-50/40 space-y-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-slate-900">
                    Google Ads Conversion Tracking (Purchase Tracking)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Digunakan untuk mengukur efektivitas kampanye Google Ads saat pembeli menyelesaikan pesanan buku.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Google Ads Conversion ID (AW-...)
                    </label>
                    <input
                      type="text"
                      value={formData.googleAdsConversionId || ''}
                      onChange={(e) => setFormData({ ...formData, googleAdsConversionId: e.target.value.trim() })}
                      placeholder="AW-1234567890"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-slate-900 focus:outline-none transition-colors font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Google Ads Conversion Label
                    </label>
                    <input
                      type="text"
                      value={formData.googleAdsConversionLabel || ''}
                      onChange={(e) => setFormData({ ...formData, googleAdsConversionLabel: e.target.value.trim() })}
                      placeholder="Contoh: AB12_CD34_EF56"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-slate-900 focus:outline-none transition-colors font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* E-Commerce Events Diagnostic & Testing Panel */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-900 text-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#DFBF64]" />
                    <span className="text-xs font-bold text-white">
                      Uji & Validasi Event E-Commerce (Live Sandbox Test)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Console Logs Enabled</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Klik tombol uji di bawah untuk menembakkan event simulasi ke Meta Pixel dan Google Analytics secara langsung:
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleTestEvent('pageview')}
                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-blue-400" />
                    <span>Uji PageView</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestEvent('view_content')}
                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-indigo-400" />
                    <span>Uji ViewContent</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestEvent('add_to_cart')}
                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-emerald-400" />
                    <span>Uji AddToCart</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestEvent('initiate_checkout')}
                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-amber-400" />
                    <span>Uji InitiateCheckout</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestEvent('purchase')}
                    className="px-2.5 py-1.5 text-[11px] font-bold bg-[#DFBF64] hover:bg-[#c5a059] text-slate-900 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-slate-900" />
                    <span>Uji Purchase Event</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Field 6: Additional Header Meta Tags */}
            <div className="border-t border-slate-200 pt-5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5 text-slate-500" />
                  <span>Additional Header Meta Tags (Custom Scripts / Meta)</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">HTML / Tag</span>
              </div>
              <textarea
                rows={3}
                value={formData.customHeaderTags}
                onChange={(e) => setFormData({ ...formData, customHeaderTags: e.target.value })}
                placeholder={'<meta name="author" content="PT Cakrawala Magna Scientia" />\n<meta name="google-site-verification" content="..." />'}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none transition-colors font-mono text-slate-700 bg-slate-50 leading-normal"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Disisipkan secara aman ke dalam tag <code className="font-mono text-[10px]">&lt;head&gt;</code> situs web.
              </p>
            </div>

            {/* Save Button */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="submit"
                className="px-6 py-2.5 text-xs font-bold text-slate-900 bg-[#D4AF37] hover:bg-[#c5a059] rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                {savedSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                <span>{savedSuccess ? 'Berhasil Disimpan' : 'Simpan Semua Pengaturan SEO & Tracking'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: Real-Time Google SERP Live Preview & Pixel Status */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs sticky top-6 space-y-5">
            
            {/* Toggle Desktop vs Mobile */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                  Pratinjau Hasil Google SERP
                </span>
                <span className="text-[11px] text-slate-400">
                  Tampilan cuplikan langsung di mesin pencari
                </span>
              </div>

              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setPreviewMode('desktop')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    previewMode === 'desktop'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Monitor className="w-3 h-3" />
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('mobile')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    previewMode === 'mobile'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Smartphone className="w-3 h-3" />
                  <span>Mobile</span>
                </button>
              </div>
            </div>

            {/* PREVIEW CONTAINER */}
            <div className="bg-[#FFFFFF] p-4 rounded-xl border border-slate-200/90 shadow-inner">
              
              {previewMode === 'desktop' ? (
                /* DESKTOP GOOGLE SERP PREVIEW */
                <div className="space-y-1.5 font-sans">
                  {/* URL and Favicon */}
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-5 h-5 rounded-full bg-slate-900 flex items-center justify-center p-0.5 shrink-0">
                      <div className="w-full h-full rounded-full bg-[#DFBF64] flex items-center justify-center text-[9px] font-black text-slate-900">
                        C
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[13px] text-[#202124] font-medium block leading-none">
                        CakraNexa
                      </span>
                      <span className="text-[11px] text-[#4d5156] truncate block leading-tight font-mono">
                        {formData.siteUrl || 'https://cakranexa.com'}
                      </span>
                    </div>
                  </div>

                  {/* Title Link */}
                  <h3 className="text-base sm:text-lg text-[#1a0dab] font-normal leading-snug hover:underline cursor-pointer tracking-tight pt-0.5">
                    {formData.siteTitle || 'CakraNexa — Penerbit Buku Akademik & Profesional Ber-ISBN'}
                  </h3>

                  {/* Meta Description */}
                  <p className="text-[13px] text-[#4d5156] leading-relaxed line-clamp-3">
                    {formData.metaDescription || 'Platform resmi penerbitan buku akademik ber-ISBN, perpajakan, hukum, dan ekonomi oleh PT Cakrawala Magna Scientia...'}
                  </p>

                  {/* Sitelinks Preview */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#1a0dab]">
                    <span className="hover:underline cursor-pointer">Katalog Buku Akademik</span>
                    <span className="hover:underline cursor-pointer">Kirim Naskah ISBN</span>
                    <span className="hover:underline cursor-pointer">Tentang Penerbit</span>
                  </div>
                </div>
              ) : (
                /* MOBILE GOOGLE SERP PREVIEW */
                <div className="max-w-[320px] mx-auto bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-black text-[#DFBF64]">
                      C
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block leading-none">
                        CakraNexa Publishing
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formData.siteUrl.replace('https://', '') || 'cakranexa.com'}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-sm font-normal text-[#1a0dab] leading-snug tracking-tight">
                    {formData.siteTitle || 'CakraNexa — Penerbit Buku Akademik & Profesional'}
                  </h3>

                  <p className="text-xs text-slate-600 leading-normal line-clamp-3">
                    {formData.metaDescription || 'Platform resmi penerbitan buku akademik ber-ISBN resmi Perpustakaan Nasional...'}
                  </p>

                  <div className="pt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 font-medium">Buku Ber-ISBN</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 font-medium">Layanan Perpusnas</span>
                  </div>
                </div>
              )}
            </div>

            {/* Tracking Status Matrix */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <div className="text-xs font-bold text-slate-900">
                Status Integrasi Marketing
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <Target className="w-3 h-3 text-[#1877F2]" />
                  <span>Meta Pixel:</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  formData.metaPixelId 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  {formData.metaPixelId ? `ID: ${formData.metaPixelId}` : 'Nonaktif'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <BarChart2 className="w-3 h-3 text-[#EA4335]" />
                  <span>Google Analytics 4:</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  formData.googleAnalyticsId 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  {formData.googleAnalyticsId || 'Nonaktif'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-[#34A853]" />
                  <span>Tag Manager (GTM):</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  formData.gtmId 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  {formData.gtmId || 'Nonaktif'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-amber-600" />
                  <span>Google Ads Conversion:</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  formData.googleAdsConversionId && formData.googleAdsConversionLabel
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  {formData.googleAdsConversionId ? 'Terkonfigurasi' : 'Nonaktif'}
                </span>
              </div>
            </div>

            {/* Live SEO Status Cards */}
            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Status Pengindeksan:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  formData.noindex 
                    ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {formData.noindex ? 'Noindex (Tertutup)' : 'Index, Follow (Terbuka)'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Sitemap Otomatis:</span>
                <a
                  href="/sitemap.xml"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-800 hover:text-slate-900 font-mono text-[11px] underline font-semibold flex items-center gap-1"
                >
                  <span>/sitemap.xml</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Robots.txt:</span>
                <a
                  href="/robots.txt"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-800 hover:text-slate-900 font-mono text-[11px] underline font-semibold flex items-center gap-1"
                >
                  <span>/robots.txt</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
