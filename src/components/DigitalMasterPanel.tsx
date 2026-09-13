import React, { useEffect, useState } from 'react';
import { AlertCircle, FileUp, ListOrdered, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiClient, ApiError, type DigitalChapter, type DigitalProcessingState } from '../services/apiClient';
import type { DigitalFormat } from '../types';

/**
 * Panel admin fase 2: unggah file master (PDF/audio) ke bucket PRIVAT lewat server, status pemrosesan
 * (PNG halaman / HLS terenkripsi), tombol "Proses ulang", dan daftar bab. File master tidak pernah dikirim
 * ke browser pembeli.
 */
interface DigitalMasterPanelProps {
  productId: string;
  format: DigitalFormat;
  /** Produk belum pernah disimpan: master belum bisa diunggah. */
  isNew: boolean;
  onStateChange?: (state: DigitalProcessingState) => void;
}

const STATUS_LABEL: Record<DigitalProcessingState['processingStatus'], { label: string; className: string }> = {
  none: { label: 'Belum ada file master', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  processing: { label: 'Sedang diproses…', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  ready: { label: 'Siap untuk pembeli', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed: { label: 'Gagal diproses', className: 'bg-rose-50 text-rose-700 border-rose-200' }
};

const MASTER_ACCEPT: Record<DigitalFormat, string> = {
  ebook: 'application/pdf',
  audiobook: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/flac'
};

const formatSeconds = (total: number) => {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
};

const chaptersToText = (chapters: DigitalChapter[], format: DigitalFormat) =>
  chapters.map((c) => `${format === 'audiobook' ? formatSeconds(c.startSeconds || 0) : c.startPage},${c.title}`).join('\n');

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : 'Server tidak terjangkau. Coba lagi.');

export const DigitalMasterPanel: React.FC<DigitalMasterPanelProps> = ({ productId, format, isNew, onStateChange }) => {
  const [state, setState] = useState<DigitalProcessingState | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [chaptersText, setChaptersText] = useState('');
  const [chapterResult, setChapterResult] = useState<string | null>(null);

  const applyState = (next: DigitalProcessingState) => {
    setState(next);
    onStateChange?.(next);
  };

  const refresh = async (initial = false) => {
    try {
      const next = await apiClient.getDigitalProcessingState(productId);
      applyState(next);
      if (initial && next.chapters?.length) setChaptersText(chaptersToText(next.chapters, format));
      setUnavailable(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) setUnavailable(true);
      else if (!(err instanceof ApiError && err.status === 404)) setError(errorText(err));
    }
  };

  useEffect(() => {
    if (!isNew) void refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, isNew]);

  // Pantau status selama pemrosesan berjalan.
  useEffect(() => {
    if (state?.processingStatus !== 'processing') return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.processingStatus]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      applyState(await apiClient.uploadDigitalMaster(productId, file, setProgress));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setProgress(null);
    }
  };

  const reprocess = async () => {
    setBusy(true);
    setError(null);
    try {
      applyState(await apiClient.reprocessDigitalProduct(productId));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const saveChapters = async () => {
    setBusy(true);
    setChapterResult(null);
    try {
      const result = await apiClient.saveDigitalChapters(productId, chaptersText);
      setChapterResult(`${result.chapters.length} bab tersimpan${result.skipped ? `, ${result.skipped} baris dilewati` : ''}${result.errors.length ? ` — ${result.errors.join(' ')}` : ''}`);
      setChaptersText(chaptersToText(result.chapters, format));
    } catch (err) {
      setChapterResult(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const status = STATUS_LABEL[state?.processingStatus || 'none'];
  const uploading = progress !== null;

  return (
    <div id="digital-master-panel" className="p-4 rounded-lg border border-slate-200 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold text-slate-800">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          File master {format === 'ebook' ? 'PDF' : 'audio'} (bucket privat)
        </span>
        {!isNew && !unavailable && (
          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${status.className}`}>{status.label}</span>
        )}
      </div>

      {isNew ? (
        <p className="text-slate-500">Simpan produk ini terlebih dahulu, lalu buka kembali untuk mengunggah file master.</p>
      ) : unavailable ? (
        <p className="text-amber-700">Pemrosesan file memerlukan server utama (Render) dengan Supabase terhubung.</p>
      ) : (
        <>
          {state && (
            <ul className="space-y-0.5 text-[11px] text-slate-600">
              {state.hasMaster && state.masterSizeBytes !== null && (
                <li>Master: {(state.masterSizeBytes / 1024 / 1024).toFixed(1)} MB{state.masterUploadedAt ? ` · diunggah ${new Date(state.masterUploadedAt).toLocaleString('id-ID')}` : ''}</li>
              )}
              {state.processingStatus === 'ready' && format === 'ebook' && state.pageCount ? <li>{state.pageCount} halaman siap dibaca</li> : null}
              {state.processingStatus === 'ready' && format === 'audiobook' && state.durationSeconds ? <li>Durasi {formatSeconds(state.durationSeconds)} · HLS terenkripsi AES-128</li> : null}
              {state.processedAt && <li>Terakhir diproses {new Date(state.processedAt).toLocaleString('id-ID')}</li>}
            </ul>
          )}
          {state?.processingStatus === 'failed' && state.processingError && (
            <p className="flex items-start gap-1.5 text-rose-700"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{state.processingError}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border font-semibold ${
              uploading || state?.processingStatus === 'processing' ? 'cursor-not-allowed border-slate-200 text-slate-400' : 'cursor-pointer border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}>
              <FileUp className="w-4 h-4" />
              <span>{state?.hasMaster ? 'Ganti file master' : 'Unggah file master'}</span>
              <input
                type="file"
                id="digital-master-file"
                accept={MASTER_ACCEPT[format]}
                className="sr-only"
                disabled={uploading || state?.processingStatus === 'processing'}
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              id="digital-master-reprocess"
              onClick={() => void reprocess()}
              disabled={busy || !state?.hasMaster || state?.processingStatus === 'processing'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {state?.processingStatus === 'processing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>Proses ulang</span>
            </button>
          </div>
          {uploading && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
                <div className="h-full bg-[#D4AF37] transition-all" style={{ width: `${Math.round((progress || 0) * 100)}%` }} />
              </div>
              <p className="text-[10px] text-slate-500">Mengunggah… {Math.round((progress || 0) * 100)}%</p>
            </div>
          )}
          <p className="text-[10px] text-slate-500">
            {format === 'ebook'
              ? 'PDF utuh, maks. 500 MB. Server membuat gambar setiap halaman (~150 dpi) dan teks pencarian.'
              : 'MP3/M4A/AAC/WAV/FLAC, maks. 2 GB (batas Supabase tetap berlaku). Server membuat HLS AAC 64 kbps terenkripsi AES-128.'}
            {' '}File master disimpan di bucket privat dan tidak pernah dikirim ke browser.
          </p>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <label htmlFor="digital-chapters" className="flex items-center gap-1.5 font-semibold text-slate-700">
              <ListOrdered className="w-4 h-4" />
              Daftar bab (opsional)
            </label>
            <textarea
              id="digital-chapters"
              rows={4}
              value={chaptersText}
              onChange={(e) => setChaptersText(e.target.value)}
              placeholder={format === 'audiobook' ? '00:00:00,Pendahuluan\n00:12:30,Bab 1 — ...\n(atau tempel isi file CUE)' : '1,Daftar Isi\n12,Bab 1 — ...'}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-800 bg-white text-xs font-mono"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                id="digital-chapters-save"
                onClick={() => void saveChapters()}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-[#DFBF64] font-semibold hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                Simpan bab
              </button>
              <span className="text-[10px] text-slate-500">
                Format: {format === 'audiobook' ? 'waktu (hh:mm:ss),judul — atau file CUE' : 'nomor halaman,judul'} per baris.
              </span>
            </div>
            {chapterResult && <p className="text-[11px] text-slate-600">{chapterResult}</p>}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-rose-700"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{error}</p>
      )}
    </div>
  );
};
