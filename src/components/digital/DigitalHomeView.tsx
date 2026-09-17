import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Headphones, Pause, SkipBack, SkipForward } from 'lucide-react';
import type { BookCategory } from '../../types';
import { useDigitalCatalog, type DigitalEntry } from '../../hooks/useDigitalCatalog';
import { useShelfRules } from '../../hooks/useShelfRules';
import { useMembershipPlans } from '../../hooks/useMembershipPlans';
import { useBookText, useCategoryLabel } from '../../i18n/hooks';
import { useMemberSession } from '../../services/memberSession';
import { getContinueReading, getPopularProductIds, type ContinueItem } from '../../services/digitalApi';
import { goToDigitalListing, goToLibrary, goToLibraryItem, goToLogin, goToMembership } from '../../services/digitalNavigation';
import { resolveImageUrl } from '../../utils/imageUtils';
import { toTitleCase } from '../../utils/formatters';
import { categoryShelves, comingSoon, inclusionBadge, isShelfTitle, newArrivals, popularEntries } from '../../data/digitalShelf';
import { DigitalShelfCard } from './DigitalShelfCard';
import { Shelf } from './Shelf';

const CATEGORIES: BookCategory[] = ['Perpajakan', 'Akuntansi', 'Hukum', 'Ekonomi & Bisnis', 'Filsafat', 'Teologia'];
/** Poin "sync" hanya tampil bila flag ENABLE_CROSS_FORMAT_SYNC aktif; selain itu diganti poin jatah. */
const BENEFITS = ['shelf', 'samples', 'devices', 'sync', 'print'] as const;
const SHELF_LIMIT = 18;

interface DigitalHomeViewProps {
  onOpenProduct: (entry: DigitalEntry) => void;
}

/** Mockup ponsel (HTML/CSS) dengan sampul CakraNexa asli: tampilan reader dan pemutar audio mini. */
const PhoneMockup: React.FC<{ entry: DigitalEntry | null }> = ({ entry }) => {
  const { t } = useTranslation('digital');
  const bookText = useBookText();
  const title = entry ? toTitleCase(bookText.title(entry.book)) : 'CakraNexa';
  return (
    <div aria-hidden="true" className="relative mx-auto w-56 sm:w-64">
      <div className="absolute -inset-6 rounded-[3rem] bg-gold-500/15 blur-2xl" />
      <div className="relative rounded-[2.5rem] border-[10px] border-navy-950 bg-navy-950 shadow-2xl">
        <div className="mx-auto mb-1 h-1.5 w-16 rounded-full bg-navy-800" />
        <div className="overflow-hidden rounded-[1.8rem] bg-cream-50">
          <div className="px-4 pb-3 pt-4">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gold-700">{t('home.hero.mockupReading')}</p>
            <div className="mt-2 aspect-[2/3] w-full overflow-hidden rounded-lg shadow-lg ring-1 ring-navy-900/10">
              {entry && <img src={resolveImageUrl(entry.book.coverBuku, 'book', entry.book.id)} alt="" className="h-full w-full object-cover" />}
            </div>
            <p className="font-heading mt-3 line-clamp-2 text-sm font-semibold leading-snug text-navy-900">{title}</p>
            <p className="text-[10px] text-slate-500">{t('home.hero.mockupChapter', { number: 3 })}</p>
            <div className="mt-2 h-1 rounded-full bg-cream-200">
              <div className="h-full w-2/5 rounded-full bg-gold-500" />
            </div>
          </div>
          <div className="flex items-center justify-between bg-navy-900 px-4 py-3 text-cream-50">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold">
              <Headphones className="h-3.5 w-3.5 text-gold-400" />
              {t('home.hero.mockupListening')}
            </span>
            <span className="flex items-center gap-2 text-gold-400">
              <SkipBack className="h-3.5 w-3.5" />
              <Pause className="h-4 w-4" />
              <SkipForward className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Beranda /digital (fase 6 Langkah 2): hero dua baris, 5 manfaat, "Mulai gratis" + "Lihat paket", mockup ponsel, lalu rak:
 * Lanjutkan membaca (login), Baru masuk rak, Populer bulan ini, per kategori, Segera masuk rak (tanggal paket pengguna).
 */
export const DigitalHomeView: React.FC<DigitalHomeViewProps> = ({ onOpenProduct }) => {
  const { t } = useTranslation('digital');
  const categoryLabel = useCategoryLabel();
  const member = useMemberSession();
  const catalog = useDigitalCatalog();
  const rules = useShelfRules();
  const { data: membership } = useMembershipPlans();
  const benefits = BENEFITS.map((key) => (key === 'sync' && !membership.flags.crossFormatSync ? 'quota' as const : key));
  const [popularIds, setPopularIds] = useState<string[]>([]);
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);

  useEffect(() => {
    let active = true;
    void getPopularProductIds().then((ids) => {
      if (active) setPopularIds(ids);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!member.isLoggedIn || !catalog.enabled) {
      setContinueItems([]);
      return;
    }
    let active = true;
    getContinueReading()
      .then((res) => {
        if (active) setContinueItems(res.items);
      })
      .catch(() => {
        if (active) setContinueItems([]);
      });
    return () => {
      active = false;
    };
  }, [member.isLoggedIn, member.userId, catalog.enabled]);

  const entries = catalog.entries;
  const badgeOf = (entry: DigitalEntry) => inclusionBadge(entry.product, rules.today, rules.frontlist);
  const shelves = useMemo(() => ({
    continueReading: continueItems.flatMap((item) => {
      const entry = catalog.findById(item.productId);
      return entry ? [{ entry, item }] : [];
    }),
    fresh: newArrivals(entries, rules.today).slice(0, SHELF_LIMIT),
    popular: popularEntries(entries.filter((e) => isShelfTitle(e.product)), popularIds).slice(0, SHELF_LIMIT),
    categories: categoryShelves(entries, CATEGORIES),
    soon: comingSoon(entries, rules.today, rules.viewer.days).slice(0, SHELF_LIMIT)
  }), [entries, continueItems, popularIds, rules.today, rules.viewer.days, catalog]);

  const heroEntry = shelves.fresh[0] ?? entries.find((e) => isShelfTitle(e.product)) ?? entries[0] ?? null;
  const startFree = () => (member.isLoggedIn ? goToLibrary() : goToLogin('/digital', 'register'));
  const planName = (plan: string) => t(`membership.plans.${plan}.name` as 'membership.plans.gold.name');
  const nothingToShow = shelves.fresh.length === 0 && shelves.categories.length === 0 && shelves.soon.length === 0;

  return (
    <div id="digital-home" className="bg-cream-50 text-left">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 text-cream-50">
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_1fr] md:py-16 lg:px-8">
          <div>
            <span className="inline-flex rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold-400">
              {t('home.hero.eyebrow')}
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              <span className="block">{t('home.hero.titleLine1')}</span>
              <span className="block text-gold-400">{t('home.hero.titleLine2')}</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm text-cream-200 sm:text-base">{t('home.hero.subtitle')}</p>
            <ul className="mt-5 space-y-2">
              {benefits.map((key) => (
                <li key={key} className="flex items-start gap-2 text-sm text-cream-100">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" aria-hidden="true" />
                  <span>{t(`home.hero.benefits.${key}`)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                id={member.isLoggedIn ? 'btn-digital-open-library' : 'btn-digital-start-free'}
                onClick={startFree}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-bold text-navy-950 transition-colors hover:bg-gold-400 cursor-pointer"
              >
                {member.isLoggedIn ? t('home.hero.openLibrary') : t('home.hero.startFree')}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                id="btn-digital-view-plans"
                onClick={goToMembership}
                className="inline-flex items-center justify-center rounded-lg border border-cream-200/40 px-5 py-3 text-sm font-semibold text-cream-50 transition-colors hover:bg-white/10 cursor-pointer"
              >
                {t('home.hero.viewPlans')}
              </button>
            </div>
          </div>
          <PhoneMockup entry={heroEntry} />
        </div>
      </section>

      {/* Rak */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {shelves.continueReading.length > 0 && (
          <Shelf id="shelf-continue" title={t('home.shelves.continue')}>
            {shelves.continueReading.map(({ entry, item }) => (
              <DigitalShelfCard
                key={entry.product.id}
                entry={entry}
                badge={badgeOf(entry)}
                progress={item.percent}
                onOpen={() => goToLibraryItem(entry.product.format, entry.product.id)}
              />
            ))}
          </Shelf>
        )}

        {shelves.fresh.length > 0 && (
          <Shelf id="shelf-new" title={t('home.shelves.newArrivals')} onSeeAll={() => goToDigitalListing('ebook')}>
            {shelves.fresh.map((entry) => <DigitalShelfCard key={entry.product.id} entry={entry} badge={badgeOf(entry)} onOpen={onOpenProduct} />)}
          </Shelf>
        )}

        {shelves.popular.length > 0 && (
          <Shelf id="shelf-popular" title={t('home.shelves.popular')}>
            {shelves.popular.map((entry) => <DigitalShelfCard key={entry.product.id} entry={entry} badge={badgeOf(entry)} onOpen={onOpenProduct} />)}
          </Shelf>
        )}

        {shelves.categories.map(({ category, items }) => (
          <Shelf
            key={category}
            id={`shelf-category-${category.replace(/[^A-Za-z]+/g, '-').toLowerCase()}`}
            title={categoryLabel(category)}
            onSeeAll={() => goToDigitalListing(items[0].product.format, category)}
          >
            {items.slice(0, SHELF_LIMIT).map((entry) => <DigitalShelfCard key={entry.product.id} entry={entry} badge={badgeOf(entry)} onOpen={onOpenProduct} />)}
          </Shelf>
        ))}

        {shelves.soon.length > 0 && (
          <Shelf
            id="shelf-coming-soon"
            title={t('home.shelves.comingSoon')}
            subtitle={rules.memberPlan ? t('home.shelves.comingSoonPlan', { plan: planName(rules.memberPlan) }) : t('home.shelves.comingSoonVisitor')}
          >
            {shelves.soon.map((entry) => (
              <DigitalShelfCard key={entry.product.id} entry={entry} badge={badgeOf(entry)} openDate={entry.openDate} onOpen={onOpenProduct} />
            ))}
          </Shelf>
        )}

        {nothingToShow && (
          <p className="rounded-xl border border-dashed border-cream-200 bg-white px-6 py-10 text-center text-sm text-slate-600">{t('home.shelves.empty')}</p>
        )}
      </div>
    </div>
  );
};
