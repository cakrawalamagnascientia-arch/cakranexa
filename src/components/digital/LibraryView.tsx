import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarClock, CreditCard, Library, LogIn, MonitorSmartphone, Receipt, Sparkles, X } from 'lucide-react';
import type { ActivePage, SubSection } from '../../types';
import { useMemberSession } from '../../services/memberSession';
import {
  getLibrary,
  listDigitalOrders,
  listMyDevices,
  releaseMyDevice,
  DigitalApiError,
  type DevicesOverview,
  type DigitalOrder,
  type LibraryItem
} from '../../services/digitalApi';
import { chooseMemberPick, getMembershipShelf, membershipErrorCode, type MembershipShelf, type ShelfCard } from '../../services/membershipApi';
import { goToAccountMembership, goToContact, goToDigitalCheckout, goToDigitalOrder, goToLibraryItem, goToMembership } from '../../services/digitalNavigation';
import { useDigitalCatalog } from '../../hooks/useDigitalCatalog';
import { useBookText, useFormatters } from '../../i18n/hooks';
import { resolveImageUrl } from '../../utils/imageUtils';
import { toTitleCase } from '../../utils/formatters';
import { FormatIcon } from './FormatIcon';
import { ComingSoonButton } from './ComingSoonButton';
import { useDigitalFormatters } from './useDigitalFormatters';

type NavigateFn = (page: ActivePage, subSection?: SubSection) => void;
type LibraryTab = 'shelf' | 'owned';

const STATUS_CLASS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-slate-200 text-slate-700',
  suspended: 'bg-amber-100 text-amber-800',
  no_entitlement: 'bg-slate-200 text-slate-700'
};

/** Satu judul di Pustaka Saya: sampul, status akses, progres, dan tombol baca/dengarkan. */
const LibraryCard: React.FC<{ item: LibraryItem }> = ({ item }) => {
  const { t } = useTranslation('digital');
  const { date } = useFormatters();
  const fmt = useDigitalFormatters();
  const bookText = useBookText();
  const catalogBook = useDigitalCatalog().findById(item.productId)?.book;
  const title = toTitleCase(catalogBook ? bookText.title(catalogBook) : item.title);
  const status = item.access.status ?? 'no_entitlement';
  const percent = Math.round(item.progress?.percent ?? 0);
  const entitlement = item.access.entitlement;

  let action: React.ReactNode;
  if (status === 'active' && item.ready) {
    const label = percent > 0 ? t('myLibrary.continue') : item.format === 'ebook' ? t('myLibrary.read') : t('myLibrary.listen');
    action = (
      <button
        type="button"
        id={`btn-library-open-${item.productId}`}
        onClick={() => goToLibraryItem(item.format, item.productId)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold-500 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-gold-600 cursor-pointer"
      >
        {label}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    );
  } else if (status === 'active') {
    action = <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600">{t('myLibrary.preparing')}</p>;
  } else if (status === 'suspended') {
    action = (
      <button type="button" onClick={goToContact} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
        {t('myLibrary.contact')}
      </button>
    );
  } else {
    action = (
      <button type="button" onClick={goToMembership} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
        {t('myLibrary.renew')}
      </button>
    );
  }

  return (
    <li id={`library-item-${item.productId}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
      <img
        src={resolveImageUrl(catalogBook?.coverBuku || item.coverUrl, 'book', item.bookId)}
        alt=""
        draggable={false}
        className="h-28 w-20 shrink-0 rounded-md border border-slate-100 bg-slate-50 object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-semibold text-gold-400">
            <FormatIcon format={item.format} className="h-3 w-3" />
            {fmt.formatLabel(item.format)}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${STATUS_CLASS[status] ?? STATUS_CLASS.no_entitlement}`}>
            {t(`myLibrary.status.${status}`)}
          </span>
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{title}</h3>
        <p className="line-clamp-1 text-xs text-slate-500">{item.author}</p>
        {entitlement && (
          <p className="mt-0.5 text-[11px] text-slate-500">
            {t(`myLibrary.source.${entitlement.source as 'purchase'}`)}
            {entitlement.endsAt ? ` · ${t('myLibrary.validUntil', { date: date(new Date(entitlement.endsAt)) })}` : ''}
          </p>
        )}
        {status === 'active' && percent > 0 && (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">{t('myLibrary.progress', { percent })}</p>
          </div>
        )}
        <div className="mt-auto pt-2">{action}</div>
      </div>
    </li>
  );
};

/** Judul rak (akses rak, Pick, atau "Segera masuk rak") dengan satu tombol aksi. */
const ShelfTile: React.FC<{ item: ShelfCard; note?: string; action: React.ReactNode }> = ({ item, note, action }) => {
  const fmt = useDigitalFormatters();
  const bookText = useBookText();
  const catalogBook = useDigitalCatalog().findById(item.productId)?.book;
  const title = toTitleCase(catalogBook ? bookText.title(catalogBook) : item.title);
  const { t } = useTranslation('digital');
  const percent = Math.round(item.progress?.percent ?? 0);
  return (
    <li id={`shelf-item-${item.productId}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
      <img src={resolveImageUrl(catalogBook?.coverBuku || item.coverUrl, 'book', item.bookId)} alt="" draggable={false} className="h-28 w-20 shrink-0 rounded-md border border-slate-100 bg-slate-50 object-cover" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="inline-flex w-fit items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-semibold text-gold-400">
          <FormatIcon format={item.format} className="h-3 w-3" />
          {fmt.formatLabel(item.format)}
        </span>
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{title}</h3>
        <p className="line-clamp-1 text-xs text-slate-500">{item.author}</p>
        {note && <p className="mt-0.5 text-[11px] text-slate-500">{note}</p>}
        {percent > 0 && <p className="mt-0.5 text-[10px] text-slate-500">{t('myLibrary.progress', { percent })}</p>}
        <div className="mt-auto pt-2">{action}</div>
      </div>
    </li>
  );
};

const openButton = (item: ShelfCard, label: string) => (
  <button
    type="button"
    id={`btn-shelf-open-${item.productId}`}
    onClick={() => goToLibraryItem(item.format, item.productId)}
    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold-500 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-gold-600 cursor-pointer"
  >
    {label}
    <ArrowRight className="h-3.5 w-3.5" />
  </button>
);

/** Tab "Rak Digital": seluruh rak (Professional/Author), Digital Member Pick (Reader), atau ajakan (Free Circle). */
const ShelfPanel: React.FC<{ onNavigate: NavigateFn; waitForMembership: boolean }> = ({ onNavigate, waitForMembership }) => {
  const { t } = useTranslation('digital');
  const { date, currency } = useFormatters();
  const bookText = useBookText();
  const catalog = useDigitalCatalog();
  const [shelf, setShelf] = useState<MembershipShelf | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setShelf(await getMembershipShelf());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Setelah pembayaran pertama, notifikasi Midtrans bisa tiba beberapa detik kemudian: muat ulang beberapa kali.
  useEffect(() => {
    if (!waitForMembership || !shelf || shelf.membership) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void load();
      if (attempts >= 5) window.clearInterval(timer);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [waitForMembership, shelf, load]);

  const choose = async (item: ShelfCard) => {
    if (!shelf?.pick.slot) return;
    const catalogBook = catalog.findById(item.productId)?.book;
    const title = toTitleCase(catalogBook ? bookText.title(catalogBook) : item.title);
    if (!window.confirm(t('myLibrary.pick.confirm', { title, date: date(new Date(shelf.pick.slot.end)) }))) return;
    setBusy(item.productId);
    setPickError(null);
    try {
      await chooseMemberPick(item.productId);
      await load();
    } catch (err) {
      setPickError(membershipErrorCode(err));
    } finally {
      setBusy(null);
    }
  };

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        <p>{t('myLibrary.shelf.loadError')}</p>
        <button type="button" onClick={() => void load()} className="mt-2 font-semibold underline cursor-pointer">{t('myLibrary.retry')}</button>
      </div>
    );
  }
  if (!shelf) return <p role="status" className="text-sm text-slate-500">{t('myLibrary.loading')}</p>;

  const pick = shelf.pick;
  const currentPick = pick.current ? pick.options.find((o) => o.productId === pick.current!.productId) ?? null : null;

  return (
    <div className="space-y-6">
      {shelf.access === 'full' && (
        <section id="library-shelf">
          <h2 className="text-base font-bold text-slate-900">{t('myLibrary.shelf.fullTitle')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('myLibrary.shelf.fullDescription', { date: shelf.accessEndsAt ? date(new Date(shelf.accessEndsAt)) : '—' })}</p>
          {shelf.items.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t('myLibrary.shelf.empty')}</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shelf.items.map((item) => (
                <ShelfTile key={item.productId} item={item} action={openButton(item, (item.progress?.percent ?? 0) > 0 ? t('myLibrary.continue') : item.format === 'ebook' ? t('myLibrary.read') : t('myLibrary.listen'))} />
              ))}
            </ul>
          )}
        </section>
      )}

      {shelf.access !== 'full' && pick.enabled && pick.slot && (
        <section id="library-pick">
          <h2 className="text-base font-bold text-slate-900">{t('myLibrary.pick.title')}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {t('myLibrary.pick.description', { start: date(new Date(pick.slot.start)), end: date(new Date(pick.slot.end)) })}
          </p>
          {pickError && (
            <p role="alert" className="mt-2 text-sm text-rose-700">
              {['pick_locked', 'not_on_shelf', 'pick_unavailable'].includes(pickError) ? t(`myLibrary.pick.errors.${pickError as 'pick_locked'}`) : t('access.error.generic')}
            </p>
          )}
          {pick.current ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {currentPick ? (
                <ShelfTile
                  item={currentPick}
                  note={t('myLibrary.pick.locked', { date: date(new Date(pick.current.periodEnd)) })}
                  action={openButton(currentPick, currentPick.format === 'ebook' ? t('myLibrary.read') : t('myLibrary.listen'))}
                />
              ) : (
                <li className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{t('myLibrary.pick.locked', { date: date(new Date(pick.current.periodEnd)) })}</li>
              )}
            </ul>
          ) : pick.options.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t('myLibrary.shelf.empty')}</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pick.options.map((item) => (
                <ShelfTile
                  key={item.productId}
                  item={item}
                  action={(
                    <button
                      type="button"
                      id={`btn-pick-${item.productId}`}
                      disabled={busy !== null}
                      onClick={() => void choose(item)}
                      className="w-full rounded-lg border border-gold-500 px-3 py-2 text-xs font-bold text-slate-900 transition-colors hover:bg-gold-500/10 disabled:opacity-60 cursor-pointer"
                    >
                      {t('myLibrary.pick.choose')}
                    </button>
                  )}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {shelf.access === 'none' && !pick.enabled && (
        <section id="library-shelf-none" className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <Library className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-slate-900">{t('myLibrary.shelf.noneTitle')}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t('myLibrary.shelf.noneDescription')}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" id="btn-shelf-membership" onClick={goToMembership} className="rounded-lg bg-gold-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-gold-600 cursor-pointer">
              {t('myLibrary.shelf.noneCta')}
            </button>
            <button type="button" onClick={() => onNavigate('digital', 'ebook')} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              {t('myLibrary.shelf.browseSamples')}
            </button>
          </div>
        </section>
      )}

      {shelf.upcoming.length > 0 && (
        <section id="library-upcoming">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <CalendarClock className="h-5 w-5 text-gold-700" aria-hidden="true" />
            {t('myLibrary.upcoming.title')}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{t('myLibrary.upcoming.description')}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shelf.upcoming.map((item) => (
              <ShelfTile
                key={item.productId}
                item={item}
                note={item.shelfEntryDate ? t('myLibrary.upcoming.entry', { date: date(new Date(`${item.shelfEntryDate}T00:00:00+07:00`)) }) : undefined}
                action={item.purchasable ? (
                  <button type="button" onClick={() => goToDigitalCheckout([item.productId])} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
                    {t('myLibrary.upcoming.buy', { price: currency(item.price) })}
                  </button>
                ) : null}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

/** Onboarding singkat setelah pembayaran keanggotaan pertama (/library?welcome=1). */
const WelcomePanel: React.FC<{ maxDevices: number; onDismiss: () => void }> = ({ maxDevices, onDismiss }) => {
  const { t } = useTranslation('digital');
  const steps = [
    { icon: Library, title: t('myLibrary.onboarding.step1Title'), body: t('myLibrary.onboarding.step1') },
    { icon: MonitorSmartphone, title: t('myLibrary.onboarding.step2Title'), body: t('myLibrary.onboarding.step2', { n: maxDevices }) },
    { icon: CreditCard, title: t('myLibrary.onboarding.step3Title'), body: t('myLibrary.onboarding.step3') }
  ];
  return (
    <section id="library-welcome" className="relative mt-6 rounded-2xl border border-gold-500/40 bg-gold-500/5 p-5">
      <button type="button" onClick={onDismiss} aria-label={t('myLibrary.onboarding.dismiss')} className="absolute right-3 top-3 rounded p-1 text-slate-500 hover:bg-white cursor-pointer">
        <X className="h-4 w-4" />
      </button>
      <h2 className="flex items-center gap-2 pr-8 text-base font-bold text-slate-900">
        <Sparkles className="h-5 w-5 text-gold-700" aria-hidden="true" />
        {t('myLibrary.onboarding.title')}
      </h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-500 text-xs font-bold text-slate-950">{index + 1}</span>
              <Icon className="h-4 w-4 text-gold-700" aria-hidden="true" />
              {title}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onDismiss} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer">{t('myLibrary.onboarding.dismiss')}</button>
        <button type="button" onClick={() => goToAccountMembership()} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-white cursor-pointer">{t('myLibrary.manageMembership')}</button>
      </div>
    </section>
  );
};

/** Perangkat terdaftar + pelepasan (maks. sekali per 30 hari). */
const DevicesPanel: React.FC = () => {
  const { t } = useTranslation('digital');
  const { date } = useFormatters();
  const [overview, setOverview] = useState<DevicesOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyDevices().then(setOverview).catch(() => setOverview(null));
  }, []);

  if (!overview) return null;
  const release = async (deviceId: string) => {
    setBusy(deviceId);
    setError(null);
    try {
      setOverview(await releaseMyDevice(deviceId));
    } catch (err) {
      setError(err instanceof DigitalApiError ? err.code : 'unknown');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="library-devices" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
        <MonitorSmartphone className="h-5 w-5 text-gold-700" aria-hidden="true" />
        {t('myLibrary.devicesTitle')}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t('myLibrary.devicesSummary', { used: overview.devices.length, max: overview.maxDevices })}</p>
      {overview.devices.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">{t('myLibrary.devicesEmpty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
          {overview.devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 [overflow-wrap:anywhere]">
                  {d.label}
                  {d.isCurrent && <span className="ml-2 text-xs font-normal text-gold-700">{t('access.deviceLimit.current')}</span>}
                </p>
                <p className="text-xs text-slate-500">{t('access.deviceLimit.lastSeen', { date: date(new Date(d.lastSeen)) })}</p>
              </div>
              <button
                type="button"
                onClick={() => void release(d.id)}
                disabled={Boolean(overview.releaseAvailableAt) || busy !== null}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {busy === d.id ? t('access.deviceLimit.releasing') : t('access.deviceLimit.release')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {overview.releaseAvailableAt
          ? t('access.deviceLimit.cooldown', { date: date(new Date(overview.releaseAvailableAt)) })
          : t('access.deviceLimit.cooldownNote', { days: overview.cooldownDays })}
      </p>
      {error && <p role="alert" className="mt-1 text-xs text-rose-600">{error === 'release_cooldown' ? t('access.deviceLimit.cooldownNote', { days: overview.cooldownDays }) : t('access.error.generic')}</p>}
    </section>
  );
};

/** Riwayat pembelian digital. */
const OrdersPanel: React.FC = () => {
  const { t } = useTranslation('digital');
  const { currency, date } = useFormatters();
  const [orders, setOrders] = useState<DigitalOrder[] | null>(null);

  useEffect(() => {
    listDigitalOrders().then((res) => setOrders(res.orders)).catch(() => setOrders(null));
  }, []);

  if (!orders) return null;
  return (
    <section id="library-orders" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
        <Receipt className="h-5 w-5 text-gold-700" aria-hidden="true" />
        {t('myLibrary.ordersTitle')}
      </h2>
      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">{t('myLibrary.ordersEmpty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100 text-sm">
          {orders.map((order) => (
            <li key={order.orderNumber} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-mono text-xs text-slate-700">{order.orderNumber}</p>
                <p className="text-xs text-slate-500 [overflow-wrap:anywhere]">{date(new Date(order.createdAt))} · {order.items.map((i) => i.title).join(', ')}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-900">{currency(order.amount)}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">{t(`myLibrary.orderStatus.${order.status}`)}</span>
                <button type="button" onClick={() => goToDigitalOrder(order.orderNumber)} className="text-xs font-semibold text-gold-700 hover:underline cursor-pointer">
                  {t('myLibrary.viewOrder')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

interface LibraryViewProps {
  onNavigate: NavigateFn;
}

const welcomeRequested = () => {
  try {
    return new URLSearchParams(window.location.search).get('welcome') === '1';
  } catch {
    return false;
  }
};

/**
 * Halaman /library (Pustaka Saya): tab "Rak Digital" (akses keanggotaan: rak penuh, Digital Member Pick, dan
 * "Segera masuk rak") dan tab "Milik Saya" (pembelian satuan & hak per judul), perangkat, dan riwayat pembelian.
 */
export const LibraryView: React.FC<LibraryViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation('digital');
  const member = useMemberSession();
  // Flag fase 2 mati (DIGITAL_ENABLED, bukan email beta): halaman tampil seperti fase 1 dengan placeholder "Segera hadir".
  const digitalEnabled = useDigitalCatalog().enabled;
  const showMember = member.isLoggedIn && digitalEnabled;
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [maxDevices, setMaxDevices] = useState(2);
  const [loadError, setLoadError] = useState(false);
  const [welcome, setWelcome] = useState(welcomeRequested);
  const [tab, setTab] = useState<LibraryTab>('shelf');

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const library = await getLibrary();
      setItems(library.items);
      setMaxDevices(library.devices.max);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (showMember) void load();
    else setItems(null);
  }, [showMember, member.userId, load]);

  const emptyState = (
    <div id="library-empty" className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <Library className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
      <h2 className="mt-3 text-base font-bold text-slate-900">{t('library.emptyTitle')}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t('library.emptyDescription')}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => onNavigate('digital', 'ebook')} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer">
          {t('library.browseEbooks')}
        </button>
        <button type="button" onClick={() => onNavigate('digital', 'audiobook')} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
          {t('library.browseAudiobooks')}
        </button>
      </div>
    </div>
  );

  const tabButton = (value: LibraryTab) => (
    <button
      key={value}
      type="button"
      role="tab"
      id={`library-tab-${value}`}
      aria-selected={tab === value}
      aria-controls={`library-panel-${value}`}
      onClick={() => setTab(value)}
      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${tab === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
    >
      {t(`myLibrary.tabs.${value}`)}
    </button>
  );

  return (
    <div id="library-page" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold-700">
            <Library className="h-3.5 w-3.5" aria-hidden="true" />
            {t('library.badge')}
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{t('library.title')}</h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">{t('library.subtitle')}</p>
        </div>
        {showMember && (
          <button type="button" id="btn-library-account-membership" onClick={() => goToAccountMembership()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
            <CreditCard className="h-3.5 w-3.5" />
            {t('myLibrary.manageMembership')}
          </button>
        )}
      </header>

      {showMember && welcome && <WelcomePanel maxDevices={maxDevices} onDismiss={() => setWelcome(false)} />}

      {!showMember && !member.isLoading && (
        <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <LogIn className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">{t('library.signInTitle')}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('library.signInDescription')}</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-56 sm:shrink-0">
            {digitalEnabled ? (
              <>
                <button
                  type="button"
                  id="btn-library-sign-in"
                  onClick={() => onNavigate('account', 'login')}
                  className="rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-gold-600 cursor-pointer"
                >
                  {t('account.loginCta')}
                </button>
                <button
                  type="button"
                  id="btn-library-register"
                  onClick={() => onNavigate('account', 'register')}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  {t('account.registerCta')}
                </button>
              </>
            ) : (
              <>
                <ComingSoonButton id="btn-library-sign-in" label={t('account.loginCta')} size="md" />
                <ComingSoonButton id="btn-library-register" label={t('account.registerCta')} size="md" />
              </>
            )}
          </div>
        </section>
      )}

      {!showMember && <section className="mt-6">{emptyState}</section>}

      {showMember && (
        <>
          <div role="tablist" aria-label={t('library.title')} className="mt-6 inline-flex gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-xs">
            {(['shelf', 'owned'] as const).map(tabButton)}
          </div>
          <section id={`library-panel-${tab}`} role="tabpanel" aria-labelledby={`library-tab-${tab}`} className="mt-5" aria-live="polite">
            {tab === 'shelf' ? (
              <ShelfPanel onNavigate={onNavigate} waitForMembership={welcome} />
            ) : loadError ? (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
                <p>{t('myLibrary.loadError')}</p>
                <button type="button" onClick={() => void load()} className="mt-2 font-semibold underline cursor-pointer">{t('myLibrary.retry')}</button>
              </div>
            ) : items === null ? (
              <p role="status" className="text-sm text-slate-500">{t('myLibrary.loading')}</p>
            ) : items.length === 0 ? (
              emptyState
            ) : (
              <ul id="library-items" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => <LibraryCard key={item.productId} item={item} />)}
              </ul>
            )}
          </section>
        </>
      )}

      {showMember && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <DevicesPanel />
          <OrdersPanel />
        </div>
      )}

      {/* Promosi keanggotaan */}
      <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-navy-900 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{t('library.promoTitle')}</h2>
          <p className="mt-1 text-sm text-slate-300">{t('library.promoDescription')}</p>
        </div>
        <button
          type="button"
          id="btn-library-membership"
          onClick={() => onNavigate('membership')}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gold-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-gold-600 cursor-pointer"
        >
          {t('library.promoCta')}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>
    </div>
  );
};
