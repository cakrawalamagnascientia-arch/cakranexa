import React from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, ShoppingCart } from 'lucide-react';
import type { DigitalProduct } from '../../types';
import { goToDigitalCheckout, goToMembership } from '../../services/digitalNavigation';
import { useDigitalFeature } from '../../services/digitalFeature';
import { useDigitalCatalog } from '../../hooks/useDigitalCatalog';
import { ComingSoonButton } from './ComingSoonButton';
import { useDigitalFormatters } from './useDigitalFormatters';

interface BuyDigitalButtonProps {
  product: Pick<DigitalProduct, 'id' | 'format' | 'price'>;
  id?: string;
  size?: 'sm' | 'md';
  /** Latar tempat tombol berada (dipakai placeholder "Segera hadir"). */
  tone?: 'light' | 'dark';
  className?: string;
}

/**
 * Tombol "Beli E-Book/Audiobook" -> halaman checkout digital.
 * Flag fase 2 mati (DIGITAL_ENABLED, bukan email beta): tampil seperti fase 1, "Segera hadir".
 * Fase 6: pembelian satuan ditutup lewat payment_routing -> tombol menjadi "Lihat paket" (/membership).
 * Harga 0 ("Harga menyusul") belum bisa dibeli; server juga menolaknya.
 */
export const BuyDigitalButton: React.FC<BuyDigitalButtonProps> = ({ product, id, size = 'sm', tone = 'light', className = '' }) => {
  const { t } = useTranslation('digital');
  const fmt = useDigitalFormatters();
  const { enabled } = useDigitalCatalog();
  const { unitSales } = useDigitalFeature();
  const label = t('common.buyFormat', { format: fmt.formatLabel(product.format) });
  if (!enabled) return <ComingSoonButton id={id} label={label} tone={tone} size={size} className={className} />;

  const sizeClass = size === 'md' ? 'min-h-11 px-4 py-2 text-sm' : 'min-h-8.5 px-2 py-1.5 text-[11px] sm:text-xs';
  if (!unitSales) {
    return (
      <button
        type="button"
        id={id}
        data-unit-sales="off"
        onClick={goToMembership}
        className={`inline-flex w-full flex-wrap items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] font-bold text-slate-950 shadow-xs transition-colors hover:bg-[#c5a059] cursor-pointer ${sizeClass} ${className}`}
      >
        <Crown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="[overflow-wrap:anywhere]">{t('common.viewPlans')}</span>
      </button>
    );
  }
  const purchasable = product.price > 0;
  return (
    <button
      type="button"
      id={id}
      disabled={!purchasable}
      onClick={() => goToDigitalCheckout([product.id])}
      className={`inline-flex w-full flex-wrap items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] font-bold text-slate-950 shadow-xs transition-colors hover:bg-[#c5a059] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${sizeClass} ${className}`}
    >
      <ShoppingCart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="[overflow-wrap:anywhere]">{label}</span>
    </button>
  );
};
