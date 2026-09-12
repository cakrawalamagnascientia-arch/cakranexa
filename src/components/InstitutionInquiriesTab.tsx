import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Mail, Phone, RefreshCw } from 'lucide-react';
import type { InstitutionInquiry, InstitutionInquiryStatus, InstitutionType } from '../types';
import { apiClient, ApiError } from '../services/apiClient';
import { INSTITUTION_INQUIRY_STATUSES } from '../data/membership';

/** Tab admin "Permintaan Institusi": daftar permintaan penawaran dari /institutions dengan status. */

const STATUS_LABEL: Record<InstitutionInquiryStatus, string> = { new: 'Baru', contacted: 'Dihubungi', done: 'Selesai' };
const STATUS_CLASS: Record<InstitutionInquiryStatus, string> = {
  new: 'bg-sky-50 text-sky-700 border-sky-200',
  contacted: 'bg-amber-50 text-amber-800 border-amber-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200'
};
const TYPE_LABEL: Record<InstitutionType, string> = {
  university: 'Perguruan tinggi',
  library: 'Perpustakaan',
  government: 'Instansi pemerintah',
  company: 'Perusahaan',
  other: 'Lainnya'
};

const errorMessage = (err: unknown): string => (err instanceof ApiError ? err.message : 'Server tidak terjangkau. Coba lagi.');

export const InstitutionInquiriesTab: React.FC = () => {
  const [inquiries, setInquiries] = useState<InstitutionInquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | InstitutionInquiryStatus>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setInquiries(await apiClient.getInstitutionInquiries());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(INSTITUTION_INQUIRY_STATUSES.map((status) => [status, 0])) as Record<InstitutionInquiryStatus, number>;
    inquiries.forEach((q) => { byStatus[q.status] = (byStatus[q.status] || 0) + 1; });
    return byStatus;
  }, [inquiries]);

  const visible = filter === 'all' ? inquiries : inquiries.filter((q) => q.status === filter);

  const updateStatus = async (inquiry: InstitutionInquiry, status: InstitutionInquiryStatus) => {
    const previous = inquiry.status;
    setUpdatingId(inquiry.id);
    setInquiries((prev) => prev.map((q) => (q.id === inquiry.id ? { ...q, status } : q)));
    try {
      await apiClient.updateInstitutionInquiryStatus(inquiry.id, status);
    } catch (err) {
      setInquiries((prev) => prev.map((q) => (q.id === inquiry.id ? { ...q, status: previous } : q)));
      setError(errorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  };

  const pillClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
      active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
    }`;

  return (
    <div id="admin-institution-inquiries" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFilter('all')} className={pillClass(filter === 'all')}>
            Semua ({inquiries.length})
          </button>
          {INSTITUTION_INQUIRY_STATUSES.map((status) => (
            <button key={status} type="button" onClick={() => setFilter(status)} className={pillClass(filter === status)}>
              {STATUS_LABEL[status]} ({counts[status]})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 self-start px-2.5 py-1.5 rounded-md border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Muat ulang</span>
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        Setiap permintaan baru juga dikirim lewat email (Resend) ke INSTITUTION_INQUIRY_EMAILS, atau ke penerima notifikasi pesanan
        bila variabel itu kosong.
      </p>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {isLoading ? (
          <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Memuat permintaan…
          </div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">Belum ada permintaan penawaran{filter !== 'all' ? ` berstatus ${STATUS_LABEL[filter]}` : ''}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Tanggal</th>
                  <th className="px-4 py-2.5 font-semibold">Institusi</th>
                  <th className="px-4 py-2.5 font-semibold">Pengguna</th>
                  <th className="px-4 py-2.5 font-semibold">Kontak</th>
                  <th className="px-4 py-2.5 font-semibold">Pesan</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((q) => (
                  <tr key={q.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {new Date(q.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                      <div className="text-[10px] text-slate-400 uppercase mt-0.5">Bahasa: {q.language}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{q.institutionName}</div>
                      <div className="text-slate-500 mt-0.5">{TYPE_LABEL[q.institutionType] || q.institutionType}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-900">{q.userCount.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 space-y-1">
                      {q.contactName && <div className="font-semibold text-slate-800">{q.contactName}</div>}
                      <a href={`mailto:${q.email}`} className="flex items-center gap-1 text-sky-700 hover:underline break-all">
                        <Mail className="w-3 h-3 shrink-0" />
                        {q.email}
                      </a>
                      {q.phone && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <Phone className="w-3 h-3 shrink-0" />
                          {q.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs text-slate-600 whitespace-pre-line">{q.message || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block mb-1.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${STATUS_CLASS[q.status]}`}>
                        {STATUS_LABEL[q.status]}
                      </span>
                      <select
                        aria-label={`Status permintaan ${q.institutionName}`}
                        value={q.status}
                        disabled={updatingId === q.id}
                        onChange={(e) => void updateStatus(q, e.target.value as InstitutionInquiryStatus)}
                        className="block w-full px-2 py-1.5 rounded-md border border-slate-300 bg-white text-xs focus:outline-none focus:border-slate-800"
                      >
                        {INSTITUTION_INQUIRY_STATUSES.map((status) => (
                          <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
