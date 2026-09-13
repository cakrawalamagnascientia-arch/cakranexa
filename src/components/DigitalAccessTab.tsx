import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, LogOut, RefreshCw, Search } from 'lucide-react';
import { apiClient, type AdminDigitalUser, type AdminEntitlement, type AdminUserAccess } from '../services/apiClient';
import { useBookText } from '../i18n/hooks';
import type { Book, DigitalProduct } from '../types';

const dateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const errorText = (err: any) => (err?.status === 503
  ? 'Modul digital fase 2 belum aktif di server ini (Supabase belum terhubung atau migration fase 2 belum dijalankan).'
  : err?.message || 'Terjadi kesalahan.');

const SOURCE_LABEL: Record<AdminEntitlement['source'], string> = {
  purchase: 'Pembelian',
  membership: 'Keanggotaan',
  institution: 'Institusi',
  admin_grant: 'Diberikan admin',
  author: 'Penulis'
};
const STATUS_LABEL: Record<AdminEntitlement['status'], string> = { active: 'Aktif', suspended: 'Ditangguhkan', revoked: 'Dicabut', expired: 'Kedaluwarsa' };
const STATUS_CLASS: Record<AdminEntitlement['status'], string> = {
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-amber-100 text-amber-800',
  revoked: 'bg-rose-100 text-rose-800',
  expired: 'bg-slate-200 text-slate-700'
};
const ACTION_LABEL: Record<string, string> = {
  page_view: 'Halaman',
  segment: 'Segmen audio',
  key: 'Kunci audio',
  search: 'Pencarian',
  note: 'Catatan',
  session_start: 'Mulai sesi',
  session_end: 'Akhiri sesi',
  denied: 'Ditolak'
};
const ORDER_STATUS: Record<string, string> = {
  pending: 'Menunggu', challenge: 'Ditinjau', paid: 'Lunas', failed: 'Gagal', cancelled: 'Batal', expired: 'Kedaluwarsa', refunded: 'Refund'
};

const Section: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h4>
      {action}
    </div>
    {children}
  </section>
);

interface DigitalAccessTabProps {
  books: Book[];
  /** Dibuka dari tab Anomali. */
  initialUserId?: string | null;
}

/**
 * Admin "Entitlement & Akses": cari pengguna, lihat hak akses/perangkat/sesi/pesanan/log, beri akses manual,
 * tangguhkan/aktifkan/cabut, lepas perangkat (tanpa jeda 30 hari), dan akhiri semua sesi.
 */
export const DigitalAccessTab: React.FC<DigitalAccessTabProps> = ({ books, initialUserId }) => {
  const bookText = useBookText();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminDigitalUser[] | null>(null);
  const [userId, setUserId] = useState<string | null>(initialUserId ?? null);
  const [detail, setDetail] = useState<AdminUserAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [products, setProducts] = useState<DigitalProduct[]>([]);
  const [grant, setGrant] = useState({ productId: '', endsAt: '', maxDevices: 2 });

  useEffect(() => {
    apiClient.getAdminDigitalProducts().then((catalog) => setProducts(catalog.products)).catch(() => setProducts([]));
  }, []);
  useEffect(() => {
    if (initialUserId) setUserId(initialUserId);
  }, [initialUserId]);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await apiClient.getDigitalUserAccess(id));
    } catch (err) {
      setError(errorText(err));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) void loadDetail(userId);
  }, [userId, loadDetail]);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      setUsers((await apiClient.searchDigitalUsers(query.trim())).users);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const act = async (fn: () => Promise<unknown>, message: string) => {
    if (!userId) return;
    setNotice(null);
    setError(null);
    try {
      await fn();
      setNotice(message);
      await loadDetail(userId);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const changeStatus = (entitlement: AdminEntitlement, status: 'active' | 'suspended' | 'revoked') => {
    let reason: string | undefined;
    if (status !== 'active') {
      const input = window.prompt(status === 'suspended' ? 'Alasan penangguhan (dicatat):' : 'Alasan pencabutan (dicatat):', '');
      if (input === null) return;
      reason = input.trim() || undefined;
    }
    void act(() => apiClient.setDigitalEntitlementStatus(entitlement.id, status, reason), `Status hak akses diubah menjadi "${STATUS_LABEL[status]}".`);
  };

  const submitGrant = (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId || !grant.productId) return;
    void act(() => apiClient.grantDigitalEntitlement({
      userId,
      productId: grant.productId,
      endsAt: grant.endsAt ? new Date(`${grant.endsAt}T23:59:59`).toISOString() : null,
      maxDevices: grant.maxDevices
    }), 'Hak akses diberikan.');
  };

  const productLabel = (product: DigitalProduct) => {
    const book = books.find((b) => b.id === product.bookId);
    return `${book ? bookText.title(book) : product.bookId} — ${product.format === 'ebook' ? 'E-Book' : 'Audiobook'}`;
  };
  const button = 'rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer';

  return (
    <div id="admin-digital-access" className="space-y-4">
      <form onSubmit={(event) => void search(event)} className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <label className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cari pengguna (email atau nama)</span>
          <input
            id="admin-access-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="nama@contoh.com"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" className="mt-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer">
          <Search className="h-3.5 w-3.5" />
          Cari
        </button>
        {users && (
          <ul className="w-full divide-y divide-slate-100 rounded-lg border border-slate-100">
            {users.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">Tidak ada pengguna yang cocok.</li>}
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setUserId(u.id)}
                  className={`flex w-full flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 cursor-pointer ${u.id === userId ? 'bg-slate-50 font-semibold' : ''}`}
                >
                  <span className="[overflow-wrap:anywhere]">{u.fullName || '(tanpa nama)'} · {u.email}</span>
                  <span className="font-mono text-[10px] text-slate-400">{u.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}
      {loading && <p className="text-xs text-slate-500">Memuat data pengguna…</p>}

      {detail && userId && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 text-white">
            <div className="min-w-0">
              <p className="text-sm font-bold [overflow-wrap:anywhere]">{detail.user.fullName || '(tanpa nama)'} · {detail.user.email || '—'}</p>
              <p className="font-mono text-[10px] text-slate-400">{detail.user.id}</p>
              <p className="mt-1 text-[11px] text-slate-300">Batas perangkat saat ini: {detail.maxDevices}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void loadDetail(userId)} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 cursor-pointer">
                <RefreshCw className="h-3.5 w-3.5" /> Muat ulang
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Akhiri semua sesi baca/dengar pengguna ini?')) void act(() => apiClient.endDigitalUserSessions(userId), 'Semua sesi diakhiri.');
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold hover:bg-rose-700 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" /> Akhiri semua sesi
              </button>
            </div>
          </div>

          <Section title={`Hak akses (${detail.entitlements.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr><th className="py-1.5 pr-2">Produk</th><th className="py-1.5 pr-2">Sumber</th><th className="py-1.5 pr-2">Status</th><th className="py-1.5 pr-2">Berlaku</th><th className="py-1.5 pr-2">Perangkat</th><th className="py-1.5">Aksi</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.entitlements.map((e) => (
                    <tr key={e.id}>
                      <td className="py-1.5 pr-2">{e.product ? `${e.product.title} (${e.product.format === 'ebook' ? 'E-Book' : 'Audiobook'})` : e.productId}<br /><span className="font-mono text-[10px] text-slate-400">{e.id}</span></td>
                      <td className="py-1.5 pr-2">{SOURCE_LABEL[e.source]}</td>
                      <td className="py-1.5 pr-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                        {e.status === 'active' && !e.usable && <span className="ml-1 text-[10px] text-slate-500">(tidak berlaku)</span>}
                        {e.revokedReason && <p className="mt-0.5 text-[10px] text-slate-500">{e.revokedReason}</p>}
                      </td>
                      <td className="py-1.5 pr-2">{dateTime(e.startsAt)} – {e.endsAt ? dateTime(e.endsAt) : 'selamanya'}</td>
                      <td className="py-1.5 pr-2">{e.maxDevices}</td>
                      <td className="py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {e.status === 'active' && <button type="button" onClick={() => changeStatus(e, 'suspended')} className={button}>Tangguhkan</button>}
                          {e.status !== 'active' && <button type="button" onClick={() => changeStatus(e, 'active')} className={button}>Aktifkan</button>}
                          {e.status !== 'revoked' && <button type="button" onClick={() => changeStatus(e, 'revoked')} className={`${button} text-rose-700`}>Cabut</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {detail.entitlements.length === 0 && <tr><td colSpan={6} className="py-2 text-slate-500">Belum ada hak akses.</td></tr>}
                </tbody>
              </table>
            </div>
            <form onSubmit={submitGrant} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <label className="min-w-[220px] flex-1 text-[11px] font-semibold text-slate-600">
                Beri akses manual
                <select value={grant.productId} onChange={(event) => setGrant((g) => ({ ...g, productId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal">
                  <option value="">Pilih produk…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-600">
                Berakhir (opsional)
                <input type="date" value={grant.endsAt} onChange={(event) => setGrant((g) => ({ ...g, endsAt: event.target.value }))} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal" />
              </label>
              <label className="text-[11px] font-semibold text-slate-600">
                Batas perangkat
                <input type="number" min={1} max={10} value={grant.maxDevices} onChange={(event) => setGrant((g) => ({ ...g, maxDevices: Number(event.target.value) || 1 }))} className="mt-1 block w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal" />
              </label>
              <button type="submit" disabled={!grant.productId} className="inline-flex items-center gap-1 rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-bold text-slate-950 hover:bg-[#c5a059] disabled:opacity-50 cursor-pointer">
                <KeyRound className="h-3.5 w-3.5" /> Beri akses
              </button>
            </form>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={`Perangkat (${detail.devices.filter((d) => !d.releasedAt).length} aktif)`}>
              <ul className="divide-y divide-slate-100 text-xs">
                {detail.devices.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-2 py-1.5">
                    <div className="min-w-0">
                      <p className="font-semibold">{d.label}{d.releasedAt && <span className="ml-1 font-normal text-slate-400">(dilepas {d.releasedBy === 'admin' ? 'admin' : 'pengguna'} {dateTime(d.releasedAt)})</span>}</p>
                      <p className="text-[10px] text-slate-500 [overflow-wrap:anywhere]">Terakhir aktif {dateTime(d.lastSeen)} · {d.userAgent || '—'}</p>
                    </div>
                    {!d.releasedAt && (
                      <button type="button" onClick={() => void act(() => apiClient.releaseDigitalDeviceAsAdmin(d.id), 'Perangkat dilepas.')} className={button}>Lepas</button>
                    )}
                  </li>
                ))}
                {detail.devices.length === 0 && <li className="py-1.5 text-slate-500">Belum ada perangkat.</li>}
              </ul>
            </Section>

            <Section title={`Sesi terbuka (${detail.sessions.length})`}>
              <ul className="divide-y divide-slate-100 text-xs">
                {detail.sessions.map((s) => (
                  <li key={s.id} className="py-1.5">
                    <p className="font-semibold">{s.product?.title ?? s.productId} <span className={`ml-1 text-[10px] ${s.alive ? 'text-emerald-700' : 'text-slate-400'}`}>{s.alive ? 'aktif' : 'tanpa heartbeat'}</span></p>
                    <p className="text-[10px] text-slate-500">{s.deviceLabel ?? '—'} · IP {s.ip ?? '—'} · mulai {dateTime(s.startedAt)} · heartbeat {dateTime(s.lastHeartbeat)}</p>
                  </li>
                ))}
                {detail.sessions.length === 0 && <li className="py-1.5 text-slate-500">Tidak ada sesi terbuka.</li>}
              </ul>
            </Section>
          </div>

          <Section title={`Pesanan digital (${detail.orders.length})`}>
            <ul className="divide-y divide-slate-100 text-xs">
              {detail.orders.map((o) => (
                <li key={o.orderNumber} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="font-mono">{o.orderNumber}{o.isTest && <span className="ml-1 rounded bg-slate-200 px-1 text-[9px] font-bold uppercase">uji</span>}</span>
                  <span className="text-slate-600">{o.items.map((i) => i.title).join(', ')}</span>
                  <span className="font-semibold">{rupiah(o.amount)} · {ORDER_STATUS[o.status] ?? o.status}</span>
                </li>
              ))}
              {detail.orders.length === 0 && <li className="py-1.5 text-slate-500">Belum ada pesanan.</li>}
            </ul>
          </Section>

          <Section title="Log akses terbaru (100)">
            <div className="max-h-80 overflow-auto">
              <table className="w-full min-w-[640px] text-left text-[11px]">
                <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wider text-slate-500">
                  <tr><th className="py-1 pr-2">Waktu</th><th className="py-1 pr-2">Aksi</th><th className="py-1 pr-2">Produk</th><th className="py-1 pr-2">IP</th><th className="py-1">Detail</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.logs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-1 pr-2 whitespace-nowrap">{dateTime(l.createdAt)}</td>
                      <td className="py-1 pr-2">{ACTION_LABEL[l.action] ?? l.action}</td>
                      <td className="py-1 pr-2">{l.product?.title ?? '—'}</td>
                      <td className="py-1 pr-2 font-mono">{l.ip ?? '—'}</td>
                      <td className="py-1 font-mono text-slate-500">{Object.keys(l.meta).length ? JSON.stringify(l.meta) : ''}</td>
                    </tr>
                  ))}
                  {detail.logs.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-500">Belum ada log.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
};
