import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crown, Download, ExternalLink, RefreshCw, Save, Search, X } from 'lucide-react';
import {
  apiClient,
  type AdminBillingCycle,
  type AdminInvoiceKind,
  type AdminInvoiceStatus,
  type AdminMembershipEntitlement,
  type AdminMembershipFlags,
  type AdminMembershipPaymentMethod,
  type AdminMembershipPlan,
  type AdminMembershipPlanPatch,
  type AdminMembershipSummary,
  type AdminMembershipTransfer,
  type AdminPlanCode,
  type AdminShelfAccess,
  type AdminSubscription,
  type AdminSubscriptionActionResult,
  type AdminSubscriptionDetail,
  type AdminSubscriptionFilters,
  type AdminSubscriptionStatus,
  type AdminWhatsAppTestResult
} from '../services/apiClient';

// ---------------------------------------------------------------------------
// Format (WIB) & label
// ---------------------------------------------------------------------------
const TIME_ZONE = 'Asia/Jakarta';
const dateTime = (iso: string | null | undefined) =>
  (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE }) : '—');
const dateOnly = (iso: string | null | undefined) =>
  (iso ? new Date(iso).toLocaleDateString('id-ID', { dateStyle: 'medium', timeZone: TIME_ZONE }) : '—');
const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const percent = (value: number | null) =>
  (value === null ? '–' : new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 1 }).format(value));
const monthLabel = (month: string) => {
  const [year, m] = month.split('-').map(Number);
  if (!year || !m) return month;
  return new Date(Date.UTC(year, m - 1, 15)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: TIME_ZONE });
};
const errorText = (err: any) => err?.message || (err?.status === 503
  ? 'Modul keanggotaan belum aktif di server ini (Supabase belum terhubung atau migration fase 3 belum dijalankan).'
  : 'Terjadi kesalahan.');

const STATUS_LABEL: Record<AdminSubscriptionStatus, string> = {
  pending: 'Menunggu bayar',
  active: 'Aktif',
  past_due: 'Tertunggak',
  grace: 'Masa tenggang',
  canceled: 'Dibatalkan',
  expired: 'Berakhir'
};
const STATUS_CLASS: Record<AdminSubscriptionStatus, string> = {
  pending: 'bg-sky-100 text-sky-800',
  active: 'bg-emerald-100 text-emerald-800',
  past_due: 'bg-amber-100 text-amber-800',
  grace: 'bg-orange-100 text-orange-800',
  canceled: 'bg-rose-100 text-rose-800',
  expired: 'bg-slate-200 text-slate-700'
};
const CYCLE_LABEL: Record<AdminBillingCycle, string> = { monthly: 'Bulanan', yearly: 'Tahunan' };
const PAYMENT_LABEL: Record<AdminMembershipPaymentMethod, string> = { card: 'Kartu', gopay: 'GoPay', va: 'Virtual Account', qris: 'QRIS', other: 'Lainnya' };
const SHELF_LABEL: Record<AdminShelfAccess, string> = { none: 'Tidak ada', pick: 'Pick (pilih judul)', full: 'Seluruh rak' };
const INVOICE_STATUS_LABEL: Record<AdminInvoiceStatus, string> = { draft: 'Draf', issued: 'Terbit', paid: 'Lunas', failed: 'Gagal', void: 'Batal' };
const INVOICE_STATUS_CLASS: Record<AdminInvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  issued: 'bg-sky-100 text-sky-800',
  paid: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
  void: 'bg-slate-200 text-slate-600'
};
const INVOICE_KIND_LABEL: Record<AdminInvoiceKind, string> = { initial: 'Awal', renewal: 'Perpanjangan', upgrade: 'Upgrade', manual: 'Manual (offline)' };
const EVENT_LABEL: Record<string, string> = {
  created: 'Dibuat',
  activated: 'Diaktifkan',
  renewed: 'Diperpanjang',
  payment_failed: 'Pembayaran gagal',
  reminder_sent: 'Pengingat terkirim',
  grace_started: 'Masa tenggang dimulai',
  expired: 'Berakhir',
  canceled: 'Dibatalkan',
  upgraded: 'Upgrade',
  downgraded: 'Downgrade',
  founding_notice: 'Pemberitahuan harga Founding',
  invoice_issued: 'Invoice terbit',
  cancel_reverted: 'Pembatalan dibatalkan',
  change_canceled: 'Perubahan paket dibatalkan',
  payment_method_changed: 'Metode bayar diganti',
  pick_selected: 'Pick dipilih',
  reconciled: 'Rekonsiliasi',
  admin_extended: 'Admin: perpanjang manual',
  admin_grace: 'Admin: masa tenggang tambahan',
  admin_plan_changed: 'Admin: ubah paket',
  admin_founding: 'Admin: status Founding',
  admin_canceled: 'Admin: batalkan',
  autodebit_error: 'Galat auto-debit',
  refunded: 'Refund',
  payment_orphan: 'Pembayaran tanpa invoice',
  whatsapp_failed: 'WhatsApp gagal terkirim'
};
const SOURCE_LABEL: Record<AdminMembershipEntitlement['source'], string> = {
  purchase: 'Pembelian',
  membership: 'Keanggotaan',
  institution: 'Institusi',
  admin_grant: 'Diberikan admin',
  author: 'Penulis'
};
const ENTITLEMENT_STATUS_LABEL: Record<AdminMembershipEntitlement['status'], string> = { active: 'Aktif', suspended: 'Ditangguhkan', revoked: 'Dicabut', expired: 'Kedaluwarsa' };
const ENTITLEMENT_STATUS_CLASS: Record<AdminMembershipEntitlement['status'], string> = {
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-amber-100 text-amber-800',
  revoked: 'bg-rose-100 text-rose-800',
  expired: 'bg-slate-200 text-slate-700'
};
const FLAG_INFO: Array<{ key: Exclude<keyof AdminMembershipFlags, 'graceDays' | 'whatsappSender'>; label: string; env: string }> = [
  { key: 'autodebit', label: 'Auto-debit', env: 'ENABLE_AUTODEBIT' },
  { key: 'whatsapp', label: 'Pengingat WhatsApp', env: 'WHATSAPP_PROVIDER' },
  { key: 'printDiscount', label: 'Diskon cetak anggota', env: 'ENABLE_MEMBER_PRINT_DISCOUNT' },
  { key: 'readerPick', label: 'Reader Pick', env: 'ENABLE_READER_DIGITAL_PICK' },
  { key: 'authorShelf', label: 'Rak Author Guild', env: 'ENABLE_AUTHOR_GUILD_SHELF' },
  { key: 'extendedBenefits', label: 'Benefit tambahan', env: 'MEMBERSHIP_EXTENDED_BENEFITS' }
];
const PAID_STATES: AdminSubscriptionStatus[] = ['active', 'past_due', 'grace'];
const SUBSCRIPTION_STATUSES: AdminSubscriptionStatus[] = ['pending', 'active', 'past_due', 'grace', 'canceled', 'expired'];

const planLabel = (plans: AdminMembershipPlan[], code: AdminPlanCode | null) =>
  (code ? plans.find((p) => p.code === code)?.nameId ?? code : '—');

/** Unduh Blob lewat object URL + <a download> sementara. */
const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ---------------------------------------------------------------------------
// Komponen kecil
// ---------------------------------------------------------------------------
const Section: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode; id?: string }> = ({ title, children, action, id }) => (
  <section id={id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h4>
      {action}
    </div>
    {children}
  </section>
);

const Badge: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${className}`}>{children}</span>
);
const StatusBadge: React.FC<{ status: AdminSubscriptionStatus }> = ({ status }) => <Badge className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</Badge>;
const FoundingBadge: React.FC = () => <Badge className="bg-[#DFBF64]/30 text-amber-900">Founding</Badge>;
const TestBadge: React.FC = () => <Badge className="bg-slate-200 uppercase text-slate-700">uji</Badge>;

const StatCard: React.FC<{ label: string; value: React.ReactNode; children?: React.ReactNode }> = ({ label, value, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    {children && <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-600">{children}</div>}
  </div>
);

const Alert: React.FC<{ kind: 'error' | 'notice' | 'warning'; children: React.ReactNode }> = ({ kind, children }) => {
  const cls = kind === 'notice'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-amber-200 bg-amber-50 text-amber-800';
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-xs ${cls}`}>{children}</div>;
};

const buttonCls = 'inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
const primaryCls = 'inline-flex items-center gap-1 rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-bold text-slate-950 hover:bg-[#c5a059] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
const inputCls = 'mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal disabled:bg-slate-100 disabled:text-slate-400';
const labelCls = 'block text-[11px] font-semibold text-slate-600';

// ---------------------------------------------------------------------------
// Ringkasan
// ---------------------------------------------------------------------------
const SummarySection: React.FC<{ summary: AdminMembershipSummary | null; plans: AdminMembershipPlan[]; loading: boolean; error: string | null; onReload: () => void }> = ({
  summary, plans, loading, error, onReload
}) => (
  <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-bold text-slate-800">
        Ringkasan {summary ? monthLabel(summary.month) : 'bulan ini'} <span className="font-normal text-slate-500">(WIB, tanpa langganan uji)</span>
      </h3>
      <button type="button" onClick={onReload} disabled={loading} className={buttonCls}>
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
      </button>
    </div>
    {error && <Alert kind="error">{error}</Alert>}
    {!summary && loading && <p className="text-xs text-slate-500">Memuat ringkasan…</p>}
    {summary && (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Anggota aktif" value={summary.activeTotal}>
            {summary.activeByPlan.map((p) => (
              <p key={p.code}><span className="font-semibold">{p.name}:</span> {p.active} <span className="text-slate-500">(tahunan {p.yearly} · Founding {p.founding})</span></p>
            ))}
          </StatCard>
          <StatCard label="Baru bulan ini" value={summary.newThisMonth}>
            <p>Pembayaran pertama yang lunas bulan ini.</p>
          </StatCard>
          <StatCard label="Pembatalan bulan ini" value={summary.cancelRequestsThisMonth}>
            <p>Permintaan batal: {summary.cancelRequestsThisMonth}</p>
            <p>Dibatalkan (berakhir): {summary.canceledThisMonth}</p>
            <p>Kedaluwarsa (tidak dibayar): {summary.expiredThisMonth}</p>
          </StatCard>
          <StatCard label="Tertunggak & tenggang" value={`${summary.pastDue} / ${summary.grace}`}>
            <p>past_due: {summary.pastDue} · grace: {summary.grace}</p>
          </StatCard>
          <StatCard label="Pendapatan keanggotaan bulan ini" value={rupiah(summary.revenueThisMonth)}>
            <p>Porsi dari paket tahunan: {percent(summary.revenueYearlyShare)}</p>
          </StatCard>
          <StatCard label="Porsi tahunan (anggota aktif)" value={percent(summary.activeYearlyShare)}>
            <p>Anggota aktif dengan siklus tahunan.</p>
          </StatCard>
          <StatCard label="Churn bulanan" value={percent(summary.churnRate)}>
            <p>(dibatalkan + kedaluwarsa) / aktif awal bulan ({summary.activeAtMonthStart})</p>
          </StatCard>
          <StatCard label="Sisa kursi Founding" value={summary.founding.reduce((sum, f) => sum + f.remaining, 0)}>
            {summary.founding.length === 0 && <p>Tidak ada paket dengan kuota Founding.</p>}
            {summary.founding.map((f) => (
              <p key={f.code}><span className="font-semibold">{planLabel(plans, f.code)}:</span> {f.used}/{f.cap ?? '—'} terpakai · sisa {f.remaining}</p>
            ))}
          </StatCard>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Flag</span>
            {FLAG_INFO.map((f) => (
              <span
                key={f.key}
                title={f.env}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${summary.flags[f.key] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}
              >
                {f.label}: {summary.flags[f.key] ? 'aktif' : 'mati'}
              </span>
            ))}
            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Masa tenggang: {summary.flags.graceDays} hari</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Flag adalah environment variable di Render ({FLAG_INFO.map((f) => f.env).join(', ')}); ubah di dashboard Render lalu redeploy. Tidak dapat diubah dari halaman ini.
            {summary.testSubscriptions > 0 && ` ${summary.testSubscriptions} langganan uji tidak dihitung dalam ringkasan.`}
          </p>
        </div>
      </>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Editor paket
// ---------------------------------------------------------------------------
type NumericField = 'priceMonthly' | 'priceYearly' | 'foundingPriceYearly' | 'foundingCap' | 'maxDevices' | 'printDiscountPercent';
interface PlanDraft {
  priceMonthly: string;
  priceYearly: string;
  foundingPriceYearly: string;
  foundingCap: string;
  maxDevices: string;
  printDiscountPercent: string;
  shelfAccess: AdminShelfAccess;
  isActive: boolean;
}
const NULLABLE_FIELDS: NumericField[] = ['foundingPriceYearly', 'foundingCap'];
const draftOf = (plan: AdminMembershipPlan): PlanDraft => ({
  priceMonthly: String(plan.priceMonthly),
  priceYearly: String(plan.priceYearly),
  foundingPriceYearly: plan.foundingPriceYearly === null ? '' : String(plan.foundingPriceYearly),
  foundingCap: plan.foundingCap === null ? '' : String(plan.foundingCap),
  maxDevices: String(plan.maxDevices),
  printDiscountPercent: String(plan.printDiscountPercent),
  shelfAccess: plan.shelfAccess,
  isActive: plan.isActive
});

/** Patch berisi kolom yang berubah saja; error bila kolom wajib kosong / bukan angka. */
const buildPatch = (plan: AdminMembershipPlan, draft: PlanDraft): { patch: AdminMembershipPlanPatch; error: string | null } => {
  const patch: AdminMembershipPlanPatch = {};
  const fields: NumericField[] = ['priceMonthly', 'priceYearly', 'foundingPriceYearly', 'foundingCap', 'maxDevices', 'printDiscountPercent'];
  for (const field of fields) {
    const text = draft[field].trim();
    const nullable = NULLABLE_FIELDS.includes(field);
    let value: number | null;
    if (text === '') {
      if (!nullable) return { patch, error: 'Isi semua kolom angka (hanya harga & kuota Founding yang boleh kosong).' };
      value = null;
    } else {
      value = Number(text);
      if (!Number.isInteger(value)) return { patch, error: 'Nilai harus bilangan bulat.' };
    }
    if (value !== plan[field]) (patch as Record<string, number | null>)[field] = value;
  }
  if (draft.shelfAccess !== plan.shelfAccess) patch.shelfAccess = draft.shelfAccess;
  if (draft.isActive !== plan.isActive) patch.isActive = draft.isActive;
  return { patch, error: null };
};

interface RowResult { error?: string; warnings?: string[]; note?: string }

const PlansEditor: React.FC<{ plans: AdminMembershipPlan[]; loading: boolean; error: string | null; onSaved: (plan: AdminMembershipPlan) => void }> = ({
  plans, loading, error, onSaved
}) => {
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({});
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(plans.map((p) => [p.code, draftOf(p)])));
  }, [plans]);

  const update = (code: string, change: Partial<PlanDraft>) => setDrafts((d) => ({ ...d, [code]: { ...d[code], ...change } }));

  const save = async (plan: AdminMembershipPlan) => {
    const draft = drafts[plan.code];
    if (!draft) return;
    const { patch, error: invalid } = buildPatch(plan, draft);
    if (invalid) return setResults((r) => ({ ...r, [plan.code]: { error: invalid } }));
    if (Object.keys(patch).length === 0) return setResults((r) => ({ ...r, [plan.code]: { error: 'Tidak ada perubahan.' } }));
    setSaving(plan.code);
    setResults((r) => ({ ...r, [plan.code]: {} }));
    try {
      const result = await apiClient.updateMembershipPlan(plan.code, patch);
      setResults((r) => ({ ...r, [plan.code]: { warnings: result.warnings, note: result.note } }));
      onSaved(result.plan);
    } catch (err) {
      setResults((r) => ({ ...r, [plan.code]: { error: errorText(err) } }));
    } finally {
      setSaving(null);
    }
  };

  const numberInput = (plan: AdminMembershipPlan, field: NumericField, label: string, opts: { disabled?: boolean; min?: number; max?: number; placeholder?: string; width?: string } = {}) => (
    <input
      type="number"
      inputMode="numeric"
      aria-label={`${label} — ${plan.nameId}`}
      value={drafts[plan.code]?.[field] ?? ''}
      min={opts.min ?? 0}
      max={opts.max}
      step={1}
      placeholder={opts.placeholder}
      disabled={opts.disabled || saving === plan.code}
      onChange={(event) => update(plan.code, { [field]: event.target.value } as Partial<PlanDraft>)}
      className={`${inputCls} mt-0 ${opts.width ?? 'w-28'}`}
    />
  );

  return (
    <Section title="Paket & harga" id="admin-membership-plans">
      {error && <Alert kind="error">{error}</Alert>}
      {loading && plans.length === 0 && <p className="text-xs text-slate-500">Memuat paket…</p>}
      {plans.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-1.5 pr-2">Paket</th>
                <th className="py-1.5 pr-2">Bulanan (Rp)</th>
                <th className="py-1.5 pr-2">Tahunan (Rp)</th>
                <th className="py-1.5 pr-2">Founding / thn (Rp)</th>
                <th className="py-1.5 pr-2">Kuota Founding</th>
                <th className="py-1.5 pr-2">Maks perangkat</th>
                <th className="py-1.5 pr-2">Akses rak</th>
                <th className="py-1.5 pr-2">Diskon cetak %</th>
                <th className="py-1.5 pr-2">Aktif</th>
                <th className="py-1.5">Simpan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {plans.map((plan) => {
                const draft = drafts[plan.code];
                const isFree = plan.code === 'free';
                const result = results[plan.code];
                const dirty = draft ? Object.keys(buildPatch(plan, draft).patch).length > 0 : false;
                const monthly = Number(draft?.priceMonthly);
                return (
                  <React.Fragment key={plan.code}>
                    <tr>
                      <td className="py-2 pr-2">
                        <p className="font-semibold text-slate-800">{plan.nameId}</p>
                        <p className="font-mono text-[10px] text-slate-400">{plan.code}</p>
                        <p className="text-[10px] text-slate-500">Diubah {dateTime(plan.updatedAt)}</p>
                      </td>
                      <td className="py-2 pr-2">{numberInput(plan, 'priceMonthly', 'Harga bulanan', { disabled: isFree, max: 100_000_000 })}</td>
                      <td className="py-2 pr-2">
                        {numberInput(plan, 'priceYearly', 'Harga tahunan', { disabled: isFree, max: 100_000_000 })}
                        {!isFree && Number.isInteger(monthly) && monthly > 0 && <p className="mt-0.5 text-[10px] text-slate-500">10× bulanan = {rupiah(monthly * 10)}</p>}
                      </td>
                      <td className="py-2 pr-2">{numberInput(plan, 'foundingPriceYearly', 'Harga Founding per tahun', { disabled: isFree, max: 100_000_000, placeholder: 'kosong' })}</td>
                      <td className="py-2 pr-2">
                        {numberInput(plan, 'foundingCap', 'Kuota Founding', { disabled: isFree, max: 1_000_000, placeholder: 'kosong', width: 'w-24' })}
                        <p className="mt-0.5 text-[10px] text-slate-500">Terpakai {plan.foundingCount}</p>
                      </td>
                      <td className="py-2 pr-2">{numberInput(plan, 'maxDevices', 'Maksimal perangkat', { min: 1, max: 10, width: 'w-20' })}</td>
                      <td className="py-2 pr-2">
                        <select
                          aria-label={`Akses rak — ${plan.nameId}`}
                          value={draft?.shelfAccess ?? plan.shelfAccess}
                          disabled={isFree || saving === plan.code}
                          onChange={(event) => update(plan.code, { shelfAccess: event.target.value as AdminShelfAccess })}
                          className={`${inputCls} mt-0 w-40`}
                        >
                          {(Object.keys(SHELF_LABEL) as AdminShelfAccess[]).map((s) => <option key={s} value={s}>{SHELF_LABEL[s]}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-2">{numberInput(plan, 'printDiscountPercent', 'Diskon cetak persen', { max: 50, width: 'w-20' })}</td>
                      <td className="py-2 pr-2">
                        <label className="inline-flex items-center gap-1.5 pt-1.5 text-[11px] font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={draft?.isActive ?? plan.isActive}
                            disabled={saving === plan.code}
                            onChange={(event) => update(plan.code, { isActive: event.target.checked })}
                            className="h-4 w-4"
                          />
                          <span className="sr-only">Paket {plan.nameId}</span> aktif
                        </label>
                      </td>
                      <td className="py-2">
                        <div className="flex flex-col gap-1">
                          <button type="button" onClick={() => void save(plan)} disabled={!dirty || saving === plan.code} className={primaryCls}>
                            <Save className="h-3.5 w-3.5" /> {saving === plan.code ? 'Menyimpan…' : 'Simpan'}
                          </button>
                          {dirty && (
                            <button type="button" onClick={() => update(plan.code, draftOf(plan))} disabled={saving === plan.code} className={buttonCls}>
                              Batalkan perubahan
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {result && (result.error || result.note || (result.warnings && result.warnings.length > 0)) && (
                      <tr>
                        <td colSpan={10} className="pb-2">
                          <div className="space-y-1">
                            {result.error && <Alert kind="error">{plan.nameId}: {result.error}</Alert>}
                            {result.warnings?.map((w) => <Alert key={w} kind="warning">Peringatan {plan.nameId}: {w}</Alert>)}
                            {result.note && <Alert kind="notice">{plan.nameId} tersimpan. {result.note}</Alert>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        Harga & kuota Founding diisi atau dikosongkan bersamaan. Free Circle tetap gratis tanpa Founding dan tanpa akses rak.
        Akses rak efektif juga bergantung pada flag Reader Pick / Rak Author Guild.
      </p>
    </Section>
  );
};

// ---------------------------------------------------------------------------
// Pengingat WhatsApp: status gateway & pesan uji
// ---------------------------------------------------------------------------
const WhatsAppSection: React.FC<{ flags: AdminMembershipFlags | null }> = ({ flags }) => {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AdminWhatsAppTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (send: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await apiClient.testMembershipWhatsApp(send ? to.trim() : undefined));
    } catch (err) {
      setResult(null);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Pengingat WhatsApp" id="admin-membership-whatsapp">
      <p className="text-[11px] text-slate-600">
        Pengingat tagihan (H-7, H-3, H-1, jatuh tempo), pembayaran gagal, masa tenggang, akses dikunci, dan pemberitahuan Founding
        dikirim dari nomor resmi{flags?.whatsappSender ? ` ${flags.whatsappSender}` : ''} ke anggota yang menyetujuinya; email tetap dikirim.
        Gateway diatur di Render: <code>WHATSAPP_PROVIDER</code> (fonnte / cloud) beserta tokennya.
      </p>
      {flags && !flags.whatsapp && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">Gateway WhatsApp belum aktif; pengingat saat ini hanya lewat email.</p>
      )}
      {error && <div className="mt-2"><Alert kind="error">{error}</Alert></div>}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <button type="button" onClick={() => void run(false)} disabled={busy} className={buttonCls}>
          <RefreshCw className="h-3.5 w-3.5" /> Periksa status gateway
        </button>
        <label className={labelCls}>
          Kirim pesan uji ke
          <input type="tel" value={to} onChange={(event) => setTo(event.target.value)} placeholder="0812 3456 7890" className={inputCls} />
        </label>
        <button type="button" onClick={() => void run(true)} disabled={busy || !to.trim()} className={buttonCls}>
          {busy ? 'Memproses…' : 'Kirim pesan uji'}
        </button>
      </div>
      {result && (
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-[11px] text-slate-700 sm:grid-cols-2">
          <div><dt className="inline font-semibold">Gateway: </dt><dd className="inline">{result.provider === 'fonnte' ? 'Fonnte' : 'WhatsApp Cloud API'}</dd></div>
          <div><dt className="inline font-semibold">Status: </dt><dd className="inline">{result.gatewayOk ? 'terhubung' : 'bermasalah'} · {result.detail}</dd></div>
          <div><dt className="inline font-semibold">Nomor resmi: </dt><dd className="inline">{result.senderNumber}</dd></div>
          <div>
            <dt className="inline font-semibold">Nomor tersambung: </dt>
            <dd className={`inline ${result.matchesSender === false ? 'font-semibold text-rose-700' : ''}`}>
              {result.connectedNumber ?? '—'}{result.matchesSender === false && ' (berbeda dengan nomor resmi)'}
            </dd>
          </div>
          {result.sentTo && <div className="sm:col-span-2 text-emerald-700">Pesan uji terkirim ke {result.sentTo}.</div>}
        </dl>
      )}
    </Section>
  );
};

// ---------------------------------------------------------------------------
// Ekspor CSV
// ---------------------------------------------------------------------------
/**
 * Fase 6 Langkah 4: antrian transfer keanggotaan untuk Finance — cocokkan nominal berkode unik dengan mutasi,
 * lihat bukti, lalu konfirmasi (satu-satunya jalan tagihan transfer menjadi lunas) atau perpanjang batas 24 jam.
 */
const TransfersPanel: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [rows, setRows] = useState<AdminMembershipTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows((await apiClient.listMembershipTransfers(includeExpired)).transfers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat antrian transfer.');
    } finally {
      setLoading(false);
    }
  }, [includeExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, label: string, run: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await run();
      setNotice(label);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tindakan gagal.');
    } finally {
      setBusy(null);
    }
  };

  const openProof = async (id: string) => {
    try {
      const url = await apiClient.membershipTransferProofUrl(id);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bukti gagal dibuka.');
    }
  };

  return (
    <section id="admin-membership-transfers" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">Transfer menunggu konfirmasi</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Cocokkan nominal (termasuk kode unik) dengan mutasi rekening, lalu konfirmasi. Keanggotaan aktif setelah dikonfirmasi.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-700">
          <input type="checkbox" checked={includeExpired} onChange={(e) => setIncludeExpired(e.target.checked)} />
          Tampilkan yang kedaluwarsa
        </label>
      </div>
      {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {notice && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>}
      {loading ? (
        <p className="mt-3 text-xs text-slate-500">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">Tidak ada transfer keanggotaan yang menunggu.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-2 font-semibold">Tagihan</th>
                <th className="px-2 py-2 font-semibold">Anggota</th>
                <th className="px-2 py-2 font-semibold">Nominal</th>
                <th className="px-2 py-2 font-semibold">Batas</th>
                <th className="px-2 py-2 font-semibold">Bukti</th>
                <th className="px-2 py-2 font-semibold">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const expired = row.status !== 'issued';
                return (
                  <tr key={row.id} data-invoice={row.orderRef} className={expired ? 'bg-amber-50/60' : undefined}>
                    <td className="px-2 py-2 align-top">
                      <span className="font-mono">{row.orderRef}</span>
                      <span className="block text-[11px] text-slate-500">{row.kind} · {row.planCode ?? '—'}{row.isTest ? ' · uji' : ''}</span>
                      {expired && <span className="mt-1 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">Kedaluwarsa</span>}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <span className="block">{row.customerName}</span>
                      <span className="block text-[11px] text-slate-500">{row.customerEmail}</span>
                    </td>
                    <td className="px-2 py-2 align-top font-mono">
                      Rp{row.amount.toLocaleString('id-ID')}
                      {row.transfer?.uniqueCode && <span className="block text-[11px] text-slate-500">kode {row.transfer.uniqueCode}</span>}
                    </td>
                    <td className="px-2 py-2 align-top">
                      {row.dueAt ? new Date(row.dueAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      {row.dueExtendedCount > 0 && <span className="block text-[11px] text-slate-500">diperpanjang {row.dueExtendedCount}×</span>}
                    </td>
                    <td className="px-2 py-2 align-top">
                      {row.transfer?.hasProof ? (
                        <button type="button" onClick={() => void openProof(row.id)} className="font-semibold text-blue-700 underline cursor-pointer">Lihat bukti</button>
                      ) : (
                        <span className="text-slate-400">belum ada</span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => {
                            const reference = window.prompt('Referensi mutasi bank (opsional):', '') ?? '';
                            void act(row.id, `Transfer ${row.orderRef} dikonfirmasi.`, async () => {
                              await apiClient.confirmMembershipTransfer(row.id, { reference, ...(expired ? { allow_expired: true } : {}) });
                            });
                          }}
                          className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white disabled:opacity-50 cursor-pointer"
                        >
                          {expired ? 'Konfirmasi (terlambat)' : 'Konfirmasi lunas'}
                        </button>
                        {!expired && row.kind !== 'renewal' && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void act(row.id, `Batas transfer ${row.orderRef} diperpanjang 24 jam.`, async () => { await apiClient.extendMembershipTransfer(row.id, 24); })}
                            className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700 disabled:opacity-50 cursor-pointer"
                          >
                            Perpanjang 24 jam
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const ExportSection: React.FC = () => {
  const [includeAbandoned, setIncludeAbandoned] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<AdminInvoiceStatus | ''>('');
  const [busy, setBusy] = useState<'subscriptions' | 'invoices' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (kind: 'subscriptions' | 'invoices') => {
    setBusy(kind);
    setError(null);
    try {
      const params = kind === 'subscriptions'
        ? { all: includeAbandoned ? '1' : undefined }
        : { from: from || undefined, to: to || undefined, status: invoiceStatus || undefined };
      const { blob, filename } = await apiClient.downloadMembershipCsv(kind, params);
      saveBlob(blob, filename);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Ekspor CSV (akuntansi, waktu WIB)" id="admin-membership-export">
      {error && <div className="mb-2"><Alert kind="error">{error}</Alert></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-700">Langganan</p>
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={includeAbandoned} onChange={(event) => setIncludeAbandoned(event.target.checked)} className="h-4 w-4" />
            Sertakan pendaftaran yang tidak pernah dibayar
          </label>
          <button type="button" onClick={() => void download('subscriptions')} disabled={busy !== null} className={buttonCls}>
            <Download className="h-3.5 w-3.5" /> {busy === 'subscriptions' ? 'Mengunduh…' : 'Unduh CSV langganan'}
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-700">Invoice</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className={labelCls}>
              Dibayar dari
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>
              sampai
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>
              Status
              <select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value as AdminInvoiceStatus | '')} className={inputCls}>
                <option value="">Semua</option>
                {(Object.keys(INVOICE_STATUS_LABEL) as AdminInvoiceStatus[]).map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void download('invoices')} disabled={busy !== null} className={buttonCls}>
              <Download className="h-3.5 w-3.5" /> {busy === 'invoices' ? 'Mengunduh…' : 'Unduh CSV invoice'}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">Rentang tanggal memfilter tanggal bayar (WIB, inklusif); invoice yang belum dibayar tidak ikut bila tanggal diisi.</p>
        </div>
      </div>
    </Section>
  );
};

// ---------------------------------------------------------------------------
// Aksi admin di panel detail
// ---------------------------------------------------------------------------
type ActionKey = 'extend' | 'grace' | 'cancel' | 'change-plan' | 'founding';
const ACTION_LABEL: Record<ActionKey, string> = {
  extend: 'Perpanjang manual',
  grace: 'Masa tenggang tambahan',
  cancel: 'Batalkan',
  'change-plan': 'Ubah paket',
  founding: 'Founding'
};

const ActionsPanel: React.FC<{
  subscription: AdminSubscription;
  plans: AdminMembershipPlan[];
  onDone: (message: string) => Promise<void>;
  onError: (message: string) => void;
}> = ({ subscription: s, plans, onDone, onError }) => {
  const [action, setAction] = useState<ActionKey>('extend');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('3');
  const [immediate, setImmediate] = useState(false);
  const [planCode, setPlanCode] = useState<AdminPlanCode | ''>(s.planCode ?? '');
  const [cycle, setCycle] = useState<AdminBillingCycle>(s.billingCycle);
  const [when, setWhen] = useState<'now' | 'period_end'>('period_end');

  // Reset formulir saat langganan yang dibuka berganti.
  useEffect(() => {
    setNote('');
    setAmount('');
    setDays('3');
    setImmediate(false);
    setPlanCode(s.planCode ?? '');
    setCycle(s.billingCycle);
    setWhen('period_end');
  }, [s.id, s.planCode, s.billingCycle]);

  const paidState = PAID_STATES.includes(s.status);
  const ended = s.status === 'canceled' || s.status === 'expired';
  const who = s.email || s.userId;
  const paidPlans = plans.filter((p) => p.code !== 'free');
  const trimmedNote = note.trim() || undefined;

  const disabledReason: Record<ActionKey, string | null> = {
    extend: s.status === 'pending' || !s.currentPeriodStart
      ? 'Langganan belum pernah aktif; anggota harus menyelesaikan pembayaran pertama.'
      : !ended && s.cancelAtPeriodEnd ? 'Langganan dijadwalkan berakhir; perpanjang setelah periode berakhir.' : null,
    grace: paidState ? null : 'Hanya untuk langganan yang masih berjalan (aktif/tertunggak/tenggang).',
    cancel: ended ? 'Langganan sudah berakhir.' : null,
    'change-plan': paidState ? null : 'Hanya untuk langganan yang masih berjalan.',
    founding: null
  };

  const run = async (confirmText: string, call: () => Promise<AdminSubscriptionActionResult>, success: (r: AdminSubscriptionActionResult) => string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const result = await call();
      const extras = [result.refundNote, result.note].filter(Boolean).join(' ');
      setNote('');
      await onDone(`${success(result)}${extras ? ` ${extras}` : ''}`);
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabledReason[action]) return;
    if (action === 'extend') {
      const value = amount.trim() === '' ? undefined : Number(amount);
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) return onError('Jumlah harus bilangan bulat rupiah.');
      void run(
        `Catat pembayaran offline dan perpanjang satu periode untuk ${who}?\nJumlah: ${value === undefined ? 'nominal perpanjangan reguler' : rupiah(value)}.`,
        () => apiClient.extendMembershipSubscription(s.id, { amount: value, note: trimmedNote }),
        (r) => `Langganan diperpanjang${r.invoice ? ` (invoice ${r.invoice.orderRef}, ${rupiah(r.invoice.amount)} lunas)` : ''}; periode berakhir ${dateOnly(r.subscription.currentPeriodEnd)}.`
      );
    } else if (action === 'grace') {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 30) return onError('Jumlah hari harus 1–30.');
      void run(
        `Tambah masa tenggang ${n} hari untuk ${who}?`,
        () => apiClient.addMembershipGrace(s.id, { days: n, note: trimmedNote }),
        (r) => `Masa tenggang ditambah ${n} hari; akhir tenggang ${dateTime(r.subscription.graceEndsAt)}.`
      );
    } else if (action === 'cancel') {
      const now = immediate || s.status !== 'active';
      void run(
        now
          ? `Batalkan SEKARANG langganan ${who}? Akses keanggotaan langsung dicabut dan tagihan terbuka dibatalkan.`
          : `Batalkan langganan ${who} di akhir periode (${dateOnly(s.currentPeriodEnd)})? Akses tetap sampai akhir periode.`,
        () => apiClient.cancelMembershipSubscription(s.id, { immediate: now, note: trimmedNote }),
        () => (now ? 'Langganan dibatalkan sekarang.' : 'Langganan dijadwalkan berakhir di akhir periode.')
      );
    } else if (action === 'change-plan') {
      if (!planCode) return onError('Pilih paket.');
      if (planCode === s.planCode && cycle === s.billingCycle) return onError('Paket dan siklus sama dengan yang berjalan.');
      const target = planLabel(plans, planCode);
      void run(
        `Ubah paket ${who} menjadi ${target} (${CYCLE_LABEL[cycle]}) ${when === 'now' ? 'SEKARANG (tanpa tagihan; periode tetap)' : 'di akhir periode'}?`,
        () => apiClient.changeMembershipPlan(s.id, { plan_code: planCode, billing_cycle: cycle, when, note: trimmedNote }),
        () => (when === 'now' ? `Paket diubah menjadi ${target} (${CYCLE_LABEL[cycle]}).` : `Perubahan ke ${target} (${CYCLE_LABEL[cycle]}) dijadwalkan di akhir periode.`)
      );
    } else {
      const next = !s.isFounding;
      void run(
        next ? `Tandai ${who} sebagai Founding? Satu kursi Founding paket ini akan terpakai.` : `Hapus status Founding ${who}? Kursi Founding paket ini dilepas.`,
        () => apiClient.setMembershipFounding(s.id, { is_founding: next, note: trimmedNote }),
        () => (next ? 'Ditandai sebagai Founding.' : 'Status Founding dihapus.')
      );
    }
  };

  const reason = disabledReason[action];
  return (
    <Section title="Aksi admin">
      <div role="tablist" aria-label="Pilih aksi" className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(ACTION_LABEL) as ActionKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={action === key}
            onClick={() => setAction(key)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${action === key ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            {key === 'founding' ? (s.isFounding ? 'Hapus Founding' : 'Tandai Founding') : ACTION_LABEL[key]}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        {action === 'extend' && (
          <>
            <p className="text-[11px] text-slate-600">
              Mencatat pembayaran offline sebagai invoice manual yang lunas dan menambah satu periode ({CYCLE_LABEL[s.billingCycle].toLowerCase()}).
              Tagihan online yang masih terbuka untuk periode itu dibatalkan. Langganan yang sudah berakhir dibuka kembali mulai hari ini.
            </p>
            <label className={`${labelCls} max-w-xs`}>
              Jumlah dibayar (Rp, opsional)
              <input type="number" inputMode="numeric" min={0} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="kosong = nominal reguler" className={inputCls} />
            </label>
          </>
        )}
        {action === 'grace' && (
          <>
            <p className="text-[11px] text-slate-600">
              Menambah hari tenggang untuk periode berjalan (saat ini +{s.extraGraceDays} hari; akhir tenggang {dateTime(s.graceEndsAt)}).
            </p>
            <label className={`${labelCls} max-w-[10rem]`}>
              Jumlah hari (1–30)
              <input type="number" min={1} max={30} step={1} value={days} onChange={(event) => setDays(event.target.value)} className={inputCls} required />
            </label>
          </>
        )}
        {action === 'cancel' && (
          <fieldset className="space-y-1.5">
            <legend className="text-[11px] font-semibold text-slate-600">Waktu pembatalan</legend>
            <label className="flex items-start gap-2 text-[11px] text-slate-700">
              <input type="radio" name="cancel-when" checked={!immediate} onChange={() => setImmediate(false)} disabled={s.status !== 'active'} className="mt-0.5" />
              <span>Di akhir periode ({dateOnly(s.currentPeriodEnd)}) — akses tetap sampai akhir periode, tidak ada tagihan berikutnya.</span>
            </label>
            <label className="flex items-start gap-2 text-[11px] text-slate-700">
              <input type="radio" name="cancel-when" checked={immediate || s.status !== 'active'} onChange={() => setImmediate(true)} className="mt-0.5" />
              <span>Sekarang — akses keanggotaan langsung dicabut, sesi baca diakhiri, tagihan terbuka dibatalkan.</span>
            </label>
            {s.status !== 'active' && !ended && (
              <p className="text-[10px] text-slate-500">Status {STATUS_LABEL[s.status].toLowerCase()} selalu dibatalkan seketika.</p>
            )}
            <p className="text-[10px] text-slate-500">Pengembalian dana (bila ada) dilakukan manual di dashboard Midtrans.</p>
          </fieldset>
        )}
        {action === 'change-plan' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <label className={labelCls}>
                Paket
                <select value={planCode} onChange={(event) => setPlanCode(event.target.value as AdminPlanCode)} className={inputCls}>
                  <option value="">Pilih paket…</option>
                  {paidPlans.map((p) => <option key={p.code} value={p.code}>{p.nameId}{p.code === s.planCode ? ' (saat ini)' : ''}{p.isActive ? '' : ' — nonaktif'}</option>)}
                </select>
              </label>
              <label className={labelCls}>
                Siklus
                <select value={cycle} onChange={(event) => setCycle(event.target.value as AdminBillingCycle)} className={inputCls}>
                  <option value="monthly">Bulanan</option>
                  <option value="yearly">Tahunan</option>
                </select>
              </label>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-[11px] font-semibold text-slate-600">Berlaku</legend>
              <label className="flex items-start gap-2 text-[11px] text-slate-700">
                <input type="radio" name="change-when" checked={when === 'period_end'} onChange={() => setWhen('period_end')} className="mt-0.5" />
                <span>Di akhir periode — perpanjangan berikutnya memakai paket/siklus baru.</span>
              </label>
              <label className="flex items-start gap-2 text-[11px] text-slate-700">
                <input type="radio" name="change-when" checked={when === 'now'} onChange={() => setWhen('now')} className="mt-0.5" />
                <span>Sekarang — tanpa tagihan (koreksi/kompensasi); periode tetap, akses paket baru mulai sekarang.</span>
              </label>
            </fieldset>
          </div>
        )}
        {action === 'founding' && (
          <p className="text-[11px] text-slate-600">
            {s.isFounding
              ? `Status Founding aktif${s.foundingEndsAt ? ` (harga Founding sampai ${dateOnly(s.foundingEndsAt)})` : ''}. Menghapus status melepas satu kursi Founding paket.`
              : 'Founding hanya untuk langganan tahunan yang sudah aktif pada paket dengan kuota Founding; satu kursi akan terpakai.'}
            {' '}Harga terkunci tidak berubah.
          </p>
        )}

        <label className={`${labelCls} max-w-xl`}>
          Catatan (opsional, tercatat di riwayat)
          <input type="text" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className={inputCls} />
        </label>
        {reason && <p className="text-[11px] text-amber-700">{reason}</p>}
        <button type="submit" disabled={busy || Boolean(reason)} className={action === 'cancel' ? 'inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer' : primaryCls}>
          {busy ? 'Memproses…' : action === 'founding' ? (s.isFounding ? 'Hapus Founding…' : 'Tandai Founding…') : `${ACTION_LABEL[action]}…`}
        </button>
      </form>
    </Section>
  );
};

// ---------------------------------------------------------------------------
// Panel detail
// ---------------------------------------------------------------------------
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
    <dd className="text-xs text-slate-800 [overflow-wrap:anywhere]">{children}</dd>
  </div>
);

const compactJson = (meta: Record<string, unknown>) => {
  const entries = Object.entries(meta).filter(([, v]) => v !== null && v !== undefined);
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : '';
};

const DetailPanel: React.FC<{
  detail: AdminSubscriptionDetail;
  plans: AdminMembershipPlan[];
  loading: boolean;
  onReload: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onOpenUser?: (userId: string) => void;
  onActionDone: (message: string) => Promise<void>;
  onActionError: (message: string) => void;
}> = ({ detail, plans, loading, onReload, onClose, onSelect, onOpenUser, onActionDone, onActionError }) => {
  const s = detail.subscription;
  const activeDevices = detail.devices.filter((d) => !d.releasedAt).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 text-white">
        <div className="min-w-0">
          <p className="text-sm font-bold [overflow-wrap:anywhere]">{detail.user.fullName || s.name || '(tanpa nama)'} · {detail.user.email || s.email || '—'}</p>
          <p className="font-mono text-[10px] text-slate-400">Pengguna {s.userId} · Langganan {s.id}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={s.status} />
            {s.isFounding && <FoundingBadge />}
            {s.isTest && <TestBadge />}
            <span className="text-[11px] text-slate-300">{s.planName ?? s.planCode ?? '—'} · {CYCLE_LABEL[s.billingCycle]}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenUser && (
            <button type="button" onClick={() => onOpenUser(s.userId)} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 cursor-pointer">
              <ExternalLink className="h-3.5 w-3.5" /> Entitlement & Akses
            </button>
          )}
          <button type="button" onClick={onReload} disabled={loading} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-50 cursor-pointer">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 cursor-pointer">
            <X className="h-3.5 w-3.5" /> Tutup
          </button>
        </div>
      </div>

      <Section title="Langganan">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Paket">{s.planName ?? s.planCode ?? '—'}</Field>
          <Field label="Siklus">{CYCLE_LABEL[s.billingCycle]}</Field>
          <Field label="Status"><StatusBadge status={s.status} /></Field>
          <Field label="Harga terkunci">{rupiah(s.priceLocked)}</Field>
          <Field label="Periode berjalan">{dateOnly(s.currentPeriodStart)} – {dateOnly(s.currentPeriodEnd)}</Field>
          <Field label="Akhir tenggang">{dateTime(s.graceEndsAt)}{s.extraGraceDays > 0 && ` (+${s.extraGraceDays} hari admin)`}</Field>
          <Field label="Akses sampai">{dateTime(s.accessEndsAt)}</Field>
          <Field label="Founding">{s.isFounding ? `Ya${s.foundingEndsAt ? ` · harga Founding sampai ${dateOnly(s.foundingEndsAt)}` : ''}` : 'Tidak'}</Field>
          <Field label="Metode bayar">{PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod}</Field>
          <Field label="Auto-debit">{s.autodebit ? 'Aktif' : 'Tidak'}</Field>
          <Field label="Pengingat WhatsApp">{s.whatsappOptIn && s.whatsappNumber ? `+${s.whatsappNumber}` : 'Tidak'}</Field>
          <Field label="Batal di akhir periode">{s.cancelAtPeriodEnd ? 'Ya' : 'Tidak'}</Field>
          <Field label="Dibatalkan">{dateTime(s.canceledAt)}</Field>
          <Field label="Berakhir">{dateTime(s.endedAt)}{s.endedReason && <span className="block text-[10px] text-slate-500">{s.endedReason}</span>}</Field>
          <Field label="Batas perangkat">{detail.maxDevices}</Field>
          <Field label="Bahasa">{s.language}</Field>
          <Field label="Dibuat / diubah">{dateTime(s.createdAt)} / {dateTime(s.updatedAt)}</Field>
        </dl>
        {(s.pendingPlanCode || s.pendingBillingCycle) && (
          <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            Perubahan terjadwal di akhir periode ({dateOnly(s.currentPeriodEnd)}): paket {planLabel(plans, s.pendingPlanCode ?? s.planCode)}, siklus {CYCLE_LABEL[s.pendingBillingCycle ?? s.billingCycle]}.
          </p>
        )}
      </Section>

      <ActionsPanel subscription={s} plans={plans} onDone={onActionDone} onError={onActionError} />

      <Section title={`Invoice (${detail.invoices.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-1.5 pr-2">Nomor</th><th className="py-1.5 pr-2">Jenis</th><th className="py-1.5 pr-2">Paket</th><th className="py-1.5 pr-2">Periode</th>
                <th className="py-1.5 pr-2">Jumlah</th><th className="py-1.5 pr-2">Status</th><th className="py-1.5 pr-2">Dibayar</th><th className="py-1.5">Metode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.invoices.map((i) => (
                <tr key={i.id}>
                  <td className="py-1.5 pr-2 font-mono text-[11px]">{i.orderRef}{i.isTest && <span className="ml-1"><TestBadge /></span>}</td>
                  <td className="py-1.5 pr-2">{INVOICE_KIND_LABEL[i.kind] ?? i.kind}{i.isFoundingPrice && <span className="ml-1"><FoundingBadge /></span>}</td>
                  <td className="py-1.5 pr-2">{planLabel(plans, i.planCode)} · {CYCLE_LABEL[i.billingCycle]}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{dateOnly(i.periodStart)} – {dateOnly(i.periodEnd)}</td>
                  <td className="py-1.5 pr-2 font-semibold">{rupiah(i.amount)}</td>
                  <td className="py-1.5 pr-2">
                    <Badge className={INVOICE_STATUS_CLASS[i.status]}>{INVOICE_STATUS_LABEL[i.status] ?? i.status}</Badge>
                    {i.failureReason && <p className="mt-0.5 text-[10px] text-slate-500">{i.failureReason}</p>}
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{dateTime(i.paidAt)}</td>
                  <td className="py-1.5">{i.paymentType ?? (i.kind === 'manual' ? 'offline' : '—')}</td>
                </tr>
              ))}
              {detail.invoices.length === 0 && <tr><td colSpan={8} className="py-2 text-slate-500">Belum ada invoice.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Riwayat kejadian (${detail.events.length})`}>
        <ol className="max-h-80 space-y-1.5 overflow-auto border-l-2 border-slate-200 pl-3 text-xs">
          {detail.events.map((e) => {
            const meta = compactJson(e.meta);
            return (
              <li key={e.id}>
                <p>
                  <span className="font-semibold">{EVENT_LABEL[e.type] ?? e.type}</span>
                  <span className="ml-2 text-[10px] text-slate-500">{dateTime(e.createdAt)}</span>
                  <span className="ml-2 font-mono text-[10px] text-slate-400">{e.type}</span>
                </p>
                {meta && <p className="font-mono text-[10px] text-slate-500 [overflow-wrap:anywhere]">{meta}</p>}
              </li>
            );
          })}
          {detail.events.length === 0 && <li className="text-slate-500">Belum ada kejadian.</li>}
        </ol>
      </Section>

      <Section title={`Hak akses pengguna (${detail.entitlements.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="py-1.5 pr-2">Cakupan</th><th className="py-1.5 pr-2">Sumber</th><th className="py-1.5 pr-2">Status</th><th className="py-1.5 pr-2">Berlaku</th><th className="py-1.5">Perangkat</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.entitlements.map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5 pr-2">
                    {e.scope === 'shelf'
                      ? 'Seluruh Digital Reading Shelf'
                      : e.product ? `${e.product.title} (${e.product.format === 'ebook' ? 'E-Book' : 'Audiobook'})` : e.productId ?? '—'}
                    <br /><span className="font-mono text-[10px] text-slate-400">{e.id}</span>
                  </td>
                  <td className="py-1.5 pr-2">{SOURCE_LABEL[e.source] ?? e.source}</td>
                  <td className="py-1.5 pr-2">
                    <Badge className={ENTITLEMENT_STATUS_CLASS[e.status]}>{ENTITLEMENT_STATUS_LABEL[e.status]}</Badge>
                    <span className={`ml-1 text-[10px] ${e.usable ? 'text-emerald-700' : 'text-slate-500'}`}>{e.usable ? 'dapat dipakai' : 'tidak berlaku'}</span>
                    {e.revokedReason && <p className="mt-0.5 text-[10px] text-slate-500">{e.revokedReason}</p>}
                  </td>
                  <td className="py-1.5 pr-2">{dateTime(e.startsAt)} – {e.endsAt ? dateTime(e.endsAt) : 'selamanya'}</td>
                  <td className="py-1.5">{e.maxDevices}</td>
                </tr>
              ))}
              {detail.entitlements.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-500">Belum ada hak akses.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`Perangkat (${activeDevices} aktif / batas ${detail.maxDevices})`}>
          <ul className="divide-y divide-slate-100 text-xs">
            {detail.devices.map((d) => (
              <li key={d.id} className="py-1.5">
                <p className="font-semibold">{d.label}{d.releasedAt && <span className="ml-1 font-normal text-slate-400">(dilepas {d.releasedBy === 'admin' ? 'admin' : 'pengguna'} {dateTime(d.releasedAt)})</span>}</p>
                <p className="text-[10px] text-slate-500">Pertama {dateTime(d.firstSeen)} · terakhir aktif {dateTime(d.lastSeen)}</p>
              </li>
            ))}
            {detail.devices.length === 0 && <li className="py-1.5 text-slate-500">Belum ada perangkat.</li>}
          </ul>
        </Section>
        <Section title={`Pick (${detail.picks.length})`}>
          <ul className="divide-y divide-slate-100 text-xs">
            {detail.picks.map((p) => (
              <li key={p.id} className="py-1.5">
                <p className="font-semibold">{p.product ? `${p.product.title} (${p.product.format === 'ebook' ? 'E-Book' : 'Audiobook'})` : p.productId}</p>
                <p className="text-[10px] text-slate-500">Periode {dateOnly(p.periodStart)} – {dateOnly(p.periodEnd)} · dipilih {dateTime(p.createdAt)}</p>
              </li>
            ))}
            {detail.picks.length === 0 && <li className="py-1.5 text-slate-500">Belum ada Pick.</li>}
          </ul>
        </Section>
      </div>

      <Section title={`Langganan lain pengguna ini (${detail.history.length})`}>
        <ul className="divide-y divide-slate-100 text-xs">
          {detail.history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={h.status} />
                {h.isFounding && <FoundingBadge />}
                {h.isTest && <TestBadge />}
                <span>{h.planName ?? h.planCode ?? '—'} · {CYCLE_LABEL[h.billingCycle]}</span>
                <span className="text-slate-500">{dateOnly(h.currentPeriodStart)} – {dateOnly(h.currentPeriodEnd)}{h.endedReason ? ` · ${h.endedReason}` : ''}</span>
              </span>
              <button type="button" onClick={() => onSelect(h.id)} className={buttonCls}>Buka</button>
            </li>
          ))}
          {detail.history.length === 0 && <li className="py-1.5 text-slate-500">Tidak ada langganan lain.</li>}
        </ul>
      </Section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab utama
// ---------------------------------------------------------------------------
interface MembershipAdminTabProps {
  /** Buka pengguna di tab "Entitlement & Akses". */
  onOpenUser?: (userId: string) => void;
}

type ListFilters = Required<Pick<AdminSubscriptionFilters, 'plan' | 'status' | 'founding' | 'all'>>;

/**
 * Admin "Keanggotaan" (fase 3, Langkah 8): ringkasan, edit paket tanpa deploy, daftar & detail langganan,
 * aksi manual (perpanjang, tenggang, batal, ubah paket, Founding), dan ekspor CSV.
 */
export const MembershipAdminTab: React.FC<MembershipAdminTabProps> = ({ onOpenUser }) => {
  const [summary, setSummary] = useState<AdminMembershipSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [plans, setPlans] = useState<AdminMembershipPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ListFilters>({ plan: '', status: '', founding: '', all: false });
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminSubscriptionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      setSummary(await apiClient.getMembershipSummary());
    } catch (err) {
      setSummaryError(errorText(err));
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      setPlans((await apiClient.getMembershipPlans()).plans);
    } catch (err) {
      setPlansError(errorText(err));
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const result = await apiClient.listMembershipSubscriptions({ ...filters, q: query });
      setSubscriptions(result.subscriptions);
      setTotal(result.total);
    } catch (err) {
      setListError(errorText(err));
    } finally {
      setListLoading(false);
    }
  }, [filters, query]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      setDetail(await apiClient.getMembershipSubscription(id));
    } catch (err) {
      setDetailError(errorText(err));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void loadPlans();
  }, [loadSummary, loadPlans]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setNotice(null);
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    void loadDetail(selectedId).then(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [selectedId, loadDetail]);

  const onActionDone = async (message: string) => {
    setNotice(message);
    setDetailError(null);
    if (selectedId) await Promise.all([loadDetail(selectedId), loadList(), loadSummary(), loadPlans()]);
  };

  const onActionError = (message: string) => {
    setNotice(null);
    setDetailError(message);
  };

  const onPlanSaved = (plan: AdminMembershipPlan) => {
    setPlans((list) => list.map((p) => (p.code === plan.code ? plan : p)));
    void loadSummary();
  };

  const setFilter = <K extends keyof ListFilters>(key: K, value: ListFilters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const planOptions = useMemo(() => plans.filter((p) => p.code !== 'free'), [plans]);

  return (
    <div id="admin-membership" className="space-y-6">
      <SummarySection summary={summary} plans={plans} loading={summaryLoading} error={summaryError} onReload={() => void loadSummary()} />

      <PlansEditor plans={plans} loading={plansLoading} error={plansError} onSaved={onPlanSaved} />

      <TransfersPanel onChanged={() => { void loadSummary(); void loadList(); }} />

      <WhatsAppSection flags={summary?.flags ?? null} />

      <ExportSection />

      <Section
        title={`Langganan (${subscriptions.length}${total > subscriptions.length ? ` dari ${total}` : ''})`}
        id="admin-membership-subscriptions"
        action={(
          <button type="button" onClick={() => void loadList()} disabled={listLoading} className={buttonCls}>
            <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
        )}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(queryInput.trim());
          }}
          className="mb-3 flex flex-wrap items-end gap-2"
        >
          <label className={`${labelCls} min-w-[12rem] flex-1`}>
            Cari (email, nama, ID)
            <input type="search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="nama@contoh.com" className={inputCls} />
          </label>
          <label className={labelCls}>
            Paket
            <select value={filters.plan} onChange={(event) => setFilter('plan', event.target.value as ListFilters['plan'])} className={inputCls}>
              <option value="">Semua</option>
              {planOptions.map((p) => <option key={p.code} value={p.code}>{p.nameId}</option>)}
            </select>
          </label>
          <label className={labelCls}>
            Status
            <select value={filters.status} onChange={(event) => setFilter('status', event.target.value as ListFilters['status'])} className={inputCls}>
              <option value="">Semua</option>
              <option value="open">Berjalan (menunggu/aktif/tertunggak/tenggang)</option>
              {SUBSCRIPTION_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
            </select>
          </label>
          <label className={labelCls}>
            Founding
            <select value={filters.founding} onChange={(event) => setFilter('founding', event.target.value as ListFilters['founding'])} className={inputCls}>
              <option value="">Semua</option>
              <option value="true">Ya</option>
              <option value="false">Tidak</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-[11px] font-semibold text-slate-600">
            <input type="checkbox" checked={filters.all} onChange={(event) => setFilter('all', event.target.checked)} className="h-4 w-4" />
            Tampilkan pendaftaran tak dibayar
          </label>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer">
            <Search className="h-3.5 w-3.5" /> Cari
          </button>
        </form>

        {listError && <div className="mb-2"><Alert kind="error">{listError}</Alert></div>}
        {listLoading && subscriptions.length === 0 && <p className="text-xs text-slate-500">Memuat langganan…</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-1.5 pr-2">Anggota</th><th className="py-1.5 pr-2">Paket</th><th className="py-1.5 pr-2">Siklus</th><th className="py-1.5 pr-2">Status</th>
                <th className="py-1.5 pr-2">Akhir periode</th><th className="py-1.5 pr-2">Akses sampai</th><th className="py-1.5 pr-2">Metode</th><th className="py-1.5">Auto-debit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscriptions.map((s) => (
                <tr key={s.id} className={s.id === selectedId ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                  <td className="py-1.5 pr-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      aria-pressed={s.id === selectedId}
                      className="text-left font-semibold text-slate-900 underline-offset-2 hover:underline cursor-pointer [overflow-wrap:anywhere]"
                    >
                      {s.email || '(tanpa email)'}
                    </button>
                    <p className="text-[10px] text-slate-500 [overflow-wrap:anywhere]">{s.name || '—'}</p>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="flex flex-wrap items-center gap-1">
                      {s.planName ?? s.planCode ?? '—'}
                      {s.isFounding && <FoundingBadge />}
                      {s.isTest && <TestBadge />}
                    </span>
                    {s.pendingPlanCode && <p className="text-[10px] text-sky-700">→ {planLabel(plans, s.pendingPlanCode)}</p>}
                  </td>
                  <td className="py-1.5 pr-2">{CYCLE_LABEL[s.billingCycle]}{s.pendingBillingCycle && <span className="text-[10px] text-sky-700"> → {CYCLE_LABEL[s.pendingBillingCycle]}</span>}</td>
                  <td className="py-1.5 pr-2">
                    <StatusBadge status={s.status} />
                    {s.cancelAtPeriodEnd && s.status !== 'canceled' && s.status !== 'expired' && <p className="text-[10px] text-rose-700">batal di akhir periode</p>}
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{dateOnly(s.currentPeriodEnd)}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{dateTime(s.accessEndsAt)}</td>
                  <td className="py-1.5 pr-2">{PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod}</td>
                  <td className="py-1.5">{s.autodebit ? 'Ya' : '—'}</td>
                </tr>
              ))}
              {!listLoading && subscriptions.length === 0 && !listError && (
                <tr><td colSpan={8} className="py-3 text-slate-500">Tidak ada langganan yang cocok dengan filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {total > subscriptions.length && (
          <p className="mt-2 text-[11px] text-slate-500">Menampilkan {subscriptions.length} dari {total} langganan; persempit filter atau gunakan ekspor CSV.</p>
        )}
      </Section>

      <div ref={detailRef} className="scroll-mt-4 space-y-3" aria-live="polite">
        {selectedId && (
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Crown className="h-4 w-4 text-[#D4AF37]" /> Detail langganan
          </h3>
        )}
        {notice && <Alert kind="notice">{notice}</Alert>}
        {detailError && <Alert kind="error">{detailError}</Alert>}
        {selectedId && detailLoading && !detail && <p className="text-xs text-slate-500">Memuat detail langganan…</p>}
        {detail && selectedId && (
          <DetailPanel
            detail={detail}
            plans={plans}
            loading={detailLoading}
            onReload={() => void loadDetail(selectedId)}
            onClose={() => setSelectedId(null)}
            onSelect={setSelectedId}
            onOpenUser={onOpenUser}
            onActionDone={onActionDone}
            onActionError={onActionError}
          />
        )}
      </div>
    </div>
  );
};
