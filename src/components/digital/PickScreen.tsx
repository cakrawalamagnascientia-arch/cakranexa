import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpenCheck, Check, Loader2, Search } from 'lucide-react';
import type { ActivePage, SubSection } from '../../types';
import { useFormatters } from '../../i18n/hooks';
import { useMemberSession } from '../../services/memberSession';
import { chooseMemberPick, getMemberPicks, membershipErrorCode, type PickOptions, type ShelfCard } from '../../services/membershipApi';
import { goToLibrary, goToLibraryItem, goToLogin, goToMembership } from '../../services/digitalNavigation';
import { resolveImageUrl, handleImageError } from '../../utils/imageUtils';

interface PickScreenProps {
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
}

/**
 * /library/pick (fase 6 Langkah 4): "Pilih buku bulan ini" untuk paket berjatah (Silver/Gold).
 * Penghitung x dari y, konfirmasi yang mengunci pilihan, dan penjelasan kapan jatah berikutnya terbuka.
 * Platinum dan instansi tidak memerlukan layar ini (seluruh rak terbuka).
 */
export const PickScreen: React.FC<PickScreenProps> = ({ onNavigate }) => {
  const { t } = useTranslation('digital');
  const { date } = useFormatters();
  const member = useMemberSession();
  const [state, setState] = useState<PickOptions | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState<ShelfCard | null>(null);
  const [working, setWorking] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await getMemberPicks());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (member.isLoading || !member.isLoggedIn) return;
    void load();
  }, [load, member.isLoading, member.isLoggedIn]);

  const pickedIds = useMemo(() => new Set((state?.picks ?? []).map((p) => p.productId)), [state]);
  const options = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = state?.options ?? [];
    return query ? list.filter((o) => `${o.title} ${o.author}`.toLowerCase().includes(query)) : list;
  }, [state, search]);

  const confirm = async () => {
    if (!confirming) return;
    setWorking(true);
    setErrorText(null);
    try {
      await chooseMemberPick(confirming.productId);
      const product = confirming;
      setConfirming(null);
      await load();
      goToLibraryItem(product.format, product.productId);
    } catch (err) {
      const code = membershipErrorCode(err);
      setErrorText(t(`detail.access.pickErrors.${code}`, { defaultValue: t('detail.access.pickErrors.default') }));
      await load();
    } finally {
      setWorking(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div id="pick-screen" className="mx-auto max-w-6xl px-4 py-8 text-left sm:px-6 lg:px-8 md:py-12">{children}</div>
  );
  const card = 'rounded-2xl border border-cream-200 bg-white p-5 shadow-sm sm:p-6';

  if (!member.isLoading && !member.isLoggedIn) {
    return shell(
      <div className={card}>
        <h1 className="text-xl font-bold text-slate-900">{t('membershipCheckout.loginTitle')}</h1>
        <button type="button" onClick={() => goToLogin()} className="mt-4 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-bold text-navy-950 cursor-pointer">{t('account.loginCta')}</button>
      </div>
    );
  }
  if (!state && !failed) {
    return shell(<p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('myLibrary.loading')}</p>);
  }
  if (failed || !state?.enabled || state.mode !== 'quota' || !state.slot) {
    return shell(
      <div className={card} id="pick-not-needed">
        <BookOpenCheck className="h-7 w-7 text-gold-700" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{t('pick.notNeededTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('pick.notNeededBody')}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={goToLibrary} className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-bold text-navy-950 cursor-pointer">{t('myLibrary.openLibrary')}</button>
          <button type="button" onClick={() => onNavigate('membership')} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 cursor-pointer">{t('detail.availability.comparePlans')}</button>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, state.limit - state.used);
  const resetsAt = date(new Date(state.slot.end));

  return shell(
    <>
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('pick.title')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('pick.subtitle', { date: resetsAt })}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
        <p id="pick-counter" className="text-sm font-semibold text-slate-900">{t('pick.counter', { used: state.used, limit: state.limit })}</p>
        <p className="text-xs text-slate-600">{remaining > 0 ? t('pick.remaining', { count: remaining }) : t('pick.full', { date: resetsAt })}</p>
      </div>

      {remaining > 0 && (
        <label className="mt-4 flex items-center gap-2 rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            id="pick-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('pick.searchPlaceholder')}
            className="w-full bg-transparent outline-none"
          />
        </label>
      )}

      {confirming && (
        <div id="pick-confirm" role="dialog" aria-modal="false" className="mt-4 rounded-2xl border border-gold-500 bg-gold-500/10 p-5">
          <h2 className="text-sm font-bold text-slate-900">{t('pick.confirmTitle', { title: confirming.title })}</h2>
          <p className="mt-1 text-xs text-slate-700">{t('pick.confirmBody', { date: resetsAt, used: state.used + 1, limit: state.limit })}</p>
          {errorText && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{errorText}</p>}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="button" id="btn-pick-confirm" disabled={working} onClick={() => void confirm()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-bold text-navy-950 disabled:opacity-60 cursor-pointer">
              {working && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('pick.confirmYes')}
            </button>
            <button type="button" disabled={working} onClick={() => setConfirming(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 cursor-pointer">{t('pick.confirmNo')}</button>
          </div>
        </div>
      )}

      <ul id="pick-options" className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
        {options.map((option) => {
          const picked = pickedIds.has(option.productId);
          return (
            <li key={option.productId} data-picked={picked ? 'true' : 'false'} className="flex flex-col">
              <div className="overflow-hidden rounded-xl border border-cream-200 bg-white">
                <div className="aspect-[2/3] overflow-hidden bg-cream-100">
                  <img
                    src={resolveImageUrl(option.coverUrl, 'book', option.bookId)}
                    alt={t('common.coverAlt', { title: option.title })}
                    onError={(e) => handleImageError(e, { title: option.title, author: option.author }, 'book')}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">{option.title}</p>
              <p className="text-xs text-slate-500">{option.author}</p>
              {picked ? (
                <button
                  type="button"
                  onClick={() => goToLibraryItem(option.format, option.productId)}
                  className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('pick.opened')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={remaining === 0}
                  onClick={() => { setErrorText(null); setConfirming(option); }}
                  className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-navy-950 px-3 py-2 text-xs font-bold text-cream-50 transition-colors hover:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  {t('pick.choose')}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {options.length === 0 && <p className="mt-6 text-sm text-slate-600">{t('pick.empty')}</p>}

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={goToLibrary} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 cursor-pointer">{t('myLibrary.openLibrary')}</button>
        <button type="button" onClick={goToMembership} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 cursor-pointer">{t('pick.upgrade')}</button>
      </div>
    </>
  );
};
