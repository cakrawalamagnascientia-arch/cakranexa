import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, BookOpen, Check, Headphones, Sparkles } from 'lucide-react';
import { useCategoryLabel } from '../../i18n/hooks';
import { saveOnboarding, useMemberSession } from '../../services/memberSession';
import { goToDigitalListing, goToLogin, goToMembership } from '../../services/digitalNavigation';

const CATEGORIES = ['Perpajakan', 'Akuntansi', 'Hukum', 'Ekonomi', 'Filsafat', 'Teologia'] as const;
const FORMATS = ['ebook', 'audiobook', 'both'] as const;
const STEPS = ['interests', 'format', 'howItWorks'] as const;

/**
 * /account/onboarding (fase 6 Langkah 4): tiga langkah setelah mendaftar — kategori minat, format favorit, lalu
 * penjelasan sampel vs paket. Preferensi disimpan di user_metadata Supabase (tanpa tabel baru).
 */
export const OnboardingView: React.FC = () => {
  const { t } = useTranslation('digital');
  const categoryLabel = useCategoryLabel();
  const member = useMemberSession();
  const [stepIndex, setStepIndex] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('both');
  const [saving, setSaving] = useState(false);
  const step = STEPS[stepIndex];

  const finish = async () => {
    setSaving(true);
    try {
      await saveOnboarding({ interests, format });
    } finally {
      setSaving(false);
      goToDigitalListing(format === 'audiobook' ? 'audiobook' : 'ebook', interests[0]);
    }
  };

  if (!member.isLoading && !member.isLoggedIn) {
    return (
      <div id="onboarding-login" className="mx-auto max-w-lg px-4 py-12 text-left sm:px-6">
        <h1 className="text-xl font-bold text-slate-900">{t('account.loginTitle')}</h1>
        <button type="button" onClick={() => goToLogin()} className="mt-4 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-bold text-navy-950 cursor-pointer">{t('account.loginCta')}</button>
      </div>
    );
  }

  return (
    <div id="onboarding-page" className="mx-auto max-w-2xl px-4 py-8 text-left sm:px-6 md:py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">{t('onboarding.eyebrow')}</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{t(`onboarding.${step}.title`)}</h1>
      <p className="mt-1 text-sm text-slate-600">{t(`onboarding.${step}.subtitle`)}</p>

      <ol className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold sm:text-xs">
        {STEPS.map((value, index) => (
          <li key={value} className={`rounded-lg border px-2 py-2 ${index === stepIndex ? 'border-gold-500 bg-gold-500/10 text-slate-900' : index < stepIndex ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-cream-200 bg-white text-slate-500'}`}>
            <span className="mr-1 font-bold">{index + 1}.</span>{t(`onboarding.steps.${value}`)}
          </li>
        ))}
      </ol>

      <section className="mt-5 rounded-2xl border border-cream-200 bg-white p-5 shadow-sm sm:p-6">
        {step === 'interests' && (
          <ul id="onboarding-interests" className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => {
              const active = interests.includes(category);
              return (
                <li key={category}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setInterests((current) => (active ? current.filter((c) => c !== category) : [...current, category]))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${active ? 'border-gold-500 bg-gold-500/15 text-slate-900' : 'border-cream-200 bg-white text-slate-700 hover:bg-cream-50'}`}
                  >
                    {active && <Check className="h-3.5 w-3.5 text-gold-700" aria-hidden="true" />}
                    {categoryLabel(category)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {step === 'format' && (
          <div id="onboarding-format" role="radiogroup" aria-label={t('onboarding.format.title')} className="grid gap-2 sm:grid-cols-3">
            {FORMATS.map((value) => (
              <label key={value} className={`flex cursor-pointer flex-col items-start gap-1 rounded-xl border px-4 py-3 text-sm ${format === value ? 'border-gold-500 bg-gold-500/5' : 'border-cream-200'}`}>
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <input type="radio" name="onboarding-format" id={`format-${value}`} checked={format === value} onChange={() => setFormat(value)} />
                  {value === 'audiobook' ? <Headphones className="h-4 w-4 text-gold-700" aria-hidden="true" /> : <BookOpen className="h-4 w-4 text-gold-700" aria-hidden="true" />}
                  {t(`onboarding.format.${value}`)}
                </span>
              </label>
            ))}
          </div>
        )}

        {step === 'howItWorks' && (
          <ul id="onboarding-how" className="space-y-3 text-sm text-slate-700">
            {(['sample', 'plan', 'quota'] as const).map((key) => (
              <li key={key} className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" aria-hidden="true" />
                <span>{t(`onboarding.howItWorks.${key}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        {stepIndex < STEPS.length - 1 ? (
          <button
            type="button"
            id="btn-onboarding-next"
            onClick={() => setStepIndex((i) => i + 1)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-bold text-navy-950 hover:bg-gold-400 cursor-pointer"
          >
            {t('membershipCheckout.next')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            id="btn-onboarding-finish"
            disabled={saving}
            onClick={() => void finish()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-bold text-navy-950 hover:bg-gold-400 disabled:opacity-60 cursor-pointer"
          >
            {t('onboarding.finish')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {stepIndex > 0 && (
          <button type="button" onClick={() => setStepIndex((i) => i - 1)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-cream-50 cursor-pointer sm:w-auto">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('membershipCheckout.back')}
          </button>
        )}
      </div>
      <button type="button" id="btn-onboarding-plans" onClick={goToMembership} className="mt-3 w-full text-center text-xs font-semibold text-gold-700 underline-offset-2 hover:underline cursor-pointer">
        {t('onboarding.seePlans')}
      </button>
    </div>
  );
};
