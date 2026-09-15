import React, { useEffect, useState } from 'react';
import { MapPin, RotateCcw, Save, Search, Truck, X } from 'lucide-react';
import {
  DEFAULT_PRINT_CHECKOUT_SETTINGS,
  DEFAULT_SHIPPING_ZONES,
  INDONESIA_PROVINCES,
  type PrintCheckoutSettings,
  type ShippingZone
} from '../data/shippingZones';
import { RAJAONGKIR_COURIERS, type SignedShippingDestination } from '../data/shippingRates';
import {
  getPrintCheckoutAdmin,
  savePrintCheckoutSettings,
  searchShippingDestinations,
  type ShippingApiUsageInfo
} from '../services/printCheckoutApi';
import { destinationDisplay } from './ShippingDestinationPicker';

/**
 * Ongkos kirim checkout buku cetak (tabel print_checkout_settings): tarif kurir RajaOngkir dari lokasi asal pengiriman
 * ke kecamatan pembeli (berat dari katalog + kemasan). Saat RajaOngkir tidak tersedia atau kuota harian habis: cadangan
 * tabel zona (ongkir estimasi, bawaan) atau tahan pesanan. Pemakaian API hari ini tampil dengan peringatan di 80%.
 */
const input = 'w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:border-slate-800';

const OriginSearch: React.FC<{ onPick: (d: SignedShippingDestination) => void; disabled: boolean }> = ({ onPick, disabled }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SignedShippingDestination[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (value = query) => {
    const normalized = value.trim();
    if (normalized.length < 3) {
      setResults([]);
      setMessage(normalized ? 'Ketik minimal 3 karakter.' : null);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const list = await searchShippingDestinations(normalized);
      setResults(list);
      if (list.length === 0) setMessage('Wilayah tidak ditemukan. Coba nama kecamatan/kelurahan lain atau kode pos.');
    } catch (err) {
      setResults([]);
      setMessage(err instanceof Error ? err.message : 'Pencarian gagal.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const normalized = query.trim();
    if (disabled || normalized.length < 3) {
      setResults([]);
      return undefined;
    }
    const timer = window.setTimeout(() => void search(normalized), 400);
    return () => window.clearTimeout(timer);
  }, [query, disabled]);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          className={input}
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (query.trim().length >= 3) void search(query);
            }
          }}
          placeholder="Kecamatan/kelurahan gudang atau kode pos, mis. Menteng atau 10310"
        />
        <button
          type="button"
          disabled={disabled || busy || query.trim().length < 3}
          onClick={() => void search(query)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Search className="h-3.5 w-3.5" />{busy ? 'Mencari…' : 'Cari'}
        </button>
      </div>
      <p className="text-[11px] text-slate-400">Setiap pencarian baru memakai 1 permintaan dari kuota harian (kata kunci yang sama disimpan 24 jam).</p>
      {message && <p className="text-[11px] text-rose-700">{message}</p>}
      {results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-slate-200 text-xs">
          {results.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => { onPick(d); setResults([]); setQuery(''); }} className="w-full px-2.5 py-1.5 text-left hover:bg-slate-50">
                {destinationDisplay(d)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const UsageMeter: React.FC<{ usage: ShippingApiUsageInfo }> = ({ usage }) => {
  const tone = usage.exhausted ? 'bg-rose-500' : usage.warning ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1" data-rajaongkir-usage>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-bold text-slate-700">Pemakaian API RajaOngkir hari ini ({usage.date}, WIB)</span>
        <span className={`font-mono font-bold ${usage.exhausted ? 'text-rose-700' : usage.warning ? 'text-amber-700' : 'text-slate-800'}`}>
          {usage.count}/{usage.limit} ({usage.percent}%)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, usage.percent)}%` }} />
      </div>
      {usage.warning && !usage.exhausted && (
        <p className="text-[11px] font-semibold text-amber-700" data-rajaongkir-usage-warning>
          Sudah 80% kuota. Saat kuota habis, pencarian dan tarif baru memakai cadangan sampai pukul 00.00 WIB.
        </p>
      )}
      <p className="text-[11px] text-slate-400">Hanya permintaan yang benar-benar dikirim ke RajaOngkir yang dihitung; hasil cache tidak.</p>
    </div>
  );
};

export const ShippingZonesPanel: React.FC = () => {
  const [settings, setSettings] = useState<PrintCheckoutSettings | null>(null);
  const [rajaOngkirConfigured, setRajaOngkirConfigured] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<ShippingApiUsageInfo | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await getPrintCheckoutAdmin();
    setSettings(res.settings);
    setRajaOngkirConfigured(res.rajaongkir.configured);
    setUsage(res.usage);
  };

  useEffect(() => {
    load().catch((err) => {
      setSettings(DEFAULT_PRINT_CHECKOUT_SETTINGS);
      setMessage({ tone: 'error', text: `Pengaturan server belum dapat dimuat (${err instanceof Error ? err.message : err}). Menampilkan pengaturan bawaan.` });
    });
  }, []);

  if (!settings) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">Memuat pengaturan ongkos kirim…</section>;
  }

  const updateZone = (id: string, patch: Partial<ShippingZone>) =>
    setSettings((s) => (s ? { ...s, zones: s.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) } : s));
  const moveProvince = (province: string, zoneId: string) =>
    setSettings((s) => (s ? {
      ...s,
      zones: s.zones.map((z) => ({ ...z, provinces: z.id === zoneId ? [...z.provinces.filter((p) => p !== province), province] : z.provinces.filter((p) => p !== province) }))
    } : s));
  const zoneOf = (province: string) => settings.zones.find((z) => z.provinces.includes(province))?.id ?? '';
  const toggleCourier = (code: string) =>
    setSettings((s) => (s ? { ...s, couriers: s.couriers.includes(code) ? s.couriers.filter((c) => c !== code) : [...s.couriers, code] } : s));
  const numberInput = (value: string) => Number(value.replace(/\D/g, '')) || 0;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await savePrintCheckoutSettings(settings);
      await load();
      setMessage({ tone: 'ok', text: 'Pengaturan ongkos kirim disimpan. Checkout memakai pengaturan baru paling lambat 1 menit.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal menyimpan.' });
    } finally {
      setSaving(false);
    }
  };

  const fallbackText = settings.fallbackMode === 'zone_table' ? 'tabel zona (ongkir estimasi)' : 'tahan pesanan (admin mengisi ongkir)';
  const status = rajaOngkirConfigured === false
    ? { tone: 'text-rose-800 bg-rose-50 border-rose-200', text: `RAJAONGKIR_API_KEY belum terbaca di server (env Render). Checkout memakai cadangan: ${fallbackText}.` }
    : !settings.origin
      ? { tone: 'text-rose-800 bg-rose-50 border-rose-200', text: `Lokasi asal pengiriman belum diatur. Cari kecamatan gudang, pilih, lalu simpan. Sampai diatur, checkout memakai cadangan: ${fallbackText}.` }
      : usage?.exhausted
        ? { tone: 'text-rose-800 bg-rose-50 border-rose-200', text: `Kuota harian RajaOngkir habis. Sampai pukul 00.00 WIB checkout memakai cadangan: ${fallbackText}.` }
        : { tone: 'text-emerald-800 bg-emerald-50 border-emerald-200', text: 'Aktif: pembeli memilih kecamatan tujuan dan layanan kurir dengan tarif RajaOngkir sebenarnya.' };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" id="shipping-zones-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Truck className="h-4 w-4 text-[#D4AF37]" />Ongkos Kirim Checkout Buku Cetak (RajaOngkir)</h3>
          <p className="mt-0.5 text-xs text-slate-500">Server menghitung ulang ongkir setiap pesanan; angka dari browser tidak dipakai.</p>
        </div>
        <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-[#DFBF64] disabled:opacity-50">
          <Save className="h-3.5 w-3.5" />{saving ? 'Menyimpan…' : 'Simpan Pengaturan Ongkir'}
        </button>
      </div>

      <p className={`rounded-lg border px-3 py-2 text-xs ${status.tone}`} data-rajaongkir-status>{status.text}</p>
      {usage && <UsageMeter usage={usage} />}

      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-700">Lokasi asal pengiriman (gudang)</p>
          <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs text-slate-700">
            <MapPin className="h-3.5 w-3.5 text-[#D4AF37]" />
            {settings.origin ? <span data-origin-label>{destinationDisplay(settings.origin)}</span> : <span className="text-rose-700">Belum diatur</span>}
          </p>
          {settings.origin && (
            <button
              type="button"
              onClick={() => setSettings({ ...settings, origin: null })}
              className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
            >
              <X className="h-3 w-3" /> Hapus asal
            </button>
          )}
          </div>
          <OriginSearch disabled={rajaOngkirConfigured === false} onPick={(d) => setSettings({ ...settings, origin: { id: d.id, label: d.label } })} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-700">Kurir yang ditawarkan ke pembeli (dihitung dalam satu permintaan)</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {RAJAONGKIR_COURIERS.map((c) => (
              <label key={c.code} className="flex items-center gap-1.5 text-xs text-slate-700">
                <input type="checkbox" checked={settings.couriers.includes(c.code)} onChange={() => toggleCourier(c.code)} />{c.name}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">Kurir tanpa layanan ke tujuan atau di luar paket akun RajaOngkir tidak muncul di checkout.</p>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          Berat kemasan per pesanan
          <input className={`${input} w-20`} inputMode="numeric" value={settings.packagingGram} onChange={(e) => setSettings({ ...settings, packagingGram: numberInput(e.target.value) })} />
          gram (ditambahkan ke berat buku di katalog; buku tanpa berat dihitung 500 g per eksemplar).
        </label>
        <label className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          Kuota harian API
          <input className={`${input} w-20`} inputMode="numeric" value={settings.dailyQuota} onChange={(e) => setSettings({ ...settings, dailyQuota: numberInput(e.target.value) })} />
          permintaan (paket Komerce Starter: 100). Saat habis, server tidak memanggil RajaOngkir sampai besok.
        </label>
      </div>

      <fieldset className="space-y-1.5 rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
        <legend className="px-1 text-xs font-bold text-slate-700">Saat RajaOngkir tidak tersedia atau kuota habis</legend>
        <label className="flex items-start gap-1.5">
          <input type="radio" name="fallback-mode" className="mt-0.5" checked={settings.fallbackMode === 'zone_table'} onChange={() => setSettings({ ...settings, fallbackMode: 'zone_table' })} />
          <span><strong>Gunakan tabel zona</strong> (bawaan): pembeli melihat "ongkir estimasi"; pesanan ditandai ONGKIR ESTIMASI di Dispatcher dan ongkirnya bisa dikoreksi sebelum dibayar.</span>
        </label>
        <label className="flex items-start gap-1.5">
          <input type="radio" name="fallback-mode" className="mt-0.5" checked={settings.fallbackMode === 'hold_order'} onChange={() => setSettings({ ...settings, fallbackMode: 'hold_order' })} />
          <span><strong>Tahan pesanan</strong>: status "menunggu ongkir", admin mengisi ongkir lalu tagihan dikirim ke pembeli.</span>
        </label>
      </fieldset>

      <label className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
        Pesanan
        <input className={`${input} w-20`} inputMode="numeric" value={settings.manualQuoteMinCopies} onChange={(e) => setSettings({ ...settings, manualQuoteMinCopies: numberInput(e.target.value) })} />
        eksemplar atau lebih: status "menunggu ongkir", admin mengisi ongkir lalu tagihan dikirim ke pembeli.
      </label>

      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Tabel zona cadangan (ongkir estimasi saat RajaOngkir tidak tersedia)</summary>
        <div className="mt-3 space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={() => setSettings({ ...settings, zones: DEFAULT_SHIPPING_ZONES })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <RotateCcw className="h-3.5 w-3.5" />Zona bawaan
            </button>
          </div>
          <p className="text-xs text-slate-500">Ongkir flat per pesanan menurut provinsi tujuan. Kota di kolom Kota menimpa provinsi (mis. Bogor, Depok, Tangerang, Bekasi masuk Jabodetabek).</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="pb-1 pr-2">Zona</th><th className="pb-1 pr-2">Ongkir flat (Rp)</th><th className="pb-1 pr-2">+ per eksemplar tambahan (Rp)</th><th className="pb-1 pr-2">Kota khusus (pisahkan koma)</th><th className="pb-1">Provinsi</th></tr>
              </thead>
              <tbody>
                {settings.zones.map((zone) => (
                  <tr key={zone.id} className="border-t border-slate-100 align-top">
                    <td className="py-1.5 pr-2"><input className={input} value={zone.name} onChange={(e) => updateZone(zone.id, { name: e.target.value })} /></td>
                    <td className="py-1.5 pr-2"><input className={input} inputMode="numeric" value={zone.fee} onChange={(e) => updateZone(zone.id, { fee: numberInput(e.target.value) })} /></td>
                    <td className="py-1.5 pr-2"><input className={input} inputMode="numeric" value={zone.extraPerCopy} onChange={(e) => updateZone(zone.id, { extraPerCopy: numberInput(e.target.value) })} /></td>
                    <td className="py-1.5 pr-2"><input className={input} value={zone.cities.join(', ')} onChange={(e) => updateZone(zone.id, { cities: e.target.value.split(',').map((c) => c.trim()).filter(Boolean) })} /></td>
                    <td className="py-1.5 text-slate-500">{zone.provinces.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">Provinsi → zona (38 provinsi)</summary>
            <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {INDONESIA_PROVINCES.map((province) => (
                <label key={province} className="flex items-center justify-between gap-2 text-xs">
                  <span>{province}</span>
                  <select className="rounded-md border border-slate-300 px-1.5 py-0.5 text-xs" value={zoneOf(province)} onChange={(e) => moveProvince(province, e.target.value)}>
                    <option value="">— belum —</option>
                    {settings.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>
        </div>
      </details>

      {message && <p className={`text-xs ${message.tone === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>{message.text}</p>}
    </section>
  );
};
