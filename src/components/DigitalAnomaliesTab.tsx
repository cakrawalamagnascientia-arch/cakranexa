import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ScanSearch } from 'lucide-react';
import { apiClient, type AdminAnomaly } from '../services/apiClient';

const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const errorText = (err: any) => (err?.status === 503
  ? 'Modul digital fase 2 belum aktif di server ini (Supabase belum terhubung atau migration fase 2 belum dijalankan).'
  : err?.message || 'Terjadi kesalahan.');

const RULE_LABEL: Record<AdminAnomaly['rule'], string> = {
  ip_spread: 'Lebih dari 5 IP berbeda dalam 24 jam pada satu produk',
  device_limit_denials: 'Lebih dari 3 penolakan batas perangkat dalam 24 jam',
  page_speed: 'Membalik halaman terlalu cepat (≥3 jendela 10 detik dengan >30 halaman)'
};

type Filter = 'open' | 'resolved' | 'all';

interface DigitalAnomaliesTabProps {
  onOpenUser?: (userId: string) => void;
}

/**
 * Admin "Anomali": hasil deteksi per jam. Anomali kecepatan halaman menangguhkan akses otomatis; admin memulihkannya
 * saat menyelesaikan anomali. Aturan lain hanya ditandai untuk ditinjau.
 */
export const DigitalAnomaliesTab: React.FC<DigitalAnomaliesTabProps> = ({ onOpenUser }) => {
  const [filter, setFilter] = useState<Filter>('open');
  const [anomalies, setAnomalies] = useState<AdminAnomaly[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { note: string; reactivate: boolean }>>({});

  const load = useCallback(async (current: Filter) => {
    setError(null);
    try {
      setAnomalies((await apiClient.listDigitalAnomalies(current)).anomalies);
    } catch (err) {
      setError(errorText(err));
      setAnomalies(null);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const scan = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await apiClient.scanDigitalAnomalies();
      setNotice(`Pemeriksaan selesai: ${result.candidates} pola ditemukan, ${result.created} anomali baru.`);
      await load(filter);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (anomaly: AdminAnomaly) => {
    const draft = drafts[anomaly.id] ?? { note: '', reactivate: anomaly.actionTaken === 'suspended' };
    setNotice(null);
    try {
      await apiClient.resolveDigitalAnomaly(anomaly.id, draft.note, draft.reactivate);
      setNotice(draft.reactivate && anomaly.suspendedEntitlementIds.length > 0 ? 'Anomali diselesaikan dan akses diaktifkan kembali.' : 'Anomali diselesaikan.');
      await load(filter);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const setDraft = (anomaly: AdminAnomaly, patch: Partial<{ note: string; reactivate: boolean }>) =>
    setDrafts((prev) => ({
      ...prev,
      [anomaly.id]: { ...(prev[anomaly.id] ?? { note: '', reactivate: anomaly.actionTaken === 'suspended' }), ...patch }
    }));

  return (
    <div id="admin-digital-anomalies" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex gap-1">
          {(['open', 'resolved', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${filter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {f === 'open' ? 'Terbuka' : f === 'resolved' ? 'Selesai' : 'Semua'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load(filter)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
            <RefreshCw className="h-3.5 w-3.5" /> Muat ulang
          </button>
          <button
            type="button"
            id="btn-anomaly-scan"
            onClick={() => void scan()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <ScanSearch className="h-3.5 w-3.5" /> {busy ? 'Memeriksa…' : 'Periksa sekarang'}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">Deteksi otomatis berjalan tiap jam di server. Hanya pola kecepatan halaman yang menangguhkan akses secara otomatis; pola lain dikirim ke email admin untuk ditinjau.</p>

      {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}

      {anomalies && anomalies.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Tidak ada anomali {filter === 'open' ? 'terbuka' : ''}.</p>
      )}

      <ul className="space-y-3">
        {anomalies?.map((a) => {
          const draft = drafts[a.id] ?? { note: '', reactivate: a.actionTaken === 'suspended' };
          return (
            <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{RULE_LABEL[a.rule]}</p>
                  <p className="text-xs text-slate-600 [overflow-wrap:anywhere]">
                    {a.user ? `${a.user.fullName || '(tanpa nama)'} · ${a.user.email}` : a.userId}
                    {a.product && ` — ${a.product.title} (${a.product.format === 'ebook' ? 'E-Book' : 'Audiobook'})`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Terdeteksi {dateTime(a.detectedAt)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${a.actionTaken === 'suspended' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                  {a.actionTaken === 'suspended' ? 'Akses ditangguhkan otomatis' : 'Ditandai'}
                </span>
              </div>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                {Object.entries(a.details).map(([key, value]) => (
                  <div key={key}><dt className="inline font-semibold">{key}:</dt> <dd className="inline font-mono">{String(value)}</dd></div>
                ))}
              </dl>
              {onOpenUser && (
                <button type="button" onClick={() => onOpenUser(a.userId)} className="mt-2 text-xs font-semibold text-[#9A7B38] hover:underline cursor-pointer">
                  Buka di Entitlement & Akses →
                </button>
              )}
              {a.resolvedAt ? (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Diselesaikan {dateTime(a.resolvedAt)}{a.resolutionNote ? ` — ${a.resolutionNote}` : ''}</p>
              ) : (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                  <label className="min-w-[220px] flex-1 text-[11px] font-semibold text-slate-600">
                    Catatan penyelesaian
                    <input
                      type="text"
                      value={draft.note}
                      onChange={(event) => setDraft(a, { note: event.target.value })}
                      maxLength={1000}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal"
                    />
                  </label>
                  {a.suspendedEntitlementIds.length > 0 && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-700">
                      <input type="checkbox" checked={draft.reactivate} onChange={(event) => setDraft(a, { reactivate: event.target.checked })} />
                      Aktifkan kembali akses yang ditangguhkan
                    </label>
                  )}
                  <button type="button" onClick={() => void resolve(a)} className="rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-bold text-slate-950 hover:bg-[#c5a059] cursor-pointer">
                    Selesaikan
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
