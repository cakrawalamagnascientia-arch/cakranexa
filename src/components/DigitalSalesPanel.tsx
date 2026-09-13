import React, { useCallback, useEffect, useState } from 'react';
import { FlaskConical, RefreshCw, Trash2 } from 'lucide-react';
import { apiClient, type AdminDigitalOrder, type DigitalSalesSummary } from '../services/apiClient';

const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const dateTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

const STATUS_LABEL: Record<AdminDigitalOrder['status'], string> = {
  pending: 'Menunggu',
  challenge: 'Ditinjau',
  paid: 'Lunas',
  failed: 'Gagal',
  cancelled: 'Batal',
  expired: 'Kedaluwarsa',
  refunded: 'Refund'
};

/**
 * Admin: ringkasan penjualan produk digital. Pesanan uji (pembeli di DIGITAL_BETA_EMAILS) tidak dihitung dan
 * bisa dihapus sekaligus. Tab "Entitlement & Akses" (langkah 7) memperluas panel ini.
 */
export const DigitalSalesPanel: React.FC = () => {
  const [data, setData] = useState<DigitalSalesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiClient.getDigitalSalesSummary());
    } catch (err: any) {
      setError(err?.status === 503
        ? 'Modul penjualan digital belum aktif di server ini (Supabase belum terhubung atau migration fase 2 belum dijalankan).'
        : err?.message || 'Gagal memuat ringkasan penjualan digital.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteTests = async () => {
    if (!data || data.test.count === 0) return;
    const ok = window.confirm(
      `Hapus ${data.test.count} pesanan uji beserta hak aksesnya?\n\n`
      + 'Hanya pesanan dari email DIGITAL_BETA_EMAILS yang dihapus. Transaksi di Midtrans TIDAK ikut dibatalkan; '
      + 'lakukan refund pembayaran uji di dashboard Midtrans bila perlu.'
    );
    if (!ok) return;
    setDeleting(true);
    setNotice(null);
    try {
      const result = await apiClient.deleteDigitalTestOrders();
      setNotice(`${result.ordersDeleted} pesanan uji dan ${result.entitlementsDeleted} hak akses dihapus.`);
      await load();
    } catch (err: any) {
      setNotice(err?.message || 'Gagal menghapus pesanan uji.');
    } finally {
      setDeleting(false);
    }
  };

  const stats = data
    ? [
      { label: 'Pesanan lunas', value: String(data.summary.paidCount) },
      { label: 'Pendapatan', value: rupiah(data.summary.revenue) },
      { label: 'Menunggu bayar', value: String(data.summary.pendingCount) },
      { label: 'Refund', value: `${data.summary.refundedCount} (${rupiah(data.summary.refundedAmount)})` }
    ]
    : [];

  return (
    <section id="admin-digital-sales" className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Penjualan digital</h3>
          <p className="text-[11px] text-slate-500">Tidak termasuk pesanan uji dari email DIGITAL_BETA_EMAILS.</p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${data.featureEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
              title="Env DIGITAL_ENABLED di server"
            >
              {data.featureEnabled ? 'Fitur digital: aktif' : `Fitur digital: tertutup (${data.betaEmailCount} email beta)`}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat ulang
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}

      {data && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{stat.label}</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900 [overflow-wrap:anywhere]">{stat.value}</p>
              </div>
            ))}
          </div>

          {data.recent.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-2">Pesanan</th>
                    <th className="py-1.5 pr-2">Pembeli</th>
                    <th className="py-1.5 pr-2">Produk</th>
                    <th className="py-1.5 pr-2 text-right">Total</th>
                    <th className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recent.map((order) => (
                    <tr key={order.orderNumber}>
                      <td className="py-1.5 pr-2 font-mono">{order.orderNumber}<br /><span className="font-sans text-slate-400">{dateTime(order.createdAt)}</span></td>
                      <td className="py-1.5 pr-2 [overflow-wrap:anywhere]">{order.customerEmail}</td>
                      <td className="py-1.5 pr-2">{order.items.map((item) => item.title).join(', ')}</td>
                      <td className="py-1.5 pr-2 text-right font-semibold">{rupiah(order.amount)}</td>
                      <td className="py-1.5">{STATUS_LABEL[order.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs text-slate-600">
              <FlaskConical className="h-3.5 w-3.5 text-slate-400" />
              Pesanan uji: <strong>{data.test.count}</strong> ({data.test.paidCount} lunas, {rupiah(data.test.paidAmount)})
            </p>
            <button
              type="button"
              id="btn-delete-test-orders"
              onClick={() => void deleteTests()}
              disabled={deleting || data.test.count === 0}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? 'Menghapus…' : 'Hapus pesanan uji'}
            </button>
          </div>
        </>
      )}
      {notice && <p role="status" className="mt-2 text-xs text-slate-700">{notice}</p>}
    </section>
  );
};
