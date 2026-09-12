import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Edit2,
  Headphones,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  TabletSmartphone,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import type { Book as BookType, DigitalAvailability, DigitalFormat, DigitalProduct } from '../types';
import { apiClient, ApiError } from '../services/apiClient';
import {
  DIGITAL_FORMATS,
  DIGITAL_SAMPLE_LIMITS,
  FRONTLIST_DAYS,
  addDaysToIsoDate,
  createDigitalProductDraft,
  digitalProductKey,
  samplePagePercent,
  todayIsoDate,
  validateDigitalProduct
} from '../data/digitalProducts';
import { toTitleCase } from '../utils/formatters';

/**
 * Tab admin "Produk Digital": tabel semua buku × format (e-book, audiobook) dan form buat/edit
 * harga satuan, status, tanggal masuk Digital Reading Shelf, detail format, serta file SAMPEL.
 * Sampel diunggah ke bucket publik "digital-samples" (maks. 10 halaman / 6 menit) — bukan file utuh.
 */

interface DigitalProductsTabProps {
  books: BookType[];
}

const FORMAT_LABEL: Record<DigitalFormat, string> = { ebook: 'E-Book', audiobook: 'Audiobook' };
const FORMAT_ICON: Record<DigitalFormat, React.ElementType> = { ebook: TabletSmartphone, audiobook: Headphones };

const rupiah = (amount: number): string => `Rp ${amount.toLocaleString('id-ID')}`;

const formatIsoDate = (iso: string): string => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return '-';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const parts = [hours ? `${hours} j` : '', minutes ? `${minutes} m` : '', !hours && rest ? `${rest} d` : ''].filter(Boolean);
  return parts.join(' ') || `${rest} d`;
};

/** Durasi file audio (detik) dibaca di browser, untuk validasi sampel maks. 6 menit sebelum diunggah. */
const readAudioDuration = (file: File): Promise<number> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.onloadedmetadata = () => {
    const duration = audio.duration;
    URL.revokeObjectURL(url);
    if (Number.isFinite(duration) && duration > 0) resolve(Math.round(duration));
    else reject(new Error('Durasi audio tidak terbaca.'));
  };
  audio.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('File audio tidak dapat dibaca.'));
  };
  audio.src = url;
});

const errorMessage = (err: unknown): string => (err instanceof ApiError ? err.message : 'Server tidak terjangkau. Coba lagi.');
const numberOrNull = (value: string): number | null => (value.trim() === '' ? null : Number(value));
const durationParts = (seconds: number | null) => ({
  h: seconds ? Math.floor(seconds / 3600) : 0,
  m: seconds ? Math.floor((seconds % 3600) / 60) : 0,
  s: seconds ? seconds % 60 : 0
});

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 bg-white text-xs';
const labelClass = 'font-semibold text-slate-700 block mb-1';

export const DigitalProductsTab: React.FC<DigitalProductsTabProps> = ({ books }) => {
  const [products, setProducts] = useState<DigitalProduct[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [storageEnabled, setStorageEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editorBook, setEditorBook] = useState<BookType | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<DigitalProduct | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // File sampel yang diunggah di sesi form ini; dihapus dari bucket bila batal disimpan.
  const [sessionUploads, setSessionUploads] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiClient.getAdminDigitalProducts();
      setProducts(data.products);
      setPersistent(data.persistent);
      setStorageEnabled(data.storageEnabled);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const productByKey = useMemo(() => new Map(products.map((p) => [digitalProductKey(p), p])), [products]);

  const normalizedQuery = query.trim().toLowerCase();
  const rows = useMemo(() => books.filter((book) =>
    !normalizedQuery || [book.name, book.author, book.isbn, book.category].some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
  ), [books, normalizedQuery]);

  const stats = useMemo(() => {
    const active = products.filter((p) => p.isActive);
    return {
      ebookAvailable: active.filter((p) => p.format === 'ebook' && p.availabilityStatus === 'available').length,
      audiobookAvailable: active.filter((p) => p.format === 'audiobook' && p.availabilityStatus === 'available').length,
      missingPrice: active.filter((p) => p.price <= 0).length,
      missingShelfDate: active.filter((p) => !p.shelfEntryDate).length
    };
  }, [products]);

  const updateForm = (patch: Partial<DigitalProduct>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const discardSessionUploads = (keep: string[]) => {
    sessionUploads
      .filter((url) => !keep.includes(url))
      .forEach((url) => {
        apiClient.deleteDigitalSample(url).catch(() => undefined);
      });
  };

  const resetEditor = () => {
    setEditorBook(null);
    setForm(null);
    setSessionUploads([]);
    setFormError(null);
  };

  const openEditor = (book: BookType, format: DigitalFormat) => {
    const existing = productByKey.get(`${book.id}:${format}`);
    setEditorBook(book);
    setIsNew(!existing);
    setForm(existing ? { ...existing, sampleImageUrls: [...existing.sampleImageUrls] } : createDigitalProductDraft(book, format));
    setFormError(null);
    setSessionUploads([]);
  };

  const closeEditor = () => {
    discardSessionUploads([]); // server tidak menghapus file yang masih dipakai produk tersimpan
    resetEditor();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !editorBook) return;
    const validation = validateDigitalProduct(form);
    if (validation) {
      setFormError(validation);
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const saved = await apiClient.saveDigitalProduct(form);
      setProducts((prev) => [...prev.filter((p) => digitalProductKey(p) !== digitalProductKey(saved)), saved]);
      discardSessionUploads([...saved.sampleImageUrls, ...(saved.sampleAudioUrl ? [saved.sampleAudioUrl] : [])]);
      showToast(`${FORMAT_LABEL[saved.format]} "${toTitleCase(editorBook.name)}" tersimpan.`);
      resetEditor();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!form || !editorBook || isNew) return;
    if (!window.confirm(`Hapus ${FORMAT_LABEL[form.format]} untuk "${toTitleCase(editorBook.name)}"? File sampelnya ikut dihapus.`)) return;
    setIsSaving(true);
    try {
      await apiClient.deleteDigitalProduct(form.id);
      setProducts((prev) => prev.filter((p) => p.id !== form.id));
      discardSessionUploads([]);
      showToast('Produk digital dihapus.');
      resetEditor();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageFiles = async (fileList: FileList | null) => {
    if (!form || !fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const { maxImages, maxImageBytes, imageTypes } = DIGITAL_SAMPLE_LIMITS;
    const remaining = maxImages - form.sampleImageUrls.length;
    if (files.length > remaining) {
      setFormError(`Maksimal ${maxImages} halaman sampel per e-book. Sisa slot: ${remaining}.`);
      return;
    }
    const invalid = files.find((file) => !imageTypes.includes(file.type) || file.size > maxImageBytes);
    if (invalid) {
      setFormError(`"${invalid.name}" ditolak: gambar sampel harus JPG, PNG, atau WebP dan maksimal ${maxImageBytes / 1024 / 1024} MB.`);
      return;
    }
    setIsUploading(true);
    setFormError(null);
    let count = form.sampleImageUrls.length;
    try {
      for (const file of files) {
        const url = await apiClient.uploadDigitalSample({ bookId: form.bookId, format: 'ebook', kind: 'image', file, existingCount: count });
        count += 1;
        setForm((prev) => (prev ? { ...prev, sampleImageUrls: [...prev.sampleImageUrls, url] } : prev));
        setSessionUploads((prev) => [...prev, url]);
      }
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleAudioFile = async (file: File | undefined) => {
    if (!form || !file) return;
    const { maxAudioSeconds, maxAudioBytes, audioTypes } = DIGITAL_SAMPLE_LIMITS;
    if (!audioTypes.includes(file.type)) {
      setFormError('Audio sampel harus MP3, M4A, AAC, atau OGG.');
      return;
    }
    if (file.size > maxAudioBytes) {
      setFormError(`Ukuran audio sampel maksimal ${maxAudioBytes / 1024 / 1024} MB.`);
      return;
    }
    let seconds: number;
    try {
      seconds = await readAudioDuration(file);
    } catch (err) {
      setFormError((err as Error).message);
      return;
    }
    if (seconds > maxAudioSeconds) {
      setFormError(`Audio sampel berdurasi ${formatDuration(seconds)}; maksimal ${maxAudioSeconds / 60} menit.`);
      return;
    }
    setIsUploading(true);
    setFormError(null);
    try {
      const url = await apiClient.uploadDigitalSample({ bookId: form.bookId, format: 'audiobook', kind: 'audio', file, durationSeconds: seconds });
      updateForm({ sampleAudioUrl: url, sampleAudioSeconds: Math.max(1, Math.min(seconds, maxAudioSeconds)) });
      setSessionUploads((prev) => [...prev, url]);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  const setDurationPart = (part: 'h' | 'm' | 's', value: string) => {
    if (!form) return;
    const next = { ...durationParts(form.durationSeconds), [part]: Math.max(0, Math.floor(Number(value) || 0)) };
    const total = next.h * 3600 + next.m * 60 + next.s;
    updateForm({ durationSeconds: total > 0 ? total : null });
  };

  const renderCell = (book: BookType, format: DigitalFormat) => {
    const product = productByKey.get(`${book.id}:${format}`);
    const Icon = FORMAT_ICON[format];
    if (!product) {
      return (
        <button
          type="button"
          id={`btn-digital-add-${book.id}-${format}`}
          onClick={() => openEditor(book, format)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah {FORMAT_LABEL[format]}</span>
        </button>
      );
    }
    const status = !product.isActive
      ? { label: 'Nonaktif', className: 'bg-slate-100 text-slate-600 border-slate-200' }
      : product.availabilityStatus === 'available'
        ? { label: 'Tersedia', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
        : { label: 'Segera', className: 'bg-amber-50 text-amber-800 border-amber-200' };
    const sampleInfo = format === 'ebook'
      ? `${product.sampleImageUrls.length}/${DIGITAL_SAMPLE_LIMITS.maxImages} halaman sampel`
      : product.sampleAudioUrl ? `Sampel audio ${formatDuration(product.sampleAudioSeconds)}` : 'Belum ada audio sampel';
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-slate-500" />
          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${status.className}`}>{status.label}</span>
        </div>
        <div className="font-mono font-semibold text-slate-900">
          {product.price > 0 ? rupiah(product.price) : <span className="font-sans text-amber-700">Harga belum diisi</span>}
        </div>
        <div className="text-[11px] text-slate-500">Rak: {product.shelfEntryDate ? formatIsoDate(product.shelfEntryDate) : 'belum ditetapkan'}</div>
        <div className="text-[11px] text-slate-500">{sampleInfo}</div>
        <button
          type="button"
          id={`btn-digital-edit-${book.id}-${format}`}
          onClick={() => openEditor(book, format)}
          className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 text-[#DFBF64] hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Edit2 className="w-3 h-3" />
          <span>Atur</span>
        </button>
      </div>
    );
  };

  const shelfBase = editorBook && /^\d{4}-\d{2}-\d{2}/.test(editorBook.releaseDate || '') ? editorBook.releaseDate!.slice(0, 10) : todayIsoDate();
  const shelfBaseLabel = editorBook && /^\d{4}-\d{2}-\d{2}/.test(editorBook.releaseDate || '') ? `tanggal rilis (${formatIsoDate(shelfBase)})` : 'hari ini';
  const percent = form ? samplePagePercent(form) : null;
  const { min: recommendedMin, max: recommendedMax } = DIGITAL_SAMPLE_LIMITS.recommendedPagePercent;
  const percentOk = percent !== null && percent >= recommendedMin && percent <= recommendedMax;
  const canUploadImages = storageEnabled && !isUploading && Boolean(form) && (form?.sampleImageUrls.length ?? 0) < DIGITAL_SAMPLE_LIMITS.maxImages;
  const canUploadAudio = storageEnabled && !isUploading;
  const EditorIcon = form ? FORMAT_ICON[form.format] : TabletSmartphone;

  return (
    <div id="admin-digital-products" className="space-y-4">
      {toast && (
        <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-lg bg-slate-900 text-[#DFBF64] border border-[#D4AF37]/40 shadow-2xl text-xs font-semibold">
          {toast}
        </div>
      )}

      {!persistent && (
        <div role="alert" className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs leading-relaxed">
          <p className="font-bold text-sm">Supabase belum terhubung: produk digital tidak permanen</p>
          <p className="mt-1">
            Perubahan hanya tersimpan di memori server sampai server restart, dan unggah sampel dinonaktifkan. Hubungkan Supabase
            lalu jalankan <strong>src/db/digital_products_migration.sql</strong> di SQL Editor.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'E-Book tersedia', value: stats.ebookAvailable },
          { label: 'Audiobook tersedia', value: stats.audiobookAvailable },
          { label: 'Produk aktif tanpa harga', value: stats.missingPrice },
          { label: 'Tanpa tanggal masuk rak', value: stats.missingShelfDate }
        ].map((metric) => (
          <div key={metric.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-slate-500 text-xs font-medium">{metric.label}</div>
            <div className="text-2xl font-bold text-slate-900 font-mono mt-1">{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 border-b border-slate-100">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="admin-digital-search"
              placeholder="Cari judul, penulis, ISBN, atau kategori..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-slate-800"
            />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span>Frontlist: masuk rak {FRONTLIST_DAYS.min}–{FRONTLIST_DAYS.max} hari setelah terbit</span>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Muat ulang</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Memuat produk digital…
          </div>
        ) : loadError ? (
          <div role="alert" className="p-6 text-xs text-rose-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Gagal memuat produk digital: {loadError}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Buku</th>
                  {DIGITAL_FORMATS.map((format) => (
                    <th key={format} className="px-4 py-2.5 font-semibold">{FORMAT_LABEL[format]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((book) => (
                  <tr key={book.id} className="align-top">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-semibold text-slate-900 line-clamp-2">{toTitleCase(book.name)}</div>
                      <div className="text-slate-500 mt-0.5 line-clamp-1">{book.author}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{book.category} · {book.id}</div>
                    </td>
                    {DIGITAL_FORMATS.map((format) => (
                      <td key={format} className="px-4 py-3">{renderCell(book, format)}</td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">Tidak ada buku yang cocok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editorBook && form && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between gap-3 border-b border-slate-800">
              <div className="flex items-center gap-2 min-w-0">
                <EditorIcon className="w-5 h-5 text-[#DFBF64] shrink-0" />
                <h3 className="font-bold text-sm sm:text-base text-white truncate">
                  {isNew ? 'Tambah' : 'Atur'} {FORMAT_LABEL[form.format]}: {toTitleCase(editorBook.name)}
                </h3>
              </div>
              <button type="button" onClick={closeEditor} aria-label="Tutup" className="p-1 rounded-full text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-xs">
              {/* Status & harga satuan */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="flex items-center gap-2 font-semibold text-slate-700 sm:pt-6 cursor-pointer">
                  <input
                    type="checkbox"
                    id="digital-is-active"
                    checked={form.isActive}
                    onChange={(e) => updateForm({ isActive: e.target.checked })}
                  />
                  <span>Aktif (tampil di situs)</span>
                </label>
                <div>
                  <label htmlFor="digital-availability" className={labelClass}>Status ketersediaan</label>
                  <select
                    id="digital-availability"
                    value={form.availabilityStatus}
                    onChange={(e) => updateForm({ availabilityStatus: e.target.value as DigitalAvailability })}
                    className={inputClass}
                  >
                    <option value="coming_soon">Segera</option>
                    <option value="available">Tersedia</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="digital-price" className={labelClass}>Harga satuan (Rp)</label>
                  <input
                    id="digital-price"
                    type="number"
                    min={0}
                    step={1000}
                    value={form.price}
                    onChange={(e) => updateForm({ price: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                    className={inputClass}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">0 = harga belum ditetapkan.</p>
                </div>
              </div>

              {/* Tanggal masuk rak digital */}
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                <label htmlFor="digital-shelf-date" className={labelClass}>Tanggal masuk Digital Reading Shelf</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="digital-shelf-date"
                    type="date"
                    value={form.shelfEntryDate || ''}
                    onChange={(e) => updateForm({ shelfEntryDate: e.target.value || null })}
                    className={`${inputClass} w-auto`}
                  />
                  {[FRONTLIST_DAYS.min, FRONTLIST_DAYS.max].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => updateForm({ shelfEntryDate: addDaysToIsoDate(shelfBase, days) })}
                      className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                    >
                      +{days} hari
                    </button>
                  ))}
                  {form.shelfEntryDate && (
                    <button type="button" onClick={() => updateForm({ shelfEntryDate: null })} className="font-semibold text-rose-600 hover:underline cursor-pointer">
                      Kosongkan
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">
                  Frontlist: judul baru masuk rak {FRONTLIST_DAYS.min}–{FRONTLIST_DAYS.max} hari setelah terbit. Tombol cepat dihitung dari {shelfBaseLabel}.
                  Kosong = tanggal belum ditetapkan.
                </p>
              </div>

              {/* Detail format */}
              {form.format === 'ebook' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="digital-page-count" className={labelClass}>Jumlah halaman</label>
                    <input
                      id="digital-page-count"
                      type="number"
                      min={1}
                      value={form.pageCount ?? ''}
                      onChange={(e) => updateForm({ pageCount: numberOrNull(e.target.value) })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="digital-sample-start" className={labelClass}>Halaman sampel: awal</label>
                    <input
                      id="digital-sample-start"
                      type="number"
                      min={1}
                      value={form.samplePageStart ?? ''}
                      onChange={(e) => updateForm({ samplePageStart: numberOrNull(e.target.value) })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="digital-sample-end" className={labelClass}>Halaman sampel: akhir</label>
                    <input
                      id="digital-sample-end"
                      type="number"
                      min={1}
                      value={form.samplePageEnd ?? ''}
                      onChange={(e) => updateForm({ samplePageEnd: numberOrNull(e.target.value) })}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-3 flex flex-wrap items-center gap-2 text-[11px]">
                    {percent !== null ? (
                      <span className={percentOk ? 'text-emerald-700' : 'text-amber-700'}>
                        Rentang sampel {percent.toFixed(1)}% dari {form.pageCount} halaman (anjuran {recommendedMin}–{recommendedMax}%).
                      </span>
                    ) : (
                      <span className="text-slate-500">Isi jumlah halaman dan rentang sampel (anjuran {recommendedMin}–{recommendedMax}% dari jumlah halaman).</span>
                    )}
                    {form.pageCount ? (
                      <button
                        type="button"
                        onClick={() => updateForm({ samplePageStart: 1, samplePageEnd: Math.max(1, Math.round((form.pageCount || 0) * 0.12)) })}
                        className="px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                      >
                        Isi otomatis 12% dari awal
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <span className={labelClass}>Durasi audiobook</span>
                    <div className="flex flex-wrap items-center gap-3">
                      {(['h', 'm', 's'] as const).map((part) => (
                        <label key={part} className="flex items-center gap-1.5">
                          <input
                            id={`digital-duration-${part}`}
                            type="number"
                            min={0}
                            max={part === 'h' ? 999 : 59}
                            value={durationParts(form.durationSeconds)[part]}
                            onChange={(e) => setDurationPart(part, e.target.value)}
                            className={`${inputClass} w-20`}
                          />
                          <span className="text-slate-600">{part === 'h' ? 'jam' : part === 'm' ? 'menit' : 'detik'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="digital-narrator" className={labelClass}>Narator</label>
                    <input
                      id="digital-narrator"
                      type="text"
                      maxLength={200}
                      value={form.narrator ?? ''}
                      onChange={(e) => updateForm({ narrator: e.target.value || null })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="digital-sample-seconds" className={labelClass}>Durasi sampel audio (detik)</label>
                    <input
                      id="digital-sample-seconds"
                      type="number"
                      min={1}
                      max={DIGITAL_SAMPLE_LIMITS.maxAudioSeconds}
                      value={form.sampleAudioSeconds}
                      onChange={(e) => updateForm({ sampleAudioSeconds: Math.round(Number(e.target.value) || 0) })}
                      className={inputClass}
                    />
                    <p className="mt-1 text-[10px] text-slate-400">
                      Maksimal {DIGITAL_SAMPLE_LIMITS.maxAudioSeconds} detik (6 menit). Default {DIGITAL_SAMPLE_LIMITS.defaultAudioSeconds}.
                    </p>
                  </div>
                </div>
              )}

              {/* File sampel */}
              <div className="p-4 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">File sampel (bucket publik digital-samples)</span>
                  {isUploading && (
                    <span className="flex items-center gap-1 text-slate-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Mengunggah…
                    </span>
                  )}
                </div>
                {!storageEnabled && (
                  <p className="text-amber-700">
                    Unggah sampel memerlukan Supabase Storage. Hubungkan Supabase lalu jalankan migration produk digital.
                  </p>
                )}

                {form.format === 'ebook' ? (
                  <>
                    {form.sampleImageUrls.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {form.sampleImageUrls.map((url, index) => (
                          <div key={url} className="relative">
                            <img src={url} alt={`Halaman sampel ${index + 1}`} className="w-full aspect-[3/4] object-cover rounded border border-slate-200" />
                            <button
                              type="button"
                              onClick={() => updateForm({ sampleImageUrls: form.sampleImageUrls.filter((item) => item !== url) })}
                              aria-label={`Hapus halaman sampel ${index + 1}`}
                              className="absolute top-1 right-1 p-0.5 rounded bg-white/90 text-rose-600 hover:bg-white cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            <span className="absolute bottom-1 left-1 text-[9px] bg-slate-900/80 text-white px-1 rounded">{index + 1}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500">Belum ada gambar halaman sampel. Halaman sampel publik menampilkan pratinjau contoh.</p>
                    )}
                    <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border font-semibold ${
                      canUploadImages ? 'cursor-pointer border-slate-300 text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed border-slate-200 text-slate-400'
                    }`}>
                      <ImagePlus className="w-4 h-4" />
                      <span>Unggah gambar halaman ({form.sampleImageUrls.length}/{DIGITAL_SAMPLE_LIMITS.maxImages})</span>
                      <input
                        type="file"
                        id="digital-sample-images"
                        accept={DIGITAL_SAMPLE_LIMITS.imageTypes.join(',')}
                        multiple
                        className="sr-only"
                        disabled={!canUploadImages}
                        onChange={(e) => {
                          void handleImageFiles(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <p className="text-[10px] text-slate-500">
                      JPG/PNG/WebP, maks. {DIGITAL_SAMPLE_LIMITS.maxImageBytes / 1024 / 1024} MB per gambar, maks. {DIGITAL_SAMPLE_LIMITS.maxImages} halaman.
                      Jangan unggah file e-book utuh ke bucket ini.
                    </p>
                  </>
                ) : (
                  <>
                    {form.sampleAudioUrl ? (
                      <div className="flex items-center gap-2">
                        <audio controls preload="none" src={form.sampleAudioUrl} className="w-full" />
                        <button
                          type="button"
                          onClick={() => updateForm({ sampleAudioUrl: null })}
                          className="shrink-0 font-semibold text-rose-600 hover:underline cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    ) : (
                      <p className="text-slate-500">Belum ada audio sampel.</p>
                    )}
                    <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border font-semibold ${
                      canUploadAudio ? 'cursor-pointer border-slate-300 text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed border-slate-200 text-slate-400'
                    }`}>
                      <Upload className="w-4 h-4" />
                      <span>{form.sampleAudioUrl ? 'Ganti audio sampel' : 'Unggah audio sampel'}</span>
                      <input
                        type="file"
                        id="digital-sample-audio"
                        accept={DIGITAL_SAMPLE_LIMITS.audioTypes.join(',')}
                        className="sr-only"
                        disabled={!canUploadAudio}
                        onChange={(e) => {
                          void handleAudioFile(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <p className="text-[10px] text-slate-500">
                      MP3/M4A/AAC/OGG, maks. {DIGITAL_SAMPLE_LIMITS.maxAudioSeconds / 60} menit dan {DIGITAL_SAMPLE_LIMITS.maxAudioBytes / 1024 / 1024} MB.
                      Jangan unggah audiobook utuh ke bucket ini.
                    </p>
                  </>
                )}
              </div>

              {formError && (
                <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100">
                {!isNew ? (
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 font-semibold text-rose-600 hover:underline disabled:opacity-60 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus produk digital</span>
                  </button>
                ) : <span />}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="px-4 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    id="btn-digital-save"
                    disabled={isSaving || isUploading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-[#DFBF64] font-semibold hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Menyimpan…' : 'Simpan'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
