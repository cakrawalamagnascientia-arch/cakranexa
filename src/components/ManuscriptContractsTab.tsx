import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, Download, FileText, Link2, PenLine, Plus, RefreshCw, Unlink, Upload } from 'lucide-react';
import {
  ImportRejectedError,
  manuscriptAdminApi as api,
  type AuthorAccount,
  type AuthorLinkLog,
  type ContractDetail,
  type ContractView,
  type ImportPreview,
  type ManuscriptOptions,
  type ReminderItem,
  type TitleCostRow
} from '../services/manuscriptAdminApi';
import { toTitleCase } from '../utils/formatters';

/**
 * Tab admin "Kontrak Naskah" (fase 5R): kontrak jual putus, jadwal honor, addendum, dokumen di bucket privat,
 * pengingat, laporan biaya per judul, ekspor/impor CSV, dan akun login penulis.
 */

type View = 'contracts' | 'reminders' | 'report' | 'import' | 'authors';
type Notify = (text: string, tone?: 'ok' | 'error') => void;

const RIGHTS: Array<{ key: 'print' | 'ebook' | 'audiobook' | 'translation' | 'derivative'; label: string }> = [
  { key: 'print', label: 'Cetak' },
  { key: 'ebook', label: 'E-book' },
  { key: 'audiobook', label: 'Audiobook' },
  { key: 'translation', label: 'Terjemahan' },
  { key: 'derivative', label: 'Turunan' }
];
const STATUS_LABEL: Record<string, string> = { draft: 'Draf', signed: 'Ditandatangani', terminated: 'Diakhiri' };
const STATUS_TONE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  signed: 'bg-emerald-100 text-emerald-800',
  terminated: 'bg-rose-100 text-rose-800'
};

const input = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:border-slate-800';
const button = 'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50';
const primary = `${button} border-slate-900 bg-slate-900 text-[#DFBF64] hover:bg-slate-800`;
const secondary = `${button} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

const rupiah = (n: number | null | undefined) => (n === null || n === undefined ? '-' : `Rp${n.toLocaleString('id-ID')}`);
const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Terjadi kesalahan.');
const digits = (value: string) => Number(value.replace(/\D/g, '')) || 0;

const saveBlob = (data: Blob, filename: string) => {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const openFile = async (getUrl: () => Promise<string>, notify: Notify) => {
  const tab = window.open('', '_blank');
  try {
    const url = await getUrl();
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
  } catch (err) {
    tab?.close();
    notify(errorText(err), 'error');
  }
};

/** Tombol pilih file yang langsung mengunggah. */
const UploadButton: React.FC<{ label: string; onFile: (file: File) => Promise<void>; disabled?: boolean }> = ({ label, onFile, disabled }) => {
  const [busy, setBusy] = useState(false);
  return (
    <label className={`${secondary} cursor-pointer ${disabled || busy ? 'pointer-events-none opacity-50' : ''}`}>
      <Upload className="h-3 w-3" />{busy ? 'Mengunggah…' : label}
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            await onFile(file);
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
};

// ------------------------------------------------------------------ kontrak
const emptyForm = {
  contractNumber: '',
  authorId: '',
  bookId: '',
  signedAt: '',
  termYears: '25',
  honorTotal: '',
  revisionFeePerEdition: '0',
  notes: '',
  rights: { print: true, ebook: true, audiobook: true, translation: false, derivative: false } as Record<string, boolean>
};

const ContractForm: React.FC<{
  options: ManuscriptOptions;
  initial?: ContractDetail['contract'];
  onSaved: (contractId: string) => void;
  onCancel: () => void;
  notify: Notify;
}> = ({ options, initial, onSaved, onCancel, notify }) => {
  const [form, setForm] = useState(() => initial ? {
    contractNumber: initial.contractNumber,
    authorId: initial.authorId,
    bookId: initial.bookId ?? '',
    signedAt: initial.signedAt,
    termYears: String(initial.termYears),
    honorTotal: String(initial.honorTotal),
    revisionFeePerEdition: String(initial.revisionFeePerEdition),
    notes: initial.notes ?? '',
    rights: { ...initial.rights } as Record<string, boolean>
  } : emptyForm);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    const payload = {
      contractNumber: form.contractNumber,
      authorId: form.authorId,
      bookId: form.bookId || null,
      signedAt: form.signedAt,
      termYears: Number(form.termYears),
      honorTotal: digits(form.honorTotal),
      revisionFeePerEdition: digits(form.revisionFeePerEdition),
      notes: form.notes,
      rights: form.rights
    };
    try {
      const saved = initial ? await api.updateContract(initial.id, payload) : await api.createContract(payload);
      notify(initial ? 'Kontrak diperbarui.' : 'Kontrak draf dibuat. Tambahkan jadwal honor lalu tandatangani.');
      onSaved(saved.id);
    } catch (err) {
      notify(errorText(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4" data-manuscript-form>
      <p className="text-xs font-bold text-slate-800">{initial ? `Ubah kontrak draf ${initial.contractNumber}` : 'Kontrak jual putus baru'}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-slate-700">Nomor kontrak
          <input className={input} value={form.contractNumber} onChange={(e) => set({ contractNumber: e.target.value })} placeholder="SPK/2026/001" />
        </label>
        <label className="text-xs text-slate-700">Penulis
          <select className={input} value={form.authorId} onChange={(e) => set({ authorId: e.target.value })}>
            <option value="">— pilih penulis —</option>
            {options.authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-700">Judul buku
          <select className={input} value={form.bookId} onChange={(e) => set({ bookId: e.target.value })}>
            <option value="">Naskah belum masuk katalog</option>
            {options.books.map((b) => <option key={b.id} value={b.id}>{toTitleCase(b.title)}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-700">Tanggal kontrak
          <input type="date" className={input} value={form.signedAt} onChange={(e) => set({ signedAt: e.target.value })} />
        </label>
        <label className="text-xs text-slate-700">Jangka waktu (tahun, maks. 25)
          <input type="number" min={1} max={25} className={input} value={form.termYears} onChange={(e) => set({ termYears: e.target.value })} />
        </label>
        <label className="text-xs text-slate-700">Honor jual putus (Rp)
          <input inputMode="numeric" className={input} value={form.honorTotal} onChange={(e) => set({ honorTotal: e.target.value })} />
        </label>
        <label className="text-xs text-slate-700">Honor revisi per edisi (Rp, 0 = tidak diatur)
          <input inputMode="numeric" className={input} value={form.revisionFeePerEdition} onChange={(e) => set({ revisionFeePerEdition: e.target.value })} />
        </label>
        <fieldset className="text-xs text-slate-700 sm:col-span-2">
          <legend>Hak yang dialihkan</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {RIGHTS.map((r) => (
              <label key={r.key} className="flex items-center gap-1">
                <input type="checkbox" checked={Boolean(form.rights[r.key])} onChange={(e) => set({ rights: { ...form.rights, [r.key]: e.target.checked } })} />{r.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-xs text-slate-700 sm:col-span-2 lg:col-span-3">Catatan
          <textarea rows={2} className={input} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">Hak kembali ke penulis dihitung otomatis: tanggal kontrak + jangka waktu (UU 28/2014 Pasal 18).</p>
      <div className="flex gap-2">
        <button type="button" className={primary} disabled={saving} onClick={() => void save()}>{saving ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className={secondary} onClick={onCancel}>Batal</button>
      </div>
    </div>
  );
};

const PaymentForm: React.FC<{ contractId: string; onSaved: () => void; notify: Notify; revisionAllowed: boolean }> = ({ contractId, onSaved, notify, revisionAllowed }) => {
  const [form, setForm] = useState({ stage: '', kind: 'honor', edition: '2', amount: '', dueDate: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.addPayment(contractId, {
        stage: form.stage,
        kind: form.kind,
        edition: form.kind === 'revision' ? Number(form.edition) : null,
        amount: digits(form.amount),
        dueDate: form.dueDate
      });
      setForm({ stage: '', kind: 'honor', edition: '2', amount: '', dueDate: '' });
      notify('Tahap pembayaran ditambahkan.');
      onSaved();
    } catch (err) {
      notify(errorText(err), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-slate-300 p-2 sm:grid-cols-6" data-payment-form>
      <input className={`${input} col-span-2`} placeholder="Nama tahap, mis. Tahap 1 — penandatanganan" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} />
      <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
        <option value="honor">Honor</option>
        {revisionAllowed && <option value="revision">Honor revisi</option>}
      </select>
      {form.kind === 'revision'
        ? <input type="number" min={2} className={input} placeholder="Edisi" value={form.edition} onChange={(e) => setForm({ ...form, edition: e.target.value })} />
        : <span className="hidden sm:block" />}
      <input inputMode="numeric" className={input} placeholder="Jumlah (Rp)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      <input type="date" className={input} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
      <button type="button" className={`${primary} col-span-2 justify-center sm:col-span-6 sm:justify-self-start`} disabled={saving} onClick={() => void save()}>
        <Plus className="h-3 w-3" />Tambah tahap
      </button>
    </div>
  );
};

const AddendumForm: React.FC<{ detail: ContractDetail; onSaved: () => void; notify: Notify }> = ({ detail, onSaved, notify }) => {
  const eff = detail.effective;
  const [form, setForm] = useState({
    addendumNumber: '',
    signedAt: '',
    description: '',
    termYears: String(eff.termYears),
    honorTotal: String(eff.honorTotal),
    revisionFeePerEdition: String(eff.revisionFeePerEdition),
    rights: { ...eff.rights } as Record<string, boolean>
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.addAddendum(detail.contract.id, {
        addendumNumber: form.addendumNumber,
        signedAt: form.signedAt,
        description: form.description,
        termYears: Number(form.termYears),
        honorTotal: digits(form.honorTotal),
        revisionFeePerEdition: digits(form.revisionFeePerEdition),
        rights: form.rights
      });
      notify('Addendum dicatat. Nilai efektif kontrak diperbarui.');
      onSaved();
    } catch (err) {
      notify(errorText(err), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3" data-addendum-form>
      <p className="text-xs font-semibold text-slate-700">Addendum baru (isi nilai setelah perubahan; yang tidak berubah biarkan)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input className={input} placeholder="Nomor addendum" value={form.addendumNumber} onChange={(e) => setForm({ ...form, addendumNumber: e.target.value })} />
        <input type="date" className={input} value={form.signedAt} onChange={(e) => setForm({ ...form, signedAt: e.target.value })} />
        <label className="text-xs text-slate-700">Jangka waktu (tahun)
          <input type="number" min={1} max={25} className={input} value={form.termYears} onChange={(e) => setForm({ ...form, termYears: e.target.value })} />
        </label>
        <label className="text-xs text-slate-700">Honor jual putus (Rp)
          <input inputMode="numeric" className={input} value={form.honorTotal} onChange={(e) => setForm({ ...form, honorTotal: e.target.value })} />
        </label>
        <label className="text-xs text-slate-700">Honor revisi per edisi (Rp)
          <input inputMode="numeric" className={input} value={form.revisionFeePerEdition} onChange={(e) => setForm({ ...form, revisionFeePerEdition: e.target.value })} />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          {RIGHTS.map((r) => (
            <label key={r.key} className="flex items-center gap-1">
              <input type="checkbox" checked={Boolean(form.rights[r.key])} onChange={(e) => setForm({ ...form, rights: { ...form.rights, [r.key]: e.target.checked } })} />{r.label}
            </label>
          ))}
        </div>
        <textarea rows={2} className={`${input} sm:col-span-3`} placeholder="Uraian perubahan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <button type="button" className={primary} disabled={saving} onClick={() => void save()}>{saving ? 'Menyimpan…' : 'Simpan addendum'}</button>
    </div>
  );
};

const ContractDetailPanel: React.FC<{ contractId: string; options: ManuscriptOptions; onChanged: () => void; notify: Notify }> = ({ contractId, options, onChanged, notify }) => {
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingAddendum, setAddingAddendum] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await api.getContract(contractId));
    } catch (err) {
      notify(errorText(err), 'error');
    }
  }, [contractId, notify]);

  useEffect(() => {
    setDetail(null);
    setEditing(false);
    setAddingAddendum(false);
    void load();
  }, [load]);

  if (!detail) return <p className="text-xs text-slate-500">Memuat kontrak…</p>;
  const { contract, effective: eff, summary } = detail;
  const refresh = async () => {
    await load();
    onChanged();
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify(ok);
      await refresh();
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  if (editing) {
    return <ContractForm options={options} initial={contract} notify={notify} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void refresh(); }} />;
  }

  const changed = eff.addenda.length > 0;
  const terms: Array<[string, string, string]> = [
    ['Hak dialihkan', RIGHTS.filter((r) => contract.rights[r.key]).map((r) => r.label).join(', '), RIGHTS.filter((r) => eff.rights[r.key]).map((r) => r.label).join(', ')],
    ['Jangka waktu', `${contract.termYears} tahun`, `${eff.termYears} tahun`],
    ['Hak kembali', contract.rightsRevertAt, eff.rightsRevertAt],
    ['Honor jual putus', rupiah(contract.honorTotal), rupiah(eff.honorTotal)],
    ['Honor revisi per edisi', rupiah(contract.revisionFeePerEdition), rupiah(eff.revisionFeePerEdition)]
  ];

  return (
    <div className="space-y-4" data-contract-detail>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">{contract.contractNumber}
            <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_TONE[contract.status]}`}>{STATUS_LABEL[contract.status]}</span>
          </p>
          <p className="text-xs text-slate-600">{detail.authorName} · {toTitleCase(detail.bookTitle)} · kontrak {contract.signedAt}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {contract.status === 'draft' && <button type="button" className={secondary} onClick={() => setEditing(true)}><PenLine className="h-3 w-3" />Ubah</button>}
          {contract.status === 'draft' && (
            <button type="button" className={primary} onClick={() => void act(() => api.signContract(contract.id), 'Kontrak ditandatangani; syarat pokok kini terkunci.')}>Tandatangani</button>
          )}
          {contract.status !== 'terminated' && (
            <button
              type="button"
              className={`${button} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
              onClick={() => {
                const reason = window.prompt(`Akhiri kontrak ${contract.contractNumber}? Tulis alasannya:`);
                if (reason) void act(() => api.terminateContract(contract.id, reason), 'Kontrak diakhiri.');
              }}
            >Akhiri</button>
          )}
          {contract.contractFilePath && (
            <button type="button" className={secondary} onClick={() => void openFile(() => api.fileUrl('contract', contract.id), notify)}><FileText className="h-3 w-3" />Lihat kontrak</button>
          )}
          <UploadButton label={contract.contractFilePath ? 'Ganti file kontrak' : 'Unggah file kontrak'} onFile={(file) => act(() => api.uploadContractFile(contract.id, file), 'File kontrak diunggah.')} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr><th className="py-1 pr-2">Syarat</th><th className="py-1 pr-2">Kontrak induk</th><th className="py-1">Berlaku {changed ? `(setelah ${eff.addenda.join(', ')})` : ''}</th></tr>
          </thead>
          <tbody>
            {terms.map(([label, base, now]) => (
              <tr key={label} className="border-t border-slate-100">
                <td className="py-1 pr-2 text-slate-500">{label}</td>
                <td className="py-1 pr-2">{base}</td>
                <td className={`py-1 font-semibold ${base !== now ? 'text-amber-700' : ''}`}>{now}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {contract.notes && <p className="whitespace-pre-line rounded-md bg-slate-50 p-2 text-xs text-slate-600">{contract.notes}</p>}
      {contract.status === 'signed' && (
        <button
          type="button"
          className={secondary}
          onClick={() => {
            const notes = window.prompt('Catatan kontrak:', contract.notes ?? '');
            if (notes !== null) void act(() => api.updateContract(contract.id, { notes }), 'Catatan disimpan.');
          }}
        ><PenLine className="h-3 w-3" />Ubah catatan</button>
      )}

      <section className="space-y-2">
        <p className="text-xs font-bold text-slate-800">
          Jadwal honor · terjadwal {rupiah(summary.honorScheduled)} dari {rupiah(summary.honorTotal)} · dibayar {rupiah(summary.honorPaid)}
          {summary.honorUnscheduled > 0 && <span className="ml-1 text-amber-700">· belum dijadwalkan {rupiah(summary.honorUnscheduled)}</span>}
          {summary.overdueCount > 0 && <span className="ml-1 text-rose-700">· {summary.overdueCount} terlambat</span>}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-xs" data-payments-table>
            <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="py-1 pr-2">#</th><th className="py-1 pr-2">Tahap</th><th className="py-1 pr-2">Jumlah</th><th className="py-1 pr-2">Jatuh tempo</th><th className="py-1 pr-2">Dibayar</th><th className="py-1">Dokumen & aksi</th></tr>
            </thead>
            <tbody>
              {detail.payments.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-2">{p.sequence}</td>
                  <td className="py-1.5 pr-2">{p.stage}{p.kind === 'revision' && <span className="block text-[10px] text-slate-500">Honor revisi edisi {p.edition}</span>}</td>
                  <td className="py-1.5 pr-2 font-mono">{rupiah(p.amount)}</td>
                  <td className="py-1.5 pr-2">{p.dueDate}</td>
                  <td className="py-1.5 pr-2">{p.paidAt ? <span className="text-emerald-700">{p.paidAt}{p.paymentReference ? ` · ${p.paymentReference}` : ''}</span> : <span className="text-slate-400">Belum</span>}</td>
                  <td className="flex flex-wrap gap-1 py-1.5">
                    {!p.paidAt && contract.status === 'signed' && (
                      <button
                        type="button"
                        className={secondary}
                        onClick={() => {
                          const paidAt = window.prompt('Tanggal bayar (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
                          if (!paidAt) return;
                          const reference = window.prompt('Referensi mutasi (opsional, tanpa nomor rekening):', '') ?? '';
                          void act(() => api.markPaid(p.id, { paidAt, reference }), `${p.stage} ditandai dibayar.`);
                        }}
                      >Tandai dibayar</button>
                    )}
                    {p.paymentProofPath
                      ? <button type="button" className={secondary} onClick={() => void openFile(() => api.fileUrl('proof', p.id), notify)}>Bukti bayar</button>
                      : <UploadButton label="Bukti bayar" onFile={(file) => act(() => api.uploadPaymentFile(p.id, 'proof', file), 'Bukti bayar diunggah.')} />}
                    {p.taxSlipPath
                      ? <button type="button" className={secondary} onClick={() => void openFile(() => api.fileUrl('tax_slip', p.id), notify)}>Bukti potong</button>
                      : <UploadButton label="Bukti potong pajak" onFile={(file) => act(() => api.uploadPaymentFile(p.id, 'tax_slip', file), 'Bukti potong pajak diunggah.')} />}
                  </td>
                </tr>
              ))}
              {detail.payments.length === 0 && <tr><td colSpan={6} className="py-2 text-slate-400">Belum ada tahap pembayaran.</td></tr>}
            </tbody>
          </table>
        </div>
        {contract.status !== 'terminated' && (
          <PaymentForm contractId={contract.id} notify={notify} onSaved={() => void refresh()} revisionAllowed={eff.revisionFeePerEdition > 0} />
        )}
      </section>

      {contract.status !== 'draft' && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-800">Addendum ({detail.addenda.length})</p>
            {contract.status === 'signed' && (
              <button type="button" className={secondary} onClick={() => setAddingAddendum((v) => !v)}><Plus className="h-3 w-3" />Addendum</button>
            )}
          </div>
          {detail.addenda.map((a) => (
            <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-slate-200 p-2 text-xs">
              <div>
                <p className="font-semibold">{a.addendumNumber} · {a.signedAt}</p>
                <p className="text-slate-600">{a.description}</p>
                <p className="text-[11px] text-slate-500">
                  {[
                    ...RIGHTS.filter((r) => a.changes.rights[r.key] !== undefined).map((r) => `${r.label}: ${a.changes.rights[r.key] ? 'dialihkan' : 'tidak'}`),
                    a.changes.termYears !== null ? `Jangka waktu ${a.changes.termYears} tahun` : '',
                    a.changes.honorTotal !== null ? `Honor ${rupiah(a.changes.honorTotal)}` : '',
                    a.changes.revisionFeePerEdition !== null ? `Honor revisi ${rupiah(a.changes.revisionFeePerEdition)}` : ''
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              {a.filePath
                ? <button type="button" className={secondary} onClick={() => void openFile(() => api.fileUrl('addendum', a.id), notify)}><FileText className="h-3 w-3" />Lihat</button>
                : <UploadButton label="Unggah file" onFile={(file) => act(() => api.uploadAddendumFile(a.id, file), 'File addendum diunggah.')} />}
            </div>
          ))}
          {addingAddendum && <AddendumForm detail={detail} notify={notify} onSaved={() => { setAddingAddendum(false); void refresh(); }} />}
        </section>
      )}
    </div>
  );
};

const ContractsView: React.FC<{ options: ManuscriptOptions; notify: Notify }> = ({ options, notify }) => {
  const [contracts, setContracts] = useState<ContractView[] | null>(null);
  const [status, setStatus] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setContracts(await api.listContracts({ status: status as '', authorId }));
    } catch (err) {
      notify(errorText(err), 'error');
      setContracts([]);
    }
  }, [status, authorId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-700">Status
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua</option>
            <option value="draft">Draf</option>
            <option value="signed">Ditandatangani</option>
            <option value="terminated">Diakhiri</option>
          </select>
        </label>
        <label className="text-xs text-slate-700">Penulis
          <select className={input} value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
            <option value="">Semua</option>
            {options.authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <button type="button" className={primary} onClick={() => { setCreating(true); setSelected(null); }}><Plus className="h-3 w-3" />Kontrak baru</button>
      </div>

      {creating && (
        <ContractForm options={options} notify={notify} onCancel={() => setCreating(false)} onSaved={(id) => { setCreating(false); setSelected(id); void load(); }} />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[860px] text-xs" data-contracts-table>
          <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-2 py-2">Kontrak</th><th className="px-2 py-2">Penulis</th><th className="px-2 py-2">Judul</th><th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Honor berlaku</th><th className="px-2 py-2">Dibayar</th><th className="px-2 py-2">Jatuh tempo berikutnya</th><th className="px-2 py-2">Hak kembali</th>
            </tr>
          </thead>
          <tbody>
            {(contracts ?? []).map((c) => (
              <tr
                key={c.contract.id}
                onClick={() => { setSelected(c.contract.id); setCreating(false); }}
                className={`cursor-pointer border-t border-slate-100 hover:bg-amber-50/40 ${selected === c.contract.id ? 'bg-amber-50' : ''}`}
              >
                <td className="px-2 py-1.5 font-semibold">{c.contract.contractNumber}{c.effective.addenda.length > 0 && <span className="ml-1 text-[10px] text-amber-700">+{c.effective.addenda.length} addendum</span>}</td>
                <td className="px-2 py-1.5">{c.authorName}</td>
                <td className="px-2 py-1.5">{toTitleCase(c.bookTitle)}</td>
                <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_TONE[c.contract.status]}`}>{STATUS_LABEL[c.contract.status]}</span></td>
                <td className="px-2 py-1.5 font-mono">{rupiah(c.effective.honorTotal)}</td>
                <td className="px-2 py-1.5 font-mono">{rupiah(c.summary.honorPaid)}</td>
                <td className="px-2 py-1.5">{c.summary.nextDue ? `${c.summary.nextDue.dueDate} · ${rupiah(c.summary.nextDue.amount)}` : '-'}{c.summary.overdueCount > 0 && <span className="ml-1 text-rose-700">({c.summary.overdueCount} terlambat)</span>}</td>
                <td className="px-2 py-1.5">{c.effective.rightsRevertAt}</td>
              </tr>
            ))}
            {contracts && contracts.length === 0 && <tr><td colSpan={8} className="px-2 py-4 text-center text-slate-400">Belum ada kontrak.</td></tr>}
            {!contracts && <tr><td colSpan={8} className="px-2 py-4 text-center text-slate-400">Memuat…</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <ContractDetailPanel contractId={selected} options={options} notify={notify} onChanged={() => void load()} />
        </div>
      )}
    </div>
  );
};

// --------------------------------------------------------------- pengingat
const REMINDER_TONE: Record<string, string> = {
  payment_overdue: 'text-rose-700',
  payment_due_soon: 'text-amber-700',
  rights_revert_12m: 'text-sky-700'
};

const describeReminder = (r: ReminderItem) => {
  if (r.kind === 'rights_revert_12m') return r.daysLeft < 0 ? `Hak sudah kembali ke penulis sejak ${r.refDate}` : `Hak kembali ke penulis ${r.refDate} (${r.daysLeft} hari lagi)`;
  if (r.kind === 'payment_overdue') return `${r.stage} ${rupiah(r.amount)} terlambat ${-r.daysLeft} hari (jatuh tempo ${r.refDate})`;
  return `${r.stage} ${rupiah(r.amount)} jatuh tempo ${r.refDate} (${r.daysLeft === 0 ? 'hari ini' : `${r.daysLeft} hari lagi`})`;
};

const RemindersView: React.FC<{ notify: Notify }> = ({ notify }) => {
  const [items, setItems] = useState<ReminderItem[] | null>(null);
  const load = useCallback(() => api.reminders().then(setItems).catch((err) => { notify(errorText(err), 'error'); setItems([]); }), [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">Tahap honor yang jatuh tempo dalam 7 hari atau terlambat, dan hak yang kembali ke penulis dalam 12 bulan. Email ringkasan dikirim otomatis ke admin (sekali per pengingat).</p>
        <button
          type="button"
          className={secondary}
          onClick={async () => {
            try {
              const result = await api.runReminders();
              notify(result.sent > 0 ? `${result.sent} pengingat baru dikirim ke email admin.` : 'Tidak ada pengingat baru untuk dikirim.');
            } catch (err) {
              notify(errorText(err), 'error');
            }
          }}
        ><Bell className="h-3 w-3" />Kirim pengingat baru sekarang</button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs" data-reminders>
        {(items ?? []).map((r) => (
          <li key={`${r.kind}-${r.refId}`} className="flex flex-wrap justify-between gap-2 px-3 py-2">
            <span><strong>{r.contractNumber}</strong> · {r.authorName} · {toTitleCase(r.bookTitle)}</span>
            <span className={`font-semibold ${REMINDER_TONE[r.kind]}`}>{describeReminder(r)}</span>
          </li>
        ))}
        {items && items.length === 0 && <li className="px-3 py-4 text-center text-slate-400">Tidak ada pengingat.</li>}
      </ul>
    </div>
  );
};

// ------------------------------------------------------ laporan & ekspor
const ReportView: React.FC<{ notify: Notify }> = ({ notify }) => {
  const [rows, setRows] = useState<TitleCostRow[] | null>(null);
  useEffect(() => {
    api.report().then(setRows).catch((err) => { notify(errorText(err), 'error'); setRows([]); });
  }, [notify]);
  const exportCsv = async (type: 'contracts' | 'payments' | 'report', name: string) => {
    try {
      saveBlob(await api.exportCsv(type), `${name}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };
  const total = (key: keyof TitleCostRow) => (rows ?? []).reduce((sum, r) => sum + Number(r[key] || 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={() => void exportCsv('report', 'biaya-naskah-per-judul')}><Download className="h-3 w-3" />CSV biaya per judul</button>
        <button type="button" className={secondary} onClick={() => void exportCsv('contracts', 'kontrak-naskah')}><Download className="h-3 w-3" />CSV kontrak</button>
        <button type="button" className={secondary} onClick={() => void exportCsv('payments', 'pembayaran-naskah')}><Download className="h-3 w-3" />CSV pembayaran</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-xs" data-cost-report>
          <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr><th className="px-2 py-2">Judul</th><th className="px-2 py-2">Kontrak</th><th className="px-2 py-2">Honor jual putus</th><th className="px-2 py-2">Dibayar</th><th className="px-2 py-2">Belum dibayar</th><th className="px-2 py-2">Honor revisi dibayar</th><th className="px-2 py-2">Total dibayar</th></tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.bookId ?? 'naskah'} className="border-t border-slate-100">
                <td className="px-2 py-1.5">{toTitleCase(r.bookTitle)}</td>
                <td className="px-2 py-1.5">{r.contracts}</td>
                <td className="px-2 py-1.5 font-mono">{rupiah(r.honorCommitted)}</td>
                <td className="px-2 py-1.5 font-mono">{rupiah(r.honorPaid)}</td>
                <td className="px-2 py-1.5 font-mono">{rupiah(r.honorOutstanding)}</td>
                <td className="px-2 py-1.5 font-mono">{rupiah(r.revisionPaid)}</td>
                <td className="px-2 py-1.5 font-mono font-semibold">{rupiah(r.totalPaid)}</td>
              </tr>
            ))}
            {rows && rows.length > 0 && (
              <tr className="border-t-2 border-slate-300 font-semibold">
                <td className="px-2 py-1.5">Total</td>
                <td className="px-2 py-1.5">{total('contracts')}</td>
                <td className="px-2 py-1.5 font-mono">{rupiah(total('honorCommitted'))}</td>
                <td className="px-2 py-1.5 font-mono">{rupiah(total('honorPaid'))}</td>
                <td className="px-2 py-1.5 font-mono">{rupiah(total('honorOutstanding'))}</td>
                <td className="px-2 py-1.5 font-mono">{rupiah(total('revisionPaid'))}</td>
                <td className="px-2 py-1.5 font-mono">{rupiah(total('totalPaid'))}</td>
              </tr>
            )}
            {rows && rows.length === 0 && <tr><td colSpan={7} className="px-2 py-4 text-center text-slate-400">Belum ada data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// -------------------------------------------------------------- impor CSV
const TEMPLATE = [
  'nomor_kontrak;penulis;buku;tanggal_kontrak;jangka_tahun;hak_cetak;hak_ebook;hak_audiobook;hak_terjemahan;hak_turunan;honor_total;honor_revisi_per_edisi;honor_dibayar_tanggal;catatan',
  'SPK/2024/001;email.penulis@contoh.com;book-10;15/03/2024;25;ya;ya;ya;tidak;tidak;30.000.000;5.000.000;20/03/2024;Kontrak lama'
].join('\r\n');

const ImportView: React.FC<{ notify: Notify; onImported: () => void }> = ({ notify, onImported }) => {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const runPreview = async (text = csv) => {
    setBusy(true);
    try {
      setPreview(await api.importPreview(text));
    } catch (err) {
      notify(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview || !window.confirm(`Simpan ${preview.valid} kontrak lama sebagai kontrak yang sudah ditandatangani?`)) return;
    setBusy(true);
    try {
      const result = await api.importCommit(csv);
      notify(`${result.created.length} kontrak diimpor.`);
      setCsv('');
      setPreview(null);
      onImported();
    } catch (err) {
      if (err instanceof ImportRejectedError) setPreview(err.preview);
      notify(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(preview && preview.fileErrors.length === 0 && preview.invalid === 0 && preview.valid > 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        Satu baris = satu kontrak lama yang sudah ditandatangani. Penulis diisi ID, email, atau nama persis; buku diisi ID, slug, ISBN, atau judul persis.
        Pemisah koma atau titik koma. Honor dicatat sebagai satu tahap; isi honor_dibayar_tanggal bila sudah dibayar. Semua baris harus valid sebelum disimpan.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={() => saveBlob(new Blob([`﻿${TEMPLATE}\r\n`], { type: 'text/csv;charset=utf-8' }), 'templat-impor-kontrak-naskah.csv')}>
          <Download className="h-3 w-3" />Templat CSV
        </button>
        <label className={`${secondary} cursor-pointer`}>
          <Upload className="h-3 w-3" />Pilih file CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const text = await file.text();
              setCsv(text);
              void runPreview(text);
            }}
          />
        </label>
      </div>
      <textarea rows={6} className={`${input} font-mono`} placeholder="…atau tempel isi CSV di sini" value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} />
      <div className="flex gap-2">
        <button type="button" className={secondary} disabled={busy || !csv.trim()} onClick={() => void runPreview()}><RefreshCw className="h-3 w-3" />Pratinjau</button>
        <button type="button" className={primary} disabled={busy || !ready} onClick={() => void commit()}>Simpan {preview?.valid ?? 0} kontrak</button>
      </div>

      {preview && (
        <div className="space-y-2" data-import-preview>
          {preview.fileErrors.map((e) => <p key={e} className="text-xs font-semibold text-rose-700">{e}</p>)}
          <p className="text-xs text-slate-700">{preview.total} baris · <span className="text-emerald-700">{preview.valid} valid</span> · <span className={preview.invalid ? 'text-rose-700' : ''}>{preview.invalid} bermasalah</span></p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[820px] text-xs">
              <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-2 py-2">Baris</th><th className="px-2 py-2">Kontrak</th><th className="px-2 py-2">Penulis</th><th className="px-2 py-2">Judul</th><th className="px-2 py-2">Tanggal · jangka</th><th className="px-2 py-2">Honor</th><th className="px-2 py-2">Catatan pratinjau</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className={`border-t border-slate-100 align-top ${r.errors.length ? 'bg-rose-50/60' : ''}`}>
                    <td className="px-2 py-1.5">{r.line}</td>
                    <td className="px-2 py-1.5 font-semibold">{r.contract?.contractNumber ?? '-'}</td>
                    <td className="px-2 py-1.5">{r.authorName ?? '-'}</td>
                    <td className="px-2 py-1.5">{r.bookTitle ? toTitleCase(r.bookTitle) : (r.errors.length ? '-' : 'Belum masuk katalog')}</td>
                    <td className="px-2 py-1.5">{r.contract ? `${r.contract.signedAt} · ${r.contract.termYears} th (kembali ${r.contract.rightsRevertAt})` : '-'}</td>
                    <td className="px-2 py-1.5 font-mono">{r.contract ? rupiah(r.contract.honorTotal) : '-'}{r.honorPaidAt && <span className="block text-emerald-700">dibayar {r.honorPaidAt}</span>}</td>
                    <td className="px-2 py-1.5">
                      {r.errors.map((e) => <span key={e} className="block text-rose-700"><AlertTriangle className="mr-1 inline h-3 w-3" />{e}</span>)}
                      {r.warnings.map((w) => <span key={w} className="block text-amber-700">{w}</span>)}
                      {r.errors.length === 0 && r.warnings.length === 0 && <span className="text-emerald-700">Siap diimpor</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------- akun penulis
const AuthorsView: React.FC<{ notify: Notify }> = ({ notify }) => {
  const [authors, setAuthors] = useState<AuthorAccount[] | null>(null);
  const [history, setHistory] = useState<{ authorId: string; links: AuthorLinkLog[] } | null>(null);
  const load = useCallback(() => api.authors().then(setAuthors).catch((err) => { notify(errorText(err), 'error'); setAuthors([]); }), [notify]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify(ok);
      await load();
      setHistory(null);
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        Akun login penulis untuk dashboard /author. Penautan otomatis hanya bila email login sudah dikonfirmasi, sama dengan email penulis, dan belum ada akun tertaut.
        Setelah admin melepas tautan, akun itu tidak ditautkan otomatis lagi ke penulis yang sama.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[720px] text-xs" data-author-accounts>
          <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr><th className="px-2 py-2">Penulis</th><th className="px-2 py-2">Email penulis</th><th className="px-2 py-2">Akun login</th><th className="px-2 py-2">Aksi</th></tr>
          </thead>
          <tbody>
            {(authors ?? []).map((a) => (
              <React.Fragment key={a.id}>
                <tr className="border-t border-slate-100 align-top">
                  <td className="px-2 py-1.5 font-semibold">{a.name}</td>
                  <td className="px-2 py-1.5">{a.email || <span className="text-slate-400">-</span>}</td>
                  <td className="px-2 py-1.5">
                    {a.userId
                      ? <span>Tertaut ({a.userLinkSource === 'auto_email' ? 'otomatis lewat email' : 'oleh admin'}{a.userLinkedAt ? `, ${a.userLinkedAt.slice(0, 10)}` : ''})<span className="block font-mono text-[10px] text-slate-400">{a.userId}</span></span>
                      : <span className="text-slate-400">Belum tertaut</span>}
                  </td>
                  <td className="flex flex-wrap gap-1 px-2 py-1.5">
                    {a.userId ? (
                      <button
                        type="button"
                        className={`${button} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
                        onClick={() => { if (window.confirm(`Lepas tautan akun login dari ${a.name}?`)) void act(() => api.unlinkAuthor(a.id), 'Tautan akun dilepas.'); }}
                      ><Unlink className="h-3 w-3" />Lepas tautan</button>
                    ) : (
                      <button
                        type="button"
                        className={secondary}
                        onClick={() => {
                          const value = window.prompt(`Email atau ID akun login untuk ${a.name}:`, a.email ?? '');
                          if (!value) return;
                          const payload = value.includes('@') ? { email: value.trim() } : { userId: value.trim() };
                          void act(() => api.linkAuthor(a.id, payload), 'Akun login ditautkan.');
                        }}
                      ><Link2 className="h-3 w-3" />Tautkan</button>
                    )}
                    <button
                      type="button"
                      className={secondary}
                      onClick={async () => {
                        if (history?.authorId === a.id) return setHistory(null);
                        try {
                          setHistory({ authorId: a.id, links: await api.authorLinks(a.id) });
                        } catch (err) {
                          notify(errorText(err), 'error');
                        }
                      }}
                    >Riwayat</button>
                  </td>
                </tr>
                {history?.authorId === a.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={4} className="px-2 py-2">
                      {history.links.length === 0 ? <span className="text-slate-400">Belum ada riwayat penautan.</span> : (
                        <ul className="space-y-0.5">
                          {history.links.map((l) => (
                            <li key={l.id}>{l.createdAt.slice(0, 16).replace('T', ' ')} UTC · {l.action === 'link' ? 'ditautkan' : 'dilepas'} ({l.source === 'auto_email' ? 'otomatis' : 'admin'}) · <span className="font-mono">{l.userId}</span>{l.actor ? ` · ${l.actor}` : ''}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------- tab
const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'contracts', label: 'Kontrak' },
  { id: 'reminders', label: 'Pengingat' },
  { id: 'report', label: 'Laporan biaya & ekspor' },
  { id: 'import', label: 'Impor kontrak lama' },
  { id: 'authors', label: 'Akun penulis' }
];

export const ManuscriptContractsTab: React.FC = () => {
  const [view, setView] = useState<View>('contracts');
  const [options, setOptions] = useState<ManuscriptOptions | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [version, setVersion] = useState(0);

  const notify = useCallback<Notify>((text, tone = 'ok') => setNotice({ text, tone }), []);

  useEffect(() => {
    api.options().then(setOptions).catch((err) => notify(errorText(err), 'error'));
  }, [notify]);

  return (
    <section className="space-y-4" id="manuscript-contracts-tab">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Kontrak Naskah (Jual Putus)</h2>
        <p className="text-xs text-slate-500">Honor jual putus, tanpa royalti. Hak kembali ke penulis paling lama 25 tahun sejak tanggal kontrak (UU 28/2014 Pasal 18). Dokumen disimpan di penyimpanan privat.</p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === v.id ? 'bg-slate-900 text-[#DFBF64]' : 'text-slate-600 hover:bg-slate-100'}`}
          >{v.label}</button>
        ))}
      </nav>
      {notice && (
        <p className={`rounded-md border px-3 py-2 text-xs ${notice.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`} role="status">
          {notice.text}
        </p>
      )}
      {!options ? <p className="text-xs text-slate-500">Memuat data penulis dan katalog…</p> : (
        <>
          {view === 'contracts' && <ContractsView key={version} options={options} notify={notify} />}
          {view === 'reminders' && <RemindersView notify={notify} />}
          {view === 'report' && <ReportView notify={notify} />}
          {view === 'import' && <ImportView notify={notify} onImported={() => { setVersion((n) => n + 1); setView('contracts'); }} />}
          {view === 'authors' && <AuthorsView notify={notify} />}
        </>
      )}
    </section>
  );
};
