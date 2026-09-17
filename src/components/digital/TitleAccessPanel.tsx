import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpenCheck, CalendarClock, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react';
import type { DigitalProduct } from '../../types';
import { useTitleStatus } from '../../hooks/useTitleStatus';
import { chooseMemberPick, membershipErrorCode } from '../../services/membershipApi';
import {
  goToAccountMembership,
  goToContact,
  goToLibraryItem,
  goToLogin,
  goToMembership
} from '../../services/digitalNavigation';
import { titleAccessView, type TitleAction, type TitleActionKind } from '../../data/titleAccess';
import { FormatIcon } from './FormatIcon';
import { useDigitalFormatters } from './useDigitalFormatters';

interface TitleAccessPanelProps {
  product: DigitalProduct;
  hasSample: boolean;
  onOpenSample: () => void;
}

const DATE_PARAMS = ['date'] as const;

/**
 * Kartu aksi halaman buku digital (fase 6 Langkah 3). Tombol utama mengikuti status pengguna untuk judul ini:
 * sampel, buka dengan jatah (x dari y, dengan konfirmasi karena jatah terkunci), baca/dengarkan sekarang,
 * tersedia untuk paket Anda pada <tanggal>, atau upgrade. Tidak ada pembelian satuan.
 */
export const TitleAccessPanel: React.FC<TitleAccessPanelProps> = ({ product, hasSample, onOpenSample }) => {
  const { t } = useTranslation('digital');
  const fmt = useDigitalFormatters();
  const { state, reload } = useTitleStatus(product.id);
  const [confirming, setConfirming] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const format = product.format;
  const view = titleAccessView({ state, format, hasSample });

  const localized = (params?: Record<string, string | number>) => {
    if (!params) return undefined;
    const out: Record<string, string | number> = { ...params };
    for (const key of DATE_PARAMS) if (typeof out[key] === 'string') out[key] = fmt.isoDate(out[key] as string);
    return out;
  };

  const run = (kind: TitleActionKind) => {
    switch (kind) {
      case 'sample': return onOpenSample();
      case 'startFree': return goToLogin(window.location.pathname, 'register');
      case 'open': return goToLibraryItem(format, product.id);
      case 'pick':
        setPickError(null);
        return setConfirming(true);
      case 'plans':
      case 'upgrade': return goToMembership();
      case 'renew': return goToAccountMembership();
      case 'contact': return goToContact();
    }
  };

  const confirmPick = async () => {
    setPicking(true);
    setPickError(null);
    try {
      await chooseMemberPick(product.id);
      setConfirming(false);
      reload();
      goToLibraryItem(format, product.id);
    } catch (err) {
      const code = membershipErrorCode(err);
      setPickError(t(`detail.access.pickErrors.${code}`, { defaultValue: t('detail.access.pickErrors.default') }));
      reload();
    } finally {
      setPicking(false);
    }
  };

  const label = (action: TitleAction) => t(`detail.access.actions.${action.key}`, localized(action.params));
  const primaryClass = 'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gold-500 px-4 py-3 text-sm font-bold text-navy-950 transition-colors hover:bg-gold-400 disabled:opacity-60 cursor-pointer';
  const secondaryClass = 'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cream-200/30 px-4 py-2.5 text-sm font-semibold text-cream-50 transition-colors hover:bg-white/10 cursor-pointer';
  const notice = view.notice;
  const NoticeIcon = notice?.tone === 'success' ? CheckCircle2 : notice?.tone === 'warning' ? TriangleAlert : notice?.key === 'opensOn' ? CalendarClock : Info;
  const noticeTone = notice?.tone === 'success'
    ? 'bg-emerald-500/10 text-emerald-200'
    : notice?.tone === 'warning'
      ? 'bg-amber-500/10 text-amber-200'
      : 'bg-white/5 text-cream-200';

  return (
    <section id="digital-access-panel" aria-live="polite" className="rounded-2xl border border-navy-800 bg-navy-950 p-5 text-cream-50 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gold-400">
        <FormatIcon format={format} className="h-4 w-4" />
        {t('detail.access.title', { format: fmt.formatLabel(format) })}
      </div>

      {notice && (
        <p id="digital-access-notice" data-status={notice.key} className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${noticeTone}`}>
          <NoticeIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t(`detail.access.notices.${notice.key}`, localized(notice.params))}</span>
        </p>
      )}

      {confirming ? (
        <div id="digital-pick-confirm" className="mt-4 rounded-xl border border-gold-500/40 bg-gold-500/10 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold">
            <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" aria-hidden="true" />
            {t('detail.access.confirm.title')}
          </p>
          <p className="mt-1 text-xs text-cream-200">{t('detail.access.confirm.body')}</p>
          {pickError && <p role="alert" className="mt-2 text-xs font-semibold text-amber-200">{pickError}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" id="btn-digital-pick-confirm" onClick={() => void confirmPick()} disabled={picking} className={primaryClass}>
              {picking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('detail.access.confirm.yes')}
            </button>
            <button type="button" id="btn-digital-pick-cancel" onClick={() => setConfirming(false)} disabled={picking} className={secondaryClass}>
              {t('detail.access.confirm.no')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {view.loading && (
            <div role="status" className="flex items-center justify-center gap-2 rounded-lg bg-white/5 py-3 text-sm text-cream-200">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('detail.access.loading')}
            </div>
          )}
          {view.primary && (
            <button type="button" id={`btn-digital-access-${view.primary.kind}`} onClick={() => run(view.primary!.kind)} className={primaryClass}>
              {label(view.primary)}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {view.secondary.length > 0 && (
            <div className={`grid gap-2 ${view.secondary.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {view.secondary.map((action) => (
                <button key={action.kind + action.key} type="button" id={`btn-digital-access-${action.kind}`} onClick={() => run(action.kind)} className={secondaryClass}>
                  {label(action)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
