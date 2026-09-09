import React, { useState, useMemo } from 'react';
import { 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ArrowRight, 
  RefreshCw, 
  Share2, 
  ListChecks, 
  FileText, 
  Heading1, 
  Image as ImageIcon, 
  Smartphone, 
  Code, 
  ShieldCheck, 
  ExternalLink,
  BookOpen,
  Filter,
  Check
} from 'lucide-react';
import { Book, SeoSettings, SeoAuditResult, ActivePage } from '../types';
import { runSeoAudit } from '../services/seoService';

interface SeoAnalysisTabProps {
  settings: SeoSettings;
  books: Book[];
  onOpenSeoSettingsTab?: () => void;
}

export const SeoAnalysisTab: React.FC<SeoAnalysisTabProps> = ({
  settings,
  books,
  onOpenSeoSettingsTab
}) => {
  // Preset audit target URLs
  const auditPresetOptions = useMemo(() => {
    const list = [
      { label: '/ (Halaman Beranda)', path: '/', page: 'beranda' as ActivePage, book: null },
      { label: '/katalog (Katalog 21+ Buku)', path: '/katalog', page: 'katalog' as ActivePage, book: null },
      { label: '/penerbitan (Layanan ISBN)', path: '/penerbitan', page: 'penerbitan' as ActivePage, book: null },
      { label: '/pelatihan (Workshop)', path: '/pelatihan', page: 'pelatihan' as ActivePage, book: null }
    ];

    // Add first 3 sample books
    books.slice(0, 4).forEach((b) => {
      list.push({
        label: `/katalog/${b.slug || b.id} (${b.name.slice(0, 32)}...)`,
        path: `/katalog/${b.slug || b.id}`,
        page: 'katalog' as ActivePage,
        book: b
      });
    });

    return list;
  }, [books]);

  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [customPath, setCustomPath] = useState<string>('');
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [filterCategory, setFilterCategory] = useState<'all' | 'warning' | 'passed'>('all');
  const [copiedLink, setCopiedLink] = useState(false);

  // Active target evaluation
  const activePreset = auditPresetOptions[selectedPresetIndex] || auditPresetOptions[0];
  const evaluatedPath = customPath.trim() ? customPath.trim() : activePreset.path;

  // Initial audit result
  const [auditResult, setAuditResult] = useState<SeoAuditResult>(() => {
    return runSeoAudit(activePreset.path, {
      page: activePreset.page,
      book: activePreset.book,
      settings,
      books
    });
  });

  const handleRunAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      const selected = auditPresetOptions[selectedPresetIndex];
      const res = runSeoAudit(evaluatedPath, {
        page: selected.page,
        book: selected.book,
        settings,
        books
      });
      setAuditResult(res);
      setIsAuditing(false);
    }, 400);
  };

  const handlePresetChange = (index: number) => {
    setSelectedPresetIndex(index);
    setCustomPath('');
    const target = auditPresetOptions[index];
    const res = runSeoAudit(target.path, {
      page: target.page,
      book: target.book,
      settings,
      books
    });
    setAuditResult(res);
  };

  const handleCopyReport = () => {
    const summary = `Laporan SEO Audit CakraNexa:
URL: ${auditResult.url}
Skor Kesehatan: ${auditResult.score}/100 (Grade: ${auditResult.grade})
Status: ${auditResult.status}
Lulus: ${auditResult.passedChecks} | Perlu Perhatian: ${auditResult.warningChecks + auditResult.failedChecks}`;
    navigator.clipboard.writeText(summary);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Filtered checks
  const filteredChecks = useMemo(() => {
    if (filterCategory === 'warning') {
      return auditResult.checks.filter(c => c.status === 'warning' || c.status === 'failed');
    }
    if (filterCategory === 'passed') {
      return auditResult.checks.filter(c => c.status === 'passed');
    }
    return auditResult.checks;
  }, [auditResult.checks, filterCategory]);

  const actionableRecommendations = useMemo(() => {
    return auditResult.checks.filter(c => c.recommendation);
  }, [auditResult.checks]);

  // Category icon helper
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'title':
        return <FileText className="w-4 h-4 text-slate-700" />;
      case 'description':
        return <FileText className="w-4 h-4 text-slate-700" />;
      case 'h1':
        return <Heading1 className="w-4 h-4 text-slate-700" />;
      case 'images':
        return <ImageIcon className="w-4 h-4 text-slate-700" />;
      case 'opengraph':
        return <Share2 className="w-4 h-4 text-slate-700" />;
      case 'mobile':
        return <Smartphone className="w-4 h-4 text-slate-700" />;
      case 'schema':
        return <Code className="w-4 h-4 text-slate-700" />;
      case 'indexing':
        return <ShieldCheck className="w-4 h-4 text-slate-700" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-slate-700" />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      
      {/* SECTION 1: Domain Audit Input Toolbar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-slate-900 text-[#D4AF37]">
                <Search className="w-4 h-4" />
              </span>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight font-sans">
                SEO Audit & On-Page Checklist Analyzer
              </h2>
            </div>
            <p className="text-xs text-slate-500 max-w-2xl">
              Uji kesiapan SEO teknis, meta description, tag H1, image alt sampul, Open Graph, dan Google Rich Results schema (@type: &quot;Book&quot;) untuk halaman target.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReport}
              className="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Laporan Disalin' : 'Salin Laporan'}</span>
            </button>
            {onOpenSeoSettingsTab && (
              <button
                type="button"
                onClick={onOpenSeoSettingsTab}
                className="px-3.5 py-2 text-xs font-semibold text-slate-900 bg-[#D4AF37] hover:bg-[#c5a059] rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Buka Pengaturan SEO</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* URL Path Selector Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
          <div className="md:col-span-5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
              Pilih Halaman Target
            </label>
            <select
              value={selectedPresetIndex}
              onChange={(e) => handlePresetChange(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-900 focus:outline-none transition-colors font-medium text-slate-800"
            >
              {auditPresetOptions.map((opt, i) => (
                <option key={i} value={i}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
              Domain / Path Pengujian
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono select-none">
                {settings.siteUrl.replace(/\/$/, '')}
              </span>
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder={activePreset.path}
                className="w-full pl-44 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none transition-colors font-mono text-slate-800"
              />
            </div>
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="button"
              onClick={handleRunAudit}
              disabled={isAuditing}
              className="w-full py-2.5 text-xs font-bold text-slate-900 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
              <span>{isAuditing ? 'Menguji...' : 'Uji Sekarang'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: Score & Actionable Feedback Card (Ref Image 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Visual Health Score Card */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Skor Kesehatan SEO
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-600 rounded">
                Live Audit
              </span>
            </div>

            <div className="py-6 text-center">
              <div className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-slate-50 border-4 border-emerald-500 shadow-inner mb-3">
                <div>
                  <span className="text-3xl font-black text-slate-900 font-sans tracking-tight">
                    {auditResult.score}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold block">/ 100</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                    Grade {auditResult.grade}
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {auditResult.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-mono pt-1">
                  Target: {evaluatedPath}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
              <span className="text-sm font-black text-emerald-700 block">
                {auditResult.passedChecks}
              </span>
              <span className="text-[10px] font-semibold text-emerald-800">Lulus</span>
            </div>
            <div className="p-2 rounded-xl bg-amber-50 border border-amber-100">
              <span className="text-sm font-black text-amber-700 block">
                {auditResult.warningChecks}
              </span>
              <span className="text-[10px] font-semibold text-amber-800">Peringatan</span>
            </div>
            <div className="p-2 rounded-xl bg-rose-50 border border-rose-100">
              <span className="text-sm font-black text-rose-700 block">
                {auditResult.failedChecks}
              </span>
              <span className="text-[10px] font-semibold text-rose-800">Kritis</span>
            </div>
          </div>
        </div>

        {/* Actionable Feedback Card */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Rekomendasi Perbaikan Prioritas (Actionable Fixes)
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {actionableRecommendations.length} item perlu tindakan
              </span>
            </div>

            {actionableRecommendations.length === 0 ? (
              <div className="p-6 bg-emerald-50/60 rounded-xl border border-emerald-100 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-900 mb-1">
                    Semua Parameter SEO Terpenuhi Sempurna!
                  </h4>
                  <p className="text-[11px] text-emerald-700 leading-relaxed">
                    Halaman ini telah memenuhi seluruh kriteria Google Search Central: judul proporsional, meta description memikat, gambar bersampul alt, dan Google Rich Results JSON-LD valid.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {actionableRecommendations.map((rec) => (
                  <div 
                    key={rec.id}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors flex items-start gap-3"
                  >
                    <div className="p-1 rounded bg-amber-100 text-amber-700 shrink-0 mt-0.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {rec.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          +{rec.scoreImpact} pts
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-normal">
                        {rec.recommendation}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Standar audit: Google Search Central & Core Web Vitals 2026.</span>
            <span className="font-mono text-[11px]">Waktu Uji: {new Date(auditResult.timestamp).toLocaleTimeString('id-ID')}</span>
          </div>
        </div>

      </div>

      {/* SECTION 3: Automated On-Page SEO Checklist Analyzer */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        
        {/* Header & Category Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Daftar Pemeriksaan On-Page Otomatis (Audit Checklist)
            </h3>
            <p className="text-xs text-slate-500">
              Rincian 8 pilar verifikasi teknis untuk visibilitas penelusuran.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                filterCategory === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({auditResult.checks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterCategory('warning')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                filterCategory === 'warning'
                  ? 'bg-white text-amber-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Perlu Perhatian ({auditResult.warningChecks + auditResult.failedChecks})
            </button>
            <button
              type="button"
              onClick={() => setFilterCategory('passed')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                filterCategory === 'passed'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lulus ({auditResult.passedChecks})
            </button>
          </div>
        </div>

        {/* Checklist Cards */}
        <div className="space-y-3">
          {filteredChecks.map((item) => {
            const isPassed = item.status === 'passed';
            const isWarning = item.status === 'warning';
            const isFailed = item.status === 'failed';

            return (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                    isPassed 
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                      : isWarning
                        ? 'bg-amber-50 text-amber-600 border border-amber-100'
                        : 'bg-rose-50 text-rose-600 border border-rose-100'
                  }`}>
                    {getCategoryIcon(item.category)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold text-slate-900">
                        {item.label}
                      </h4>
                      {item.value && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {item.value}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {item.message}
                    </p>
                    {item.recommendation && (
                      <div className="pt-1 text-[11px] text-amber-800 font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                        <span>Saran: {item.recommendation}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center justify-end gap-3 self-end md:self-center">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 ${
                    isPassed 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : isWarning
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {isPassed && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {isWarning && <AlertTriangle className="w-3.5 h-3.5" />}
                    {isFailed && <XCircle className="w-3.5 h-3.5" />}
                    <span>{isPassed ? 'Lulus' : isWarning ? 'Peringatan' : 'Kritis'}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

      </div>

    </div>
  );
};
