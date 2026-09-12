import React from 'react';
import { useTranslation } from 'react-i18next';

interface ComingSoonButtonProps {
  /** Aksi yang nanti dilakukan tombol ini, mis. "Beli E-Book" atau "Pilih paket". */
  label: string;
  icon?: React.ReactNode;
  id?: string;
  /** light = di atas latar putih, dark = di atas panel gelap. */
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Placeholder untuk aksi fase 2 (beli produk digital, daftar keanggotaan, login anggota).
 * Selalu nonaktif dan berlabel "Segera hadir" agar tidak tampak berfungsi.
 *
 * TODO: phase-2 — ganti setiap pemakaian dengan tombol aksi sungguhan (checkout digital,
 * pendaftaran keanggotaan, login anggota).
 */
export const ComingSoonButton: React.FC<ComingSoonButtonProps> = ({
  label,
  icon,
  id,
  tone = 'light',
  size = 'sm',
  className = ''
}) => {
  const { t } = useTranslation('digital');
  const soon = t('common.comingSoonPhase2');
  const toneClass = tone === 'dark'
    ? 'border-slate-600 bg-slate-800/60 text-slate-300'
    : 'border-slate-300 bg-slate-50 text-slate-500';
  const sizeClass = size === 'md' ? 'min-h-11 px-4 py-2 text-sm' : 'min-h-8.5 px-2 py-1.5 text-[11px] sm:text-xs';

  return (
    <button
      type="button"
      id={id}
      disabled
      aria-disabled="true"
      data-phase="2"
      title={`${label} · ${soon}`}
      className={`inline-flex w-full cursor-not-allowed flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-lg border border-dashed font-semibold ${toneClass} ${sizeClass} ${className}`}
    >
      {icon}
      <span className="[overflow-wrap:anywhere]">{label}</span>
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
        {soon}
      </span>
    </button>
  );
};
