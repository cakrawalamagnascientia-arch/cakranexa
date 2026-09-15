import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MapPin, RefreshCw } from 'lucide-react';
import type { CartItem } from '../types';
import { etdDays, rateDescription, rateKey, regionName, shippingRateLabel, type ShippingRate, type SignedShippingDestination } from '../data/shippingRates';
import { quoteShipping } from '../data/shippingZones';
import { getShippingQuote, searchShippingDestinations, type PrintCheckoutConfig } from '../services/printCheckoutApi';
import { settingsOfConfig } from '../hooks/usePrintCheckoutConfig';
import { ApiError } from '../services/apiClient';
import { useFormatters } from '../i18n/hooks';

/**
 * Ongkir buku cetak di checkout: cari kecamatan/kelurahan tujuan (RajaOngkir), lalu pilih layanan kurir dengan tarif
 * sebenarnya untuk berat isi keranjang. Saat tarif tidak tersedia: cadangan tabel zona (ongkir estimasi) atau ongkir
 * diisi admin, sesuai pengaturan. Server menghitung ulang ongkir saat pesanan dibuat.
 */

export interface CourierRatesState {
  status: 'idle' | 'loading' | 'ok' | 'estimate' | 'manual' | 'error';
  rates: ShippingRate[];
  reason?: 'bulk' | 'unavailable' | 'no_service';
  weightGram?: number;
  /** Cadangan tabel zona (status 'estimate'). */
  fee?: number;
  zoneName?: string;
}

/** Label RajaOngkir ("SENEN, SENEN, JAKARTA PUSAT, DKI JAKARTA, 10410") dengan huruf wajar. */
export const destinationDisplay = (d: Pick<SignedShippingDestination, 'label'>) =>
  d.label.split(',').map((part) => regionName(part.trim())).filter(Boolean).join(', ');

export const useCourierShipping = (enabled: boolean, items: CartItem[]) => {
  const [destination, setDestination] = useState<SignedShippingDestination | null>(null);
  const [state, setState] = useState<CourierRatesState>({ status: 'idle', rates: [] });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const itemsKey = items.map((item) => `${item.book.id}x${item.quantity}`).join(',');

  // Satu permintaan per pemilihan wilayah (semua kurir sekaligus); server menyimpan hasilnya 30 menit.
  useEffect(() => {
    if (!enabled || !destination) {
      setState({ status: 'idle', rates: [] });
      return undefined;
    }
    let active = true;
    setState({ status: 'loading', rates: [] });
    getShippingQuote({ destination, items: itemsRef.current.map((item) => ({ book_id: item.book.id, qty: item.quantity })) })
      .then((res) => {
        if (!active) return;
        if (res.status === 'ok') {
          setState({ status: 'ok', rates: res.rates, weightGram: res.weightGram });
          // Pilihan sebelumnya dipertahankan bila masih ada; selain itu layanan termurah.
          setSelectedKey((key) => (res.rates.some((r) => rateKey(r) === key) ? key : res.rates[0] ? rateKey(res.rates[0]) : null));
        } else if (res.status === 'estimate') {
          setState({ status: 'estimate', rates: [], fee: res.fee, zoneName: res.zoneName, weightGram: res.weightGram });
        } else {
          setState({ status: 'manual', rates: [], reason: res.reason, weightGram: res.weightGram });
        }
      })
      .catch(() => {
        if (active) setState({ status: 'error', rates: [] });
      });
    return () => {
      active = false;
    };
  }, [enabled, destination, itemsKey, tick]);

  const selected = state.status === 'ok' ? state.rates.find((r) => rateKey(r) === selectedKey) ?? null : null;
  return {
    destination,
    setDestination,
    state,
    selected,
    select: (rate: ShippingRate) => setSelectedKey(rateKey(rate)),
    reload: () => setTick((n) => n + 1)
  };
};

/**
 * Ongkir checkout (dipakai halaman /checkout dan modal "Beli Sekarang"): tarif kurir bila RajaOngkir tersedia;
 * selain itu cadangan dari pengaturan admin: tabel zona (ongkir estimasi) atau ongkir diisi admin.
 */
export const usePrintShipping = (
  config: PrintCheckoutConfig,
  items: CartItem[],
  customer: { province: string; city: string },
  enabled = true
) => {
  const { t } = useTranslation('checkout');
  const { currency } = useFormatters();
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const courierMode = config.courierRates && !searchUnavailable;
  const courier = useCourierShipping(enabled && courierMode, items);
  const copies = items.reduce((sum, item) => sum + item.quantity, 0);
  const bulk = copies >= config.manualQuoteMinCopies;
  const zoneFallback = config.fallbackMode === 'zone_table';
  const zoneQuote = !courierMode && zoneFallback && customer.province
    ? quoteShipping(settingsOfConfig(config), { province: customer.province, city: customer.city, copies })
    : null;
  const courierEstimate = courierMode && courier.state.status === 'estimate';
  const manual = bulk || (courierMode ? courier.state.status === 'manual' : !zoneFallback || (zoneQuote !== null && zoneQuote.kind !== 'zone'));
  const estimate = !manual && (courierEstimate || zoneQuote?.kind === 'zone');
  const cost = manual ? 0
    : courierMode ? (courierEstimate ? courier.state.fee ?? 0 : courier.selected?.cost ?? 0)
      : zoneQuote?.kind === 'zone' ? zoneQuote.fee : 0;
  const zoneName = courierEstimate ? courier.state.zoneName : zoneQuote?.kind === 'zone' ? zoneQuote.zoneName : '';
  const label = manual ? null
    : estimate ? t('printCheckout.shippingEstimate', { zone: zoneName })
      : courier.selected ? shippingRateLabel(courier.selected) : null;
  const display = manual ? t('printCheckout.shippingManual')
    : courierMode
      ? (!courier.destination ? t('printCheckout.rates.pickDestination')
        : courier.state.status === 'loading' ? t('printCheckout.rates.loading')
          : estimate || courier.selected ? currency(cost) : '—')
      : !customer.province ? t('printCheckout.shippingPickProvince') : currency(cost);
  const manualNote = bulk ? t('printCheckout.shippingManualNote', { min: config.manualQuoteMinCopies }) : t('printCheckout.rates.manualNote');
  return { courierMode, courier, bulk, manual, estimate, cost, label, display, manualNote, useManualAddress: () => setSearchUnavailable(true) };
};

export const DestinationSearch: React.FC<{
  value: SignedShippingDestination | null;
  onChange: (destination: SignedShippingDestination | null) => void;
  /** Pencarian tidak tersedia (kuota habis/RajaOngkir gagal): form beralih ke provinsi/kota + ongkir cadangan. */
  onUnavailable?: () => void;
  error?: string;
  inputClassName: string;
  labelClassName: string;
}> = ({ value, onChange, onUnavailable, error, inputClassName, labelClassName }) => {
  const { t } = useTranslation('checkout');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SignedShippingDestination[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'done' | 'error'>('idle');
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  // Minimal 3 huruf dan jeda ketik 400 ms; server menyimpan hasil pencarian 24 jam per kata kunci.
  useEffect(() => {
    const q = query.trim();
    if (value || q.length < 3) {
      setResults([]);
      setStatus('idle');
      return undefined;
    }
    let active = true;
    setStatus('searching');
    const timer = setTimeout(() => {
      searchShippingDestinations(q)
        .then((list) => {
          if (!active) return;
          setResults(list);
          setStatus('done');
        })
        .catch((err) => {
          if (!active) return;
          setResults([]);
          setStatus('error');
          if (err instanceof ApiError && err.status === 503) onUnavailableRef.current?.();
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, value]);

  return (
    <div data-destination-search>
      <label className={labelClassName}>{t('printCheckout.destination.label')}</label>
      {value ? (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <span className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span data-destination-selected>{destinationDisplay(value)}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onChange(null);
            }}
            className="shrink-0 font-semibold text-emerald-800 underline hover:text-emerald-950"
          >
            {t('printCheckout.destination.change')}
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('printCheckout.destination.placeholder')}
            className={`${inputClassName} ${error ? 'border-red-500 bg-red-50/20' : ''}`}
          />
          {status === 'searching' && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />{t('printCheckout.destination.searching')}</p>
          )}
          {status === 'error' && (
            <p className="mt-1 text-[11px] text-red-600">
              {t('printCheckout.destination.error')}
              {onUnavailable && (
                <button type="button" onClick={onUnavailable} className="ml-1 font-semibold underline" data-manual-address>
                  {t('printCheckout.destination.manual')}
                </button>
              )}
            </p>
          )}
          {status === 'done' && results.length === 0 && <p className="mt-1 text-[11px] text-slate-500">{t('printCheckout.destination.noResults')}</p>}
          {results.length > 0 && (
            <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs shadow-sm" role="listbox">
              {results.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    data-destination-option
                    onClick={() => onChange(d)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  >
                    {destinationDisplay(d)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {status === 'idle' && !error && <p className="mt-1 text-[11px] text-slate-400">{t('printCheckout.destination.hint')}</p>}
        </>
      )}
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
    </div>
  );
};

export const CourierRateList: React.FC<{
  state: CourierRatesState;
  selected: ShippingRate | null;
  onSelect: (rate: ShippingRate) => void;
  onRetry: () => void;
  minCopies: number;
}> = ({ state, selected, onSelect, onRetry, minCopies }) => {
  const { t } = useTranslation('checkout');
  const { currency } = useFormatters();

  if (state.status === 'idle') return <p className="text-xs text-slate-500">{t('printCheckout.rates.pickDestination')}</p>;
  if (state.status === 'loading') {
    return <p className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('printCheckout.rates.loading')}</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-1.5 text-xs">
        <p className="text-red-600">{t('printCheckout.rates.error')}</p>
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold text-slate-700 underline hover:text-slate-900">
          <RefreshCw className="h-3 w-3" />{t('printCheckout.rates.retry')}
        </button>
      </div>
    );
  }
  if (state.status === 'estimate') {
    return (
      <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-shipping-estimate>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">{t('printCheckout.shippingEstimate', { zone: state.zoneName ?? '' })}</span>
          <span className="shrink-0 font-mono font-bold">{currency(state.fee ?? 0)}</span>
        </div>
        <p>{t('printCheckout.estimateNote')}</p>
      </div>
    );
  }
  if (state.status === 'manual') {
    return (
      <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900" data-shipping-manual>
        {state.reason === 'bulk' ? t('printCheckout.shippingManualNote', { min: minCopies }) : t('printCheckout.rates.manualNote')}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-courier-rates>
      <p className="text-xs font-bold text-slate-700">{t('printCheckout.rates.title')}</p>
      <div className="space-y-1.5">
        {state.rates.map((rate) => {
          const key = rateKey(rate);
          const checked = selected ? rateKey(selected) === key : false;
          const days = etdDays(rate.etd);
          return (
            <label
              key={key}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-2.5 text-xs transition-colors ${checked ? 'border-[#D4AF37] bg-amber-50/60 ring-1 ring-[#D4AF37]' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <span className="flex items-start gap-2">
                <input type="radio" name="courier-rate" value={key} checked={checked} onChange={() => onSelect(rate)} className="mt-0.5 accent-[#0F172A]" />
                <span>
                  <span className="block font-semibold text-slate-900">{rate.courierName} {rate.service}</span>
                  <span className="block text-[11px] text-slate-500">
                    {[rateDescription(rate), days ? t('printCheckout.rates.etd', { days }) : ''].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </span>
              <span className="shrink-0 font-mono font-bold text-slate-900">{currency(rate.cost)}</span>
            </label>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-400">
        {state.weightGram ? `${t('printCheckout.rates.weight', { kg: (state.weightGram / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 }) })} · ` : ''}
        {t('printCheckout.rates.source')}
      </p>
    </div>
  );
};
