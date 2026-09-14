import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Download, FileText, Link2, Mail, Play, Plus, RefreshCw, Save, Upload, X } from 'lucide-react';
import {
  cancelInstitutionContract,
  createInstitution,
  createInstitutionContract,
  createInstitutionPaymentLink,
  createInstitutionTrial,
  declineInstitutionRenewal,
  downloadInstitutionInvoicePdf,
  getInstitutionCatalog,
  getInstitutionDetail,
  getInstitutionInvoiceLink,
  getInstitutionSummary,
  INSTITUTION_STATUSES,
  issueInstitutionContract,
  listInquiriesForConversion,
  listInstitutions,
  markInstitutionInvoicePaid,
  openInstitutionInvoiceProof,
  ORG_TYPES,
  previewInstitutionContract,
  runInstitutionJob,
  sendInstitutionInvoice,
  updateInstitution,
  updateInstitutionConfig,
  uploadInstitutionInvoiceProof,
  voidInstitutionInvoice,
  type AdminContract,
  type AdminInstitution,
  type AdminInstitutionInvoice,
  type CatalogProduct,
  type ContractInput,
  type ContractPreview,
  type ContractStatus,
  type InstitutionConfig,
  type InstitutionDetail,
  type InstitutionInvoiceStatus,
  type InstitutionListRow,
  type InstitutionOrgType,
  type InstitutionStatus,
  type InstitutionSummary,
  type InstitutionTierCode,
  type ManualPaymentMethod
} from '../services/institutionAdminApi';
import type { InstitutionInquiry } from '../types';
import { InstitutionMembersSection } from './InstitutionMembersSection';

/**
 * Tab admin "Institusi" (fase 4 Langkah 2): konversi permintaan penawaran -> institusi, kontrak dengan rincian
 * perhitungan sebelum disimpan, trial, invoice PDF, bukti & pelunasan manual, tautan Midtrans, konfigurasi.
 */

// ---------------------------------------------------------------------------
// Format & label
// ---------------------------------------------------------------------------
const TIME_ZONE = 'Asia/Jakarta';
const dateOnly = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('id-ID', { dateStyle: 'medium', timeZone: TIME_ZONE }) : '—');
const dateTime = (iso: string | null | undefined) =>
  (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE }) : '—');
const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const todayWib = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const errorText = (err: any) => err?.message || (err?.status === 503
  ? 'Modul institusi belum aktif di server ini (Supabase belum terhubung atau migration fase 4 belum dijalankan).'
  : 'Terjadi kesalahan.');

const STATUS_LABEL: Record<InstitutionStatus, string> = {
  prospect: 'Prospek', trial: 'Trial', active: 'Aktif', grace: 'Masa tenggang', expired: 'Berakhir', suspended: 'Ditangguhkan'
};
const STATUS_CLASS: Record<InstitutionStatus, string> = {
  prospect: 'bg-sky-100 text-sky-800',
  trial: 'bg-violet-100 text-violet-800',
  active: 'bg-emerald-100 text-emerald-800',
  grace: 'bg-orange-100 text-orange-800',
  expired: 'bg-slate-200 text-slate-700',
  suspended: 'bg-rose-100 text-rose-800'
};
const CONTRACT_LABEL: Record<ContractStatus, string> = {
  draft: 'Draf', issued: 'Terbit', active: 'Aktif', grace: 'Tenggang', expired: 'Berakhir', canceled: 'Dibatalkan'
};
const CONTRACT_CLASS: Record<ContractStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  issued: 'bg-sky-100 text-sky-800',
  active: 'bg-emerald-100 text-emerald-800',
  grace: 'bg-orange-100 text-orange-800',
  expired: 'bg-slate-200 text-slate-700',
  canceled: 'bg-rose-100 text-rose-800'
};
const INVOICE_LABEL: Record<InstitutionInvoiceStatus, string> = { draft: 'Draf', issued: 'Terbit', paid: 'Lunas', overdue: 'Lewat jatuh tempo', void: 'Batal' };
const INVOICE_CLASS: Record<InstitutionInvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  issued: 'bg-sky-100 text-sky-800',
  paid: 'bg-emerald-100 text-emerald-800',
  overdue: 'bg-rose-100 text-rose-800',
  void: 'bg-slate-200 text-slate-600'
};
const ORG_LABEL: Record<InstitutionOrgType, string> = {
  university: 'Perguruan tinggi', school: 'Sekolah', library: 'Perpustakaan', government: 'Pemerintah', firm: 'Firma / kantor profesional',
  company: 'Perusahaan', research: 'Lembaga penelitian', nonprofit: 'Nirlaba', training_center: 'Lembaga pelatihan'
};
const INQUIRY_TYPE_MAP: Record<string, InstitutionOrgType> = { university: 'university', library: 'library', government: 'government', company: 'company' };
const PAYMENT_LABEL: Record<string, string> = { transfer: 'Transfer bank', va: 'Virtual Account', midtrans: 'Midtrans', other: 'Lainnya' };
const FOUNDING_REASON: Record<string, string> = {
  not_first_year: 'Founding hanya untuk tahun pertama institusi.',
  founding_full: 'Kuota Founding sudah penuh.',
  suspended: 'Institusi ditangguhkan.'
};
const EVENT_LABEL: Record<string, string> = {
  institution_created: 'Institusi dibuat',
  institution_updated: 'Profil diubah',
  contract_created: 'Kontrak draf dibuat',
  contract_canceled: 'Kontrak dibatalkan',
  contract_activated: 'Kontrak aktif',
  contract_superseded: 'Kontrak diganti kontrak baru',
  trial_started: 'Trial dimulai',
  trial_superseded: 'Trial diganti kontrak berbayar',
  invoice_issued: 'Invoice terbit',
  invoice_sent: 'Email invoice dikirim ulang',
  invoice_paid: 'Invoice lunas',
  invoice_void: 'Invoice dibatalkan',
  invoice_reminder: 'Pengingat jatuh tempo',
  invoice_overdue: 'Invoice lewat jatuh tempo',
  proof_uploaded: 'Bukti pembayaran diunggah',
  midtrans_link_created: 'Tautan Midtrans dibuat',
  midtrans_refund: 'Refund Midtrans (tinjau manual)',
  payment_orphan: 'Pembayaran untuk invoice tidak terbuka (tinjau)',
  payment_needs_review: 'Pembayaran perlu ditinjau',
  renewal_draft_created: 'Draf perpanjangan dibuat',
  renewal_notice: 'Pemberitahuan perpanjangan',
  grace_started: 'Masa tenggang dimulai',
  contract_expired: 'Kontrak berakhir',
  admin_note: 'Catatan admin'
};
const CONFIG_FIELDS: Array<{ key: Exclude<keyof InstitutionConfig, 'catalogScale' | 'renewalNoticeDays'>; label: string; step?: string }> = [
  { key: 'ppnPct', label: 'PPN invoice (%)', step: '0.01' },
  { key: 'invoiceDueDays', label: 'Jatuh tempo invoice (hari)' },
  { key: 'graceDays', label: 'Masa tenggang (hari)' },
  { key: 'trialDays', label: 'Lama trial (hari)' },
  { key: 'renewalAdminNoticeDays', label: 'Email admin sebelum invoice perpanjangan (H-)' },
  { key: 'renewalInvoiceDays', label: 'Invoice perpanjangan terbit otomatis (H-)' },
  { key: 'renewalVoidDays', label: 'Void invoice perpanjangan belum dibayar (hari setelah berakhir)' },
  { key: 'ebaPct', label: 'EBA (% biaya dibayar)' },
  { key: 'ebaExpiryDays', label: 'Kredit EBA hangus (hari)' },
  { key: 'foundingCap', label: 'Kuota Founding (institusi)' },
  { key: 'foundingDiscountPct', label: 'Diskon Founding (%)' },
  { key: 'licensePriceMultiplier', label: 'Lisensi permanen = harga e-book ×', step: '0.01' },
  { key: 'licenseConcurrentUsers', label: 'Pengguna bersamaan per lisensi' }
];

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

const openBlob = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

// ---------------------------------------------------------------------------
// Komponen kecil
// ---------------------------------------------------------------------------
const Badge: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${className}`}>{children}</span>
);

const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h4>
      {action}
    </div>
    {children}
  </section>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <label className={`block text-[11px] font-semibold text-slate-700 ${className ?? ''}`}>
    <span className="mb-1 block">{label}</span>
    {children}
  </label>
);

const inputClass = 'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]';
const buttonClass = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
const primaryClass = 'inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-[#DFBF64] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

// ---------------------------------------------------------------------------
// Konfigurasi
// ---------------------------------------------------------------------------
const ConfigPanel: React.FC<{ config: InstitutionConfig; invalid: string[]; onSaved: (message: string) => void }> = ({ config, invalid, onSaved }) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [noticeDays, setNoticeDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues(Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, String(config[f.key])])));
    setNoticeDays(config.renewalNoticeDays.join(', '));
  }, [config]);

  const save = async () => {
    const patch: Partial<InstitutionConfig> = {};
    for (const f of CONFIG_FIELDS) {
      if (values[f.key] !== String(config[f.key])) (patch as Record<string, unknown>)[f.key] = Number(values[f.key]);
    }
    const days = noticeDays.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (days.join(',') !== config.renewalNoticeDays.join(',')) patch.renewalNoticeDays = days;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await updateInstitutionConfig(patch);
      onSaved(res.note);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-700">Konfigurasi program institusi</summary>
      <p className="mt-2 text-[11px] text-slate-500">
        Berlaku untuk kontrak dan invoice yang dibuat setelah disimpan. Harga kontrak yang sudah dibuat dikunci.
        Skala katalog: {config.catalogScale.map((b) => `≥${b.minTitles} judul → ${b.pct}%`).join(' · ')}.
      </p>
      {invalid.length > 0 && <p className="mt-2 text-[11px] text-rose-700">Nilai tidak valid di database (memakai bawaan): {invalid.join(', ')}.</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CONFIG_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input type="number" step={f.step ?? '1'} min={0} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={inputClass} />
          </Field>
        ))}
        <Field label="Pemberitahuan perpanjangan (hari sebelum akhir)">
          <input value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      <button type="button" onClick={() => void save()} disabled={busy} className={`${primaryClass} mt-3`}>
        <Save className="h-3.5 w-3.5" /> Simpan konfigurasi
      </button>
    </details>
  );
};

// ---------------------------------------------------------------------------
// Institusi baru (opsional dari permintaan penawaran fase 1)
// ---------------------------------------------------------------------------
const CreateInstitutionModal: React.FC<{ onClose: () => void; onCreated: (institution: AdminInstitution) => void }> = ({ onClose, onCreated }) => {
  const [inquiries, setInquiries] = useState<InstitutionInquiry[]>([]);
  const [inquiryId, setInquiryId] = useState('');
  const [form, setForm] = useState({ name: '', type: '' as '' | InstitutionOrgType, contactName: '', contactEmail: '', contactPhone: '', emailDomains: '', language: 'id' as 'id' | 'en' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInquiriesForConversion().then(setInquiries).catch(() => setInquiries([]));
  }, []);

  const pickInquiry = (id: string) => {
    setInquiryId(id);
    const q = inquiries.find((x) => x.id === id);
    if (!q) return;
    setForm({
      name: q.institutionName,
      type: INQUIRY_TYPE_MAP[q.institutionType] ?? '',
      contactName: q.contactName ?? '',
      contactEmail: q.email,
      contactPhone: q.phone ?? '',
      emailDomains: q.email.includes('@') ? q.email.split('@')[1].toLowerCase() : '',
      language: q.language === 'id' ? 'id' : 'en'
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.type) {
      setError('Pilih jenis institusi.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createInstitution({
        ...(inquiryId ? { inquiryId } : {}),
        name: form.name,
        type: form.type,
        contactName: form.contactName || null,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
        emailDomains: form.emailDomains.split(/[\s,;]+/).filter(Boolean),
        language: form.language
      });
      onCreated(res.institution);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/70 p-4">
      <form onSubmit={submit} className="my-8 w-full max-w-xl space-y-3 rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Institusi baru (prospek)</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 cursor-pointer" aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>
        <Field label="Dari permintaan penawaran (opsional)">
          <select value={inquiryId} onChange={(e) => pickInquiry(e.target.value)} className={inputClass}>
            <option value="">— Isi manual —</option>
            {inquiries.map((q) => (
              <option key={q.id} value={q.id}>{q.institutionName} · {q.email} · {dateOnly(q.createdAt)}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nama institusi" className="sm:col-span-2">
            <input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Jenis">
            <select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as InstitutionOrgType })} className={inputClass}>
              <option value="">— Pilih —</option>
              {ORG_TYPES.map((t) => <option key={t} value={t}>{ORG_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Bahasa invoice & email">
            <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as 'id' | 'en' })} className={inputClass}>
              <option value="id">Indonesia (formal)</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="Nama kontak"><input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={inputClass} /></Field>
          <Field label="Email kontak (penerima invoice)"><input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className={inputClass} /></Field>
          <Field label="Telepon"><input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className={inputClass} /></Field>
          <Field label="Domain email (gabung otomatis)"><input placeholder="ui.ac.id" value={form.emailDomains} onChange={(e) => setForm({ ...form, emailDomains: e.target.value })} className={inputClass} /></Field>
        </div>
        {error && <p className="text-xs text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass}>Batal</button>
          <button type="submit" disabled={busy} className={primaryClass}><Plus className="h-3.5 w-3.5" /> Simpan</button>
        </div>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Formulir kontrak: rincian perhitungan wajib dilihat sebelum menyimpan
// ---------------------------------------------------------------------------
const ContractForm: React.FC<{
  detail: InstitutionDetail;
  summary: InstitutionSummary;
  onCreated: (message: string) => void;
  onCancel: () => void;
}> = ({ detail, summary, onCreated, onCancel }) => {
  const [tier, setTier] = useState<InstitutionTierCode>('starter');
  const [founding, setFounding] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [enterprise, setEnterprise] = useState({ concurrentUsers: '', adminSeats: '', fullPrice: '', catalogScalePct: '' });
  const [scope, setScope] = useState<'full' | 'custom'>('full');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<{ key: string; data: ContractPreview } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (scope === 'custom' && !catalog) getInstitutionCatalog().then((res) => setCatalog(res.products)).catch((err) => setError(errorText(err)));
  }, [scope, catalog]);

  const input: ContractInput = useMemo(() => ({
    tier,
    founding,
    ...(periodStart ? { periodStart } : {}),
    ...(tier === 'enterprise' ? {
      concurrentUsers: Number(enterprise.concurrentUsers),
      adminSeats: Number(enterprise.adminSeats),
      fullPrice: Number(enterprise.fullPrice),
      ...(enterprise.catalogScalePct ? { catalogScalePct: Number(enterprise.catalogScalePct) } : {})
    } : {}),
    collectionScope: scope,
    productIds: scope === 'custom' ? [...selected].sort() : [],
    ...(notes.trim() ? { notes: notes.trim() } : {})
  }), [tier, founding, periodStart, enterprise, scope, selected, notes]);
  const inputKey = JSON.stringify(input);

  const byCategory = useMemo(() => {
    const groups = new Map<string, CatalogProduct[]>();
    for (const p of catalog ?? []) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
    return [...groups.entries()];
  }, [catalog]);

  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setSelected(next);
  };

  const calculate = async () => {
    setBusy(true);
    setError(null);
    try {
      setPreview({ key: inputKey, data: await previewInstitutionContract(detail.institution.id, input) });
    } catch (err) {
      setPreview(null);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await createInstitutionContract(detail.institution.id, input);
      onCreated(`Kontrak draf ${res.quote.tierName} dibuat: ${rupiah(res.quote.contractedPrice)}. Terbitkan invoice dari tabel kontrak.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const q = preview?.data.quote;
  const fresh = preview?.key === inputKey;
  const foundingBlocked = detail.founding.eligible === false;

  return (
    <div className="space-y-3 rounded-xl border border-[#DFBF64]/60 bg-amber-50/40 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Tier">
          <select value={tier} onChange={(e) => setTier(e.target.value as InstitutionTierCode)} className={inputClass}>
            {summary.tiers.map((t) => (
              <option key={t.tier} value={t.tier}>
                {t.name}{t.concurrentUsers ? ` · ${t.concurrentUsers} bersamaan · ${rupiah(t.fullPrice ?? 0)}` : ' · penawaran khusus'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mulai periode (kosong = otomatis)">
          <input type="date" value={periodStart} min={todayWib().slice(0, 4) + '-01-01'} onChange={(e) => setPeriodStart(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Koleksi">
          <select value={scope} onChange={(e) => setScope(e.target.value as 'full' | 'custom')} className={inputClass}>
            <option value="full">Seluruh Digital Reading Shelf</option>
            <option value="custom">Custom per judul</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 pt-5 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={founding} disabled={foundingBlocked} onChange={(e) => setFounding(e.target.checked)} />
          Founding {summary.config.foundingDiscountPct}% (sisa {detail.founding.remaining}/{detail.founding.cap})
        </label>
      </div>
      {foundingBlocked && detail.founding.reason && <p className="text-[11px] text-slate-500">{FOUNDING_REASON[detail.founding.reason]}</p>}
      {tier === 'enterprise' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Pengguna bersamaan"><input type="number" min={1} value={enterprise.concurrentUsers} onChange={(e) => setEnterprise({ ...enterprise, concurrentUsers: e.target.value })} className={inputClass} /></Field>
          <Field label="Kursi admin"><input type="number" min={1} value={enterprise.adminSeats} onChange={(e) => setEnterprise({ ...enterprise, adminSeats: e.target.value })} className={inputClass} /></Field>
          <Field label="Harga penuh tahunan (Rp)"><input type="number" min={1} value={enterprise.fullPrice} onChange={(e) => setEnterprise({ ...enterprise, fullPrice: e.target.value })} className={inputClass} /></Field>
          <Field label="Skala katalog (kosong = otomatis)">
            <select value={enterprise.catalogScalePct} onChange={(e) => setEnterprise({ ...enterprise, catalogScalePct: e.target.value })} className={inputClass}>
              <option value="">Otomatis ({summary.catalog.scalePct}%)</option>
              {[40, 60, 80, 100].map((p) => <option key={p} value={p}>{p}%</option>)}
            </select>
          </Field>
        </div>
      )}
      {scope === 'custom' && (
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
          {!catalog && <p className="text-xs text-slate-500">Memuat judul di rak…</p>}
          {catalog?.length === 0 && <p className="text-xs text-slate-500">Belum ada judul di Digital Reading Shelf.</p>}
          {byCategory.map(([category, products]) => {
            const ids = products.map((p) => p.id);
            const all = ids.every((id) => selected.has(id));
            return (
              <div key={category}>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <input type="checkbox" checked={all} onChange={(e) => toggle(ids, e.target.checked)} /> {category} — pilih semua ({products.length})
                </label>
                <div className="ml-5 mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-[11px] text-slate-700">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={(e) => toggle([p.id], e.target.checked)} />
                      {p.title} <span className="text-slate-400">({p.format === 'ebook' ? 'e-book' : 'audiobook'})</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-500">{selected.size} produk dipilih.</p>
        </div>
      )}
      <Field label="Catatan internal"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>

      {q && (
        <div className={`rounded-lg border bg-white p-3 text-xs ${fresh ? 'border-slate-200' : 'border-amber-300 opacity-60'}`}>
          <div className="mb-2 font-bold text-slate-800">Rincian perhitungan{!fresh && ' (isian berubah — hitung ulang)'}</div>
          <table className="w-full">
            <tbody>
              <tr><td className="py-0.5 text-slate-600">Harga penuh {q.tierName} ({q.concurrentUsers} bersamaan, {q.adminSeats} admin)</td><td className="text-right font-mono">{rupiah(q.fullPrice)}</td></tr>
              <tr><td className="py-0.5 text-slate-600">× skala katalog {q.catalogScalePct}% ({q.catalogTitleCount} judul di rak hari ini)</td><td className="text-right font-mono">{rupiah(q.scaledPrice)}</td></tr>
              {q.foundingDiscountPct > 0 && <tr><td className="py-0.5 text-slate-600">− diskon Founding {q.foundingDiscountPct}%</td><td className="text-right font-mono">−{rupiah(q.foundingDiscountAmount)}</td></tr>}
              <tr className="border-t border-slate-200 font-bold"><td className="py-1">Harga kontrak (dikunci)</td><td className="text-right font-mono">{rupiah(q.contractedPrice)}</td></tr>
              <tr><td className="py-0.5 text-slate-600">PPN {q.ppnPct}% pada invoice</td><td className="text-right font-mono">{rupiah(q.taxAmount)}</td></tr>
              <tr className="font-bold"><td className="py-0.5">Total invoice</td><td className="text-right font-mono">{rupiah(q.total)}</td></tr>
              <tr><td className="py-0.5 text-slate-600">Kredit EBA {q.ebaPct}% di akhir periode</td><td className="text-right font-mono">{rupiah(q.ebaCredit)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">
            Periode {dateOnly(preview.data.periodStart)} – {dateOnly(preview.data.periodEnd)}, tenggang {preview.data.graceDays} hari, jatuh tempo invoice {preview.data.invoiceDueDays} hari.
          </p>
          {preview.data.warnings.map((w) => <p key={w} className="mt-1 text-[11px] text-amber-800">{w}</p>)}
        </div>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass}>Tutup</button>
        <button type="button" onClick={() => void calculate()} disabled={busy} className={buttonClass}><RefreshCw className="h-3.5 w-3.5" /> Hitung rincian</button>
        <button type="button" onClick={() => void save()} disabled={busy || !fresh} className={primaryClass} title={fresh ? '' : 'Hitung rincian terlebih dahulu'}>
          <Save className="h-3.5 w-3.5" /> Simpan draf kontrak
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Baris invoice: unduh, tautan, kirim ulang, Midtrans, bukti, lunas, batal
// ---------------------------------------------------------------------------
const InvoiceRow: React.FC<{
  invoice: AdminInstitutionInvoice;
  paymentAvailable: boolean;
  run: (label: string, action: () => Promise<string | void>) => Promise<void>;
  busy: string | null;
}> = ({ invoice, paymentAvailable, run, busy }) => {
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState({ method: 'transfer' as ManualPaymentMethod, paidDate: todayWib(), reference: '', note: '' });
  const open = invoice.status === 'issued' || invoice.status === 'overdue';
  const key = (label: string) => `${label}:${invoice.id}`;

  return (
    <>
      <tr className="border-t border-slate-100 align-top">
        <td className="py-2 pr-3 font-mono text-[11px] font-semibold">{invoice.number}</td>
        <td className="py-2 pr-3"><Badge className={INVOICE_CLASS[invoice.status]}>{INVOICE_LABEL[invoice.status]}</Badge></td>
        <td className="py-2 pr-3 text-right font-mono">{rupiah(invoice.total)}{invoice.taxAmount > 0 && <div className="text-[10px] text-slate-500">PPN {invoice.taxPct}%</div>}</td>
        <td className="py-2 pr-3 text-[11px]">{dateOnly(invoice.issuedAt)}<div className="text-slate-500">jatuh tempo {dateOnly(invoice.dueAt)}</div></td>
        <td className="py-2 pr-3 text-[11px]">
          {invoice.paidAt ? <>{dateOnly(invoice.paidAt)}<div className="text-slate-500">{PAYMENT_LABEL[invoice.paymentMethod ?? ''] ?? '—'} {invoice.paymentReference ?? ''}</div></> : '—'}
        </td>
        <td className="py-2">
          <div className="flex flex-wrap gap-1">
            <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void run(key('pdf'), async () => { saveBlob(await downloadInstitutionInvoicePdf(invoice.id), `${invoice.number}.pdf`); })}>
              <Download className="h-3 w-3" /> PDF
            </button>
            {invoice.status !== 'void' && (
              <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void run(key('link'), async () => {
                const { url } = await getInstitutionInvoiceLink(invoice.id);
                await navigator.clipboard?.writeText(url);
                return 'Tautan unduh invoice (berlaku 180 hari) disalin.';
              })}>
                <Link2 className="h-3 w-3" /> Salin tautan
              </button>
            )}
            {open && (
              <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void run(key('send'), async () => {
                const { sentTo } = await sendInstitutionInvoice(invoice.id);
                return `Email invoice dikirim ke ${sentTo.join(', ')}.`;
              })}>
                <Mail className="h-3 w-3" /> Kirim ulang
              </button>
            )}
            {open && paymentAvailable && (
              <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void run(key('midtrans'), async () => {
                const res = await createInstitutionPaymentLink(invoice.id);
                if (res.paymentUrl) await navigator.clipboard?.writeText(res.paymentUrl);
                return 'Tautan Virtual Account Midtrans dibuat, disalin, dan dimuat di PDF invoice.';
              })}>
                VA Midtrans
              </button>
            )}
            {invoice.status !== 'void' && (
              <label className={`${buttonClass} ${busy !== null ? 'pointer-events-none opacity-50' : ''}`}>
                <Upload className="h-3 w-3" /> {invoice.hasProof ? 'Ganti bukti' : 'Unggah bukti'}
                <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void run(key('proof'), async () => { await uploadInstitutionInvoiceProof(invoice.id, file); return 'Bukti pembayaran diunggah.'; });
                }} />
              </label>
            )}
            {invoice.hasProof && (
              <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void run(key('viewproof'), async () => { openBlob(await openInstitutionInvoiceProof(invoice.id)); })}>
                <FileText className="h-3 w-3" /> Lihat bukti
              </button>
            )}
            {open && (
              <button type="button" className={primaryClass} disabled={busy !== null || !invoice.hasProof} title={invoice.hasProof ? '' : 'Unggah bukti pembayaran dulu'} onClick={() => setPaying(!paying)}>
                Tandai lunas
              </button>
            )}
            {open && (
              <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => {
                const reason = window.prompt(`Batalkan invoice ${invoice.number}? Kontraknya kembali ke draf. Alasan:`);
                if (reason !== null) void run(key('void'), async () => { await voidInstitutionInvoice(invoice.id, reason || undefined); return `Invoice ${invoice.number} dibatalkan.`; });
              }}>
                Batalkan
              </button>
            )}
          </div>
          {invoice.snapRedirectUrl && open && <div className="mt-1 break-all text-[10px] text-slate-500">VA: {invoice.snapRedirectUrl}</div>}
        </td>
      </tr>
      {paying && open && (
        <tr>
          <td colSpan={6} className="pb-3">
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 sm:grid-cols-5">
              <Field label="Metode">
                <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as ManualPaymentMethod })} className={inputClass}>
                  <option value="transfer">Transfer bank</option>
                  <option value="va">Virtual Account</option>
                  <option value="other">Lainnya</option>
                </select>
              </Field>
              <Field label="Tanggal bayar"><input type="date" max={todayWib()} value={pay.paidDate} onChange={(e) => setPay({ ...pay, paidDate: e.target.value })} className={inputClass} /></Field>
              <Field label="Referensi transfer"><input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} className={inputClass} /></Field>
              <Field label="Catatan"><input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} className={inputClass} /></Field>
              <div className="flex items-end">
                <button type="button" className={primaryClass} disabled={busy !== null} onClick={() => {
                  if (!window.confirm(`Tandai ${invoice.number} lunas sebesar ${rupiah(invoice.total)}? Kontrak aktif dan anggota mendapat akses.`)) return;
                  void run(key('paid'), async () => {
                    const res = await markInstitutionInvoicePaid(invoice.id, {
                      method: pay.method,
                      paidDate: pay.paidDate || undefined,
                      reference: pay.reference.trim() || undefined,
                      note: pay.note.trim() || undefined
                    });
                    setPaying(false);
                    return res.contract?.status === 'issued'
                      ? 'Lunas. Kontrak perpanjangan aktif otomatis saat periodenya dimulai.'
                      : 'Lunas. Kontrak dan institusi aktif; anggota aktif mendapat akses.';
                  });
                }}>
                  Konfirmasi lunas
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Detail institusi
// ---------------------------------------------------------------------------
const PROFILE_KEYS = ['name', 'type', 'slug', 'contactName', 'contactEmail', 'contactPhone', 'address', 'npwp', 'emailDomains', 'language', 'accountManager', 'notes'] as const;
type ProfileKey = (typeof PROFILE_KEYS)[number];
const profileOf = (i: AdminInstitution): Record<ProfileKey, string> => ({
  name: i.name,
  type: i.type,
  slug: i.slug,
  contactName: i.contactName ?? '',
  contactEmail: i.contactEmail ?? '',
  contactPhone: i.contactPhone ?? '',
  address: i.address ?? '',
  npwp: i.npwp ?? '',
  emailDomains: i.emailDomains.join(', '),
  language: i.language,
  accountManager: i.accountManager ?? '',
  notes: i.notes ?? ''
});

const InstitutionDetailPanel: React.FC<{
  institutionId: string;
  summary: InstitutionSummary;
  onChanged: () => void;
  flash: (message: string) => void;
}> = ({ institutionId, summary, onChanged, flash }) => {
  const [detail, setDetail] = useState<InstitutionDetail | null>(null);
  const [profile, setProfile] = useState<Record<ProfileKey, string> | null>(null);
  const [showContract, setShowContract] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const next = await getInstitutionDetail(institutionId);
    setDetail(next);
    setProfile(profileOf(next.institution));
  }, [institutionId]);

  useEffect(() => {
    setDetail(null);
    setShowContract(false);
    setError(null);
    reload().catch((err) => setError(errorText(err)));
  }, [reload]);

  const run = useCallback(async (label: string, action: () => Promise<string | void>) => {
    setBusy(label);
    setError(null);
    try {
      const message = await action();
      if (message) flash(message);
      await reload();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }, [flash, onChanged, reload]);

  if (!detail || !profile) {
    return <Section title="Detail institusi">{error ? <p className="text-xs text-rose-700">{error}</p> : <p className="text-xs text-slate-500">Memuat…</p>}</Section>;
  }
  const { institution } = detail;
  const original = profileOf(institution);
  const changed = PROFILE_KEYS.filter((k) => profile[k] !== original[k]);
  const hasOpenContract = detail.contracts.some((c) => c.status === 'draft' || c.status === 'issued');

  const saveProfile = () => run('profile', async () => {
    const patch: Record<string, unknown> = {};
    for (const k of changed) patch[k] = k === 'emailDomains' ? profile[k].split(/[\s,;]+/).filter(Boolean) : profile[k] || null;
    await updateInstitution(institution.id, patch as Partial<AdminInstitution>);
    return 'Profil institusi disimpan.';
  });

  return (
    <div className="space-y-4">
      <Section
        title={institution.name}
        action={<div className="flex items-center gap-2"><Badge className={STATUS_CLASS[institution.status]}>{STATUS_LABEL[institution.status]}</Badge><span className="text-[11px] text-slate-500">/{institution.slug}</span></div>}
      >
        <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600 sm:grid-cols-4">
          <div>Anggota aktif: <strong>{detail.members.active}</strong></div>
          <div>Undangan tertunda: <strong>{detail.members.invited}</strong></div>
          <div>Admin institusi: <strong>{detail.members.admins}</strong></div>
          <div>Nonaktif: <strong>{detail.members.disabled}</strong></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nama"><input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className={inputClass} /></Field>
          <Field label="Jenis">
            <select value={profile.type} onChange={(e) => setProfile({ ...profile, type: e.target.value })} className={inputClass}>
              {ORG_TYPES.map((t) => <option key={t} value={t}>{ORG_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Slug (/institutions/join/…)"><input value={profile.slug} onChange={(e) => setProfile({ ...profile, slug: e.target.value })} className={inputClass} /></Field>
          <Field label="Nama kontak"><input value={profile.contactName} onChange={(e) => setProfile({ ...profile, contactName: e.target.value })} className={inputClass} /></Field>
          <Field label="Email kontak (penerima invoice)"><input type="email" value={profile.contactEmail} onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })} className={inputClass} /></Field>
          <Field label="Telepon"><input value={profile.contactPhone} onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })} className={inputClass} /></Field>
          <Field label="Alamat (di invoice)" className="sm:col-span-2"><input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className={inputClass} /></Field>
          <Field label="NPWP institusi"><input value={profile.npwp} onChange={(e) => setProfile({ ...profile, npwp: e.target.value })} className={inputClass} /></Field>
          <Field label="Domain email"><input value={profile.emailDomains} onChange={(e) => setProfile({ ...profile, emailDomains: e.target.value })} className={inputClass} /></Field>
          <Field label="Bahasa invoice & email">
            <select value={profile.language} onChange={(e) => setProfile({ ...profile, language: e.target.value })} className={inputClass}>
              <option value="id">Indonesia (formal)</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="Account manager"><input value={profile.accountManager} onChange={(e) => setProfile({ ...profile, accountManager: e.target.value })} className={inputClass} /></Field>
          <Field label="Catatan internal" className="sm:col-span-2 lg:col-span-3"><textarea rows={2} value={profile.notes} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} className={inputClass} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={primaryClass} disabled={changed.length === 0 || busy !== null} onClick={() => void saveProfile()}><Save className="h-3.5 w-3.5" /> Simpan profil</button>
          {!hasOpenContract && institution.status !== 'suspended' && (
            <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => setShowContract(true)}><Plus className="h-3.5 w-3.5" /> Kontrak baru</button>
          )}
          {detail.trialAvailable && (
            <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => {
              if (window.confirm(`Mulai trial gratis ${summary.config.trialDays} hari (Starter, tanpa EBA) untuk ${institution.name}? Trial hanya sekali per institusi.`)) {
                void run('trial', async () => { await createInstitutionTrial(institution.id); return 'Trial dimulai; anggota aktif mendapat akses.'; });
              }
            }}>
              <Play className="h-3.5 w-3.5" /> Mulai trial {summary.config.trialDays} hari
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      </Section>

      {showContract && (
        <ContractForm
          detail={detail}
          summary={summary}
          onCancel={() => setShowContract(false)}
          onCreated={(message) => {
            setShowContract(false);
            void run('contract', async () => message);
          }}
        />
      )}

      <Section title="Kontrak">
        {detail.contracts.length === 0 ? <p className="text-xs text-slate-500">Belum ada kontrak.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="pb-1 pr-3">Tier</th><th className="pb-1 pr-3">Status</th><th className="pb-1 pr-3">Periode</th><th className="pb-1 pr-3 text-right">Harga</th><th className="pb-1 pr-3">Rincian</th><th className="pb-1">Aksi</th></tr>
              </thead>
              <tbody>
                {detail.contracts.map((c: AdminContract) => (
                  <tr key={c.id} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-3 font-semibold">{summary.tiers.find((t) => t.tier === c.tier)?.name ?? c.tier}{c.isTrial && <Badge className="ml-1 bg-violet-100 text-violet-800">trial</Badge>}</td>
                    <td className="py-2 pr-3">
                      <Badge className={CONTRACT_CLASS[c.status]}>{CONTRACT_LABEL[c.status]}</Badge>
                      {c.status === 'issued' && <div className="mt-0.5 text-[10px] text-slate-500">{c.paid ? 'lunas, menunggu mulai' : 'menunggu pembayaran'}</div>}
                    </td>
                    <td className="py-2 pr-3 text-[11px]">{dateOnly(c.periodStart)} – {dateOnly(c.periodEnd)}<div className="text-slate-500">akses s.d. {dateOnly(c.accessEndsAt)}</div></td>
                    <td className="py-2 pr-3 text-right font-mono">{rupiah(c.contractedPrice)}</td>
                    <td className="py-2 pr-3 text-[11px] text-slate-600">
                      {c.concurrentUsers} bersamaan · skala {c.catalogScalePct}% ({c.catalogTitleCountAtSigning} judul)
                      {c.foundingDiscountPct > 0 && ` · Founding ${c.foundingDiscountPct}%`}
                      {c.ebaCredit > 0 && ` · EBA ${rupiah(c.ebaCredit)}`}
                      {c.collectionScope === 'custom' && ` · koleksi custom (${c.collectionSize ?? 0} produk)`}
                      {c.createdBy === 'system:renewal' && (
                        <div className="text-amber-700">Perpanjangan otomatis: invoice terbit H-{summary.config.renewalInvoiceDays}</div>
                      )}
                      {c.renewal && (
                        <div className={c.renewal.state === 'declined' ? 'font-semibold text-rose-700' : 'text-slate-500'}>
                          Perpanjangan: {({ declined: 'tidak diperpanjang', draft: 'draf (invoice otomatis)', issued: 'invoice terbit', paid: 'lunas, menunggu mulai', active: 'aktif', grace: 'tenggang', expired: 'berakhir' } as Record<string, string>)[c.renewal.state]}
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.status === 'draft' && !c.isTrial && (
                          <button type="button" className={primaryClass} disabled={busy !== null} onClick={() => {
                            if (window.confirm(`Terbitkan invoice ${rupiah(c.contractedPrice)} untuk kontrak ini?${sendEmail ? ' Email dikirim ke kontak & admin institusi.' : ''}`)) {
                              void run(`issue:${c.id}`, async () => {
                                const res = await issueInstitutionContract(c.id, sendEmail);
                                return `Invoice ${res.invoice.number} terbit${sendEmail ? ' dan email dikirim' : ''}.`;
                              });
                            }
                          }}>
                            <FileText className="h-3 w-3" /> Terbitkan invoice
                          </button>
                        )}
                        {(c.status === 'active' || c.status === 'grace') && !c.isTrial && c.renewal?.state !== 'declined' && c.renewal?.state !== 'paid' && (
                          <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => {
                            const reason = window.prompt(`Tandai ${institution.name} tidak diperpanjang? Draf/invoice perpanjangan yang belum dibayar dibatalkan dan tidak ada invoice otomatis. Untuk membatalkan keputusan ini, buat kontrak baru. Alasan:`);
                            if (reason !== null) void run(`decline:${c.id}`, async () => { await declineInstitutionRenewal(c.id, reason || undefined); return 'Ditandai tidak diperpanjang.'; });
                          }}>
                            Tidak diperpanjang
                          </button>
                        )}
                        {(c.status === 'draft' || (c.status === 'issued' && !c.paid)) && (
                          <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => {
                            const reason = window.prompt('Batalkan kontrak ini? Invoice yang belum dibayar ikut dibatalkan. Alasan:');
                            if (reason !== null) void run(`cancel:${c.id}`, async () => { await cancelInstitutionContract(c.id, reason || undefined); return 'Kontrak dibatalkan.'; });
                          }}>
                            Batalkan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Kirim email invoice saat diterbitkan
        </label>
      </Section>

      <Section title="Invoice">
        {detail.invoices.length === 0 ? <p className="text-xs text-slate-500">Belum ada invoice.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="pb-1 pr-3">Nomor</th><th className="pb-1 pr-3">Status</th><th className="pb-1 pr-3 text-right">Total</th><th className="pb-1 pr-3">Terbit</th><th className="pb-1 pr-3">Dibayar</th><th className="pb-1">Aksi</th></tr>
              </thead>
              <tbody>
                {detail.invoices.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} paymentAvailable={summary.paymentAvailable} run={run} busy={busy} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <InstitutionMembersSection
        institutionId={institutionId}
        flash={flash}
        onChanged={() => {
          reload().catch((err) => setError(errorText(err)));
          onChanged();
        }}
      />

      <Section title="Riwayat">
        {detail.events.length === 0 ? <p className="text-xs text-slate-500">Belum ada riwayat.</p> : (
          <ul className="space-y-1 text-[11px] text-slate-600">
            {detail.events.slice(0, 30).map((e) => (
              <li key={e.id}><span className="text-slate-400">{dateTime(e.createdAt)}</span> — {EVENT_LABEL[e.type] ?? e.type}{typeof e.meta.number === 'string' ? ` ${e.meta.number}` : ''}</li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab utama
// ---------------------------------------------------------------------------
export const InstitutionAdminTab: React.FC = () => {
  const [summary, setSummary] = useState<InstitutionSummary | null>(null);
  const [rows, setRows] = useState<InstitutionListRow[]>([]);
  const [status, setStatus] = useState<'' | InstitutionStatus>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 5000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, list] = await Promise.all([getInstitutionSummary(), listInstitutions({ status: status || undefined, q: query })]);
      setSummary(s);
      setRows(list.institutions);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [status, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const runJob = async () => {
    try {
      const r = await runInstitutionJob();
      flash(`Job selesai: ${r.activated} diaktifkan, ${r.graceStarted} tenggang, ${r.expired} berakhir, ${r.renewalNotices} pemberitahuan perpanjangan, ${r.renewalAdminNotices} email admin, ${r.renewalInvoicesIssued} invoice perpanjangan terbit, ${r.renewalsVoided} perpanjangan di-void, ${r.invoiceReminders} pengingat, ${r.invoicesOverdue} lewat jatuh tempo${r.errors ? `, ${r.errors} galat` : ''}.`);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="space-y-4">
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</div>}
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Institusi aktif" value={summary.counts.active + summary.counts.grace} hint={`${summary.counts.trial} trial · ${summary.counts.prospect} prospek`} />
            <Stat
              label="Founding tersisa"
              value={`${summary.founding.remaining}/${summary.founding.cap}`}
              hint={`${summary.founding.paid} sudah membayar · ${summary.founding.reserved} direservasi (invoice terbit)`}
            />
            <Stat label="Judul di rak" value={summary.catalog.titles} hint={`skala harga saat ini ${summary.catalog.scalePct}%`} />
            <Stat label="Invoice terbuka" value={summary.openInvoices} hint={summary.overdueInvoices > 0 ? <span className="text-rose-700">{summary.overdueInvoices} lewat jatuh tempo</span> : 'tidak ada yang lewat jatuh tempo'} />
            <Stat label="PPN invoice" value={`${summary.config.ppnPct}%`} hint={`EBA ${summary.config.ebaPct}% · hangus ${summary.config.ebaExpiryDays} hari`} />
            <Stat label="Pembayaran" value={summary.paymentAvailable ? 'Transfer + VA' : 'Transfer'} hint={summary.paymentAvailable ? 'Midtrans aktif' : 'Midtrans belum dikonfigurasi'} />
          </div>
          {summary.bankAccounts.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Belum ada rekening aktif di database. Buka tab <strong>Pembayaran</strong>, periksa rekening, lalu simpan agar tersinkron ke server; invoice tidak bisa diterbitkan tanpa rekening.
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              Rekening di invoice (dari CMS): {summary.bankAccounts.map((b) => `${b.bankName} ${b.accountNumber}`).join(' · ')}. Tautan unduh di email memakai {summary.publicApiUrl}.
            </p>
          )}
          <ConfigPanel config={summary.config} invalid={summary.invalidConfig} onSaved={(message) => { flash(message); void load(); }} />
        </>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Section
          title={`Institusi (${rows.length})`}
          action={
            <div className="flex flex-wrap gap-1">
              <button type="button" className={buttonClass} onClick={() => void load()} disabled={loading}><RefreshCw className="h-3 w-3" /> Muat ulang</button>
              <button type="button" className={buttonClass} onClick={() => void runJob()}><Play className="h-3 w-3" /> Jalankan job</button>
              <button type="button" className={primaryClass} onClick={() => setShowCreate(true)}><Plus className="h-3 w-3" /> Institusi baru</button>
            </div>
          }
        >
          <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
            <select value={status} onChange={(e) => setStatus(e.target.value as '' | InstitutionStatus)} className={`${inputClass} w-auto`}>
              <option value="">Semua status</option>
              {INSTITUTION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, slug, email" className={`${inputClass} min-w-0 flex-1`} />
            <button type="submit" className={buttonClass}>Cari</button>
          </form>
          {loading && rows.length === 0 ? <p className="text-xs text-slate-500">Memuat…</p> : rows.length === 0 ? (
            <p className="text-xs text-slate-500">Belum ada institusi. Buat dari permintaan penawaran di tombol "Institusi baru".</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => {
                const running = row.runningContract;
                return (
                  <li key={row.institution.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.institution.id)}
                      className={`w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50 cursor-pointer ${selectedId === row.institution.id ? 'bg-amber-50' : ''}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-900">{row.institution.name}</span>
                        <Badge className={STATUS_CLASS[row.institution.status]}>{STATUS_LABEL[row.institution.status]}</Badge>
                        {row.openInvoice && <Badge className={INVOICE_CLASS[row.openInvoice.status]}>{row.openInvoice.number}</Badge>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {ORG_LABEL[row.institution.type]} · {row.members.active} anggota
                        {running ? ` · ${summary?.tiers.find((t) => t.tier === running.tier)?.name ?? running.tier} s.d. ${dateOnly(running.periodEnd)}` : ''}
                        {row.openContract && !row.openInvoice ? ' · draf kontrak' : ''}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <div>
          {selectedId && summary ? (
            <InstitutionDetailPanel institutionId={selectedId} summary={summary} onChanged={() => void load()} flash={flash} />
          ) : (
            <Section title="Detail institusi"><p className="text-xs text-slate-500">Pilih institusi di daftar untuk melihat kontrak, invoice, dan riwayat.</p></Section>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateInstitutionModal
          onClose={() => setShowCreate(false)}
          onCreated={(institution) => {
            setShowCreate(false);
            setSelectedId(institution.id);
            flash(`${institution.name} dibuat sebagai prospek.`);
            void load();
          }}
        />
      )}
    </div>
  );
};
