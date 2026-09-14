import React, { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, UserPlus } from 'lucide-react';
import {
  inviteInstitutionMembers,
  listInstitutionMembers,
  resendInstitutionInvite,
  updateInstitutionMember,
  type InstitutionMemberRole,
  type InstitutionMemberStatus,
  type InstitutionMemberView
} from '../services/institutionAdminApi';

/**
 * Anggota institusi di dasbor admin CakraNexa (fase 4 Langkah 3): undang admin institusi pertama & anggota (daftar
 * atau CSV), ubah peran, nonaktifkan/aktifkan, kirim ulang undangan. Tanpa aktivitas baca individu.
 */

const TIME_ZONE = 'Asia/Jakarta';
const dateOnly = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('id-ID', { dateStyle: 'medium', timeZone: TIME_ZONE }) : '—');
const STATUS_LABEL: Record<InstitutionMemberStatus, string> = { invited: 'Undangan terkirim', active: 'Aktif', disabled: 'Nonaktif' };
const STATUS_CLASS: Record<InstitutionMemberStatus, string> = {
  invited: 'bg-sky-100 text-sky-800',
  active: 'bg-emerald-100 text-emerald-800',
  disabled: 'bg-slate-200 text-slate-700'
};
const VIA_LABEL: Record<string, string> = { invite: 'Undangan', domain: 'Domain email', code: 'Kode gabung', ip: 'Jaringan (tamu)', admin: 'Admin' };
const inputClass = 'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]';
const buttonClass = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
const primaryClass = 'inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-[#DFBF64] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

export const InstitutionMembersSection: React.FC<{
  institutionId: string;
  onChanged: () => void;
  flash: (message: string) => void;
}> = ({ institutionId, onChanged, flash }) => {
  const [members, setMembers] = useState<InstitutionMemberView[]>([]);
  const [status, setStatus] = useState<'' | InstitutionMemberStatus>('');
  const [search, setSearch] = useState('');
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<InstitutionMemberRole>('member');
  const [groupLabel, setGroupLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers((await listInstitutionMembers(institutionId, { status: status || undefined, q: search })).members);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat anggota.');
    }
  }, [institutionId, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, action: () => Promise<string>) => {
    setBusy(label);
    setError(null);
    try {
      flash(await action());
      await load();
      onChanged();
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan.');
    } finally {
      setBusy(null);
    }
  };

  const invite = () => run('invite', async () => {
    const result = await inviteInstitutionMembers(institutionId, { emails, role, ...(groupLabel.trim() ? { groupLabel: groupLabel.trim() } : {}) });
    setEmails('');
    const parts = [`${result.invited} undangan dikirim`];
    if (result.reactivated) parts.push(`${result.reactivated} diaktifkan kembali`);
    if (result.skipped.length) parts.push(`${result.skipped.length} dilewati (sudah diundang/anggota)`);
    if (result.invalid.length) parts.push(`tidak valid: ${result.invalid.slice(0, 5).join(', ')}`);
    return `${parts.join(', ')}.`;
  });

  const counts = {
    active: members.filter((m) => m.status === 'active').length,
    invited: members.filter((m) => m.status === 'invited').length
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Anggota ({counts.active} aktif · {counts.invited} undangan)</h4>
        <button type="button" className={buttonClass} onClick={() => void load()}><RefreshCw className="h-3 w-3" /> Muat ulang</button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
        <label className="block text-[11px] font-semibold text-slate-700 sm:col-span-4">
          <span className="mb-1 block">Undang lewat email (satu per baris, koma, atau tempel CSV)</span>
          <textarea rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={'kepala.perpustakaan@kampus.ac.id\nmahasiswa@kampus.ac.id'} className={inputClass} />
        </label>
        <label className="block text-[11px] font-semibold text-slate-700">
          <span className="mb-1 block">Peran</span>
          <select value={role} onChange={(e) => setRole(e.target.value as InstitutionMemberRole)} className={inputClass}>
            <option value="member">Anggota</option>
            <option value="admin">Admin institusi</option>
          </select>
        </label>
        <label className="block text-[11px] font-semibold text-slate-700 sm:col-span-2">
          <span className="mb-1 block">Label grup (opsional)</span>
          <input value={groupLabel} onChange={(e) => setGroupLabel(e.target.value)} placeholder="Prodi Akuntansi 2026" className={inputClass} />
        </label>
        <div className="flex items-end">
          <button type="button" className={primaryClass} disabled={busy !== null || !emails.trim()} onClick={() => void invite()}>
            <UserPlus className="h-3.5 w-3.5" /> Kirim undangan
          </button>
        </div>
        <p className="text-[11px] text-slate-500 sm:col-span-4">
          Undangan dikirim lewat email. Penerima masuk atau mendaftar dengan email yang sama; setelah email terverifikasi, keanggotaan aktif otomatis.
          Kursi admin mengikuti tier kontrak.
        </p>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as '' | InstitutionMemberStatus)} className={`${inputClass} w-auto`}>
          <option value="">Semua status</option>
          <option value="active">Aktif</option>
          <option value="invited">Undangan</option>
          <option value="disabled">Nonaktif</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari email, nama, grup" className={`${inputClass} min-w-0 flex-1`} />
      </div>
      {error && <p className="mb-2 text-xs text-rose-700">{error}</p>}
      {members.length === 0 ? <p className="text-xs text-slate-500">Belum ada anggota.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="pb-1 pr-3">Anggota</th><th className="pb-1 pr-3">Peran</th><th className="pb-1 pr-3">Status</th><th className="pb-1 pr-3">Bergabung</th><th className="pb-1 pr-3">Grup</th><th className="pb-1">Aksi</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-3"><div className="font-semibold text-slate-900">{m.email ?? '—'}</div>{m.name && <div className="text-[11px] text-slate-500">{m.name}</div>}</td>
                  <td className="py-2 pr-3">{m.role === 'admin' ? 'Admin institusi' : 'Anggota'}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[m.status]}`}>
                      {m.status === 'disabled' && m.disabledBy === 'member' ? 'Keluar sendiri' : STATUS_LABEL[m.status]}
                    </span>
                    {m.expiresAt && <div className="mt-0.5 text-[10px] text-slate-500">tamu s.d. {dateOnly(m.expiresAt)}</div>}
                  </td>
                  <td className="py-2 pr-3 text-[11px]">{m.joinedVia ? VIA_LABEL[m.joinedVia] ?? m.joinedVia : '—'}<div className="text-slate-500">{dateOnly(m.joinedAt ?? m.invitedAt)}</div></td>
                  <td className="py-2 pr-3 text-[11px]">{m.groupLabel ?? '—'}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {m.status !== 'disabled' && (
                        <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void run(`role:${m.id}`, async () => {
                          await updateInstitutionMember(institutionId, m.id, { role: m.role === 'admin' ? 'member' : 'admin' });
                          return m.role === 'admin' ? 'Peran admin dilepas.' : 'Dijadikan admin institusi.';
                        })}>
                          {m.role === 'admin' ? 'Jadikan anggota' : 'Jadikan admin'}
                        </button>
                      )}
                      {m.status === 'invited' && (
                        <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void run(`resend:${m.id}`, async () => {
                          await resendInstitutionInvite(institutionId, m.id);
                          return `Undangan dikirim ulang ke ${m.email}.`;
                        })}>
                          <Mail className="h-3 w-3" /> Kirim ulang
                        </button>
                      )}
                      <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => {
                        const disable = m.status !== 'disabled';
                        if (disable && !window.confirm(`Nonaktifkan ${m.email}? Akses institusinya dicabut dan sesi yang sedang berjalan diakhiri.`)) return;
                        void run(`status:${m.id}`, async () => {
                          await updateInstitutionMember(institutionId, m.id, { status: disable ? 'disabled' : 'active' });
                          return disable ? 'Anggota dinonaktifkan.' : 'Anggota diaktifkan kembali.';
                        });
                      }}>
                        {m.status === 'disabled' ? 'Aktifkan' : 'Nonaktifkan'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
