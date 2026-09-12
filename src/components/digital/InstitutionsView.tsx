import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, CheckCircle2, Send, Users, Wallet } from 'lucide-react';
import type { InstitutionType } from '../../types';
import { INSTITUTION_INQUIRY_LIMITS, INSTITUTION_TIERS, INSTITUTION_TYPES } from '../../data/membership';
import { apiClient, ApiError } from '../../services/apiClient';
import { useAppLanguage } from '../../i18n/hooks';

type FieldName = 'institutionName' | 'institutionType' | 'userCount' | 'email';

interface InquiryForm {
  institutionName: string;
  institutionType: InstitutionType | '';
  userCount: string;
  email: string;
  contactName: string;
  phone: string;
  message: string;
  /** Honeypot anti-spam (tersembunyi); pengunjung manusia tidak mengisinya. */
  website: string;
}

const EMPTY_FORM: InquiryForm = {
  institutionName: '',
  institutionType: '',
  userCount: '',
  email: '',
  contactName: '',
  phone: '',
  message: '',
  website: ''
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Halaman /institutions: tingkat Starter/Campus/Network (berbasis pengguna bersamaan), acquisition wallet,
 * dan formulir permintaan penawaran (POST /api/institutions/inquiry + email notifikasi ke admin).
 * Tanpa harga publik.
 */
export const InstitutionsView: React.FC = () => {
  const { t } = useTranslation('digital');
  const language = useAppLanguage();
  const formRef = useRef<HTMLElement>(null);
  const [form, setForm] = useState<InquiryForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const update = (field: keyof InquiryForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { value } = e.target;
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => (field in prev ? { ...prev, [field]: undefined } : prev));
    };

  const validate = (): Partial<Record<FieldName, string>> => {
    const found: Partial<Record<FieldName, string>> = {};
    if (form.institutionName.trim().length < 2) found.institutionName = t('institutions.form.errors.institutionName');
    if (!form.institutionType) found.institutionType = t('institutions.form.errors.institutionType');
    const users = Number(form.userCount);
    if (!Number.isInteger(users) || users < 1 || users > INSTITUTION_INQUIRY_LIMITS.maxUsers) {
      found.userCount = t('institutions.form.errors.userCount');
    }
    if (!EMAIL_RE.test(form.email.trim())) found.email = t('institutions.form.errors.email');
    return found;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    const firstInvalid = (Object.keys(found) as FieldName[])[0];
    if (firstInvalid) {
      document.getElementById(`inquiry-${firstInvalid}`)?.focus();
      return;
    }
    setStatus('submitting');
    setSubmitError('');
    try {
      await apiClient.submitInstitutionInquiry({
        institutionName: form.institutionName.trim(),
        institutionType: form.institutionType as InstitutionType,
        userCount: Number(form.userCount),
        email: form.email.trim(),
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        message: form.message.trim() || undefined,
        language,
        website: form.website
      });
      setSentTo(form.email.trim());
      setForm(EMPTY_FORM);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setSubmitError(err instanceof ApiError && err.status === 429
        ? t('institutions.form.errors.rateLimited')
        : t('institutions.form.errors.generic'));
    }
  };

  const inputClass = (invalid: boolean) =>
    `mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
      invalid ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-300 focus:border-[#D4AF37] focus:ring-[#D4AF37]/20'
    }`;
  const labelClass = 'block text-xs font-semibold text-slate-700';
  const fieldError = (field: FieldName) =>
    errors[field] ? <p id={`inquiry-${field}-error`} className="mt-1 text-xs text-rose-600">{errors[field]}</p> : null;
  const errorProps = (field: FieldName) => ({
    'aria-invalid': Boolean(errors[field]),
    'aria-describedby': errors[field] ? `inquiry-${field}-error` : undefined
  });

  return (
    <div id="institutions-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0F172A] p-6 text-white shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#D4AF37]/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#DFBF64]">
            {t('institutions.badge')}
          </span>
          <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">{t('institutions.title')}</h1>
          <p className="mt-3 text-sm text-slate-300 sm:text-base">{t('institutions.subtitle')}</p>
          <p className="mt-3 text-sm font-semibold text-[#DFBF64]">{t('institutions.pricingNote')}</p>
          <button
            type="button"
            id="btn-institutions-hero-quote"
            onClick={scrollToForm}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-[#c5a059] cursor-pointer"
          >
            {t('institutions.requestQuote')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Tingkat layanan */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-slate-900">{t('institutions.tiersTitle')}</h2>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t('institutions.concurrentExplainer')}
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {INSTITUTION_TIERS.map((tier) => (
            <article
              key={tier.key}
              id={`institution-tier-${tier.key}`}
              className={`flex flex-col rounded-2xl border bg-white p-5 shadow-xs ${
                tier.highlighted ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30' : 'border-slate-200'
              }`}
            >
              <h3 className="text-lg font-bold text-slate-900">{t(`institutions.tiers.${tier.key}.name`)}</h3>
              <p className="mt-1 text-sm font-semibold text-[#9A7B38]">
                {tier.concurrentUsers ? t('institutions.concurrentUsers', { count: tier.concurrentUsers }) : t('institutions.concurrentUsersCustom')}
              </p>
              <p className="mt-2 text-xs text-slate-600">{t(`institutions.tiers.${tier.key}.description`)}</p>
              <ul className="mt-4 flex-1 space-y-2 text-xs text-slate-700">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>{t(`institutions.features.${feature}`)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[11px] italic text-slate-500">{t('institutions.pricingNote')}</p>
              <button
                type="button"
                onClick={scrollToForm}
                className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer"
              >
                {t('institutions.requestQuote')}
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* Acquisition wallet */}
      <section className="mt-12 grid gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8 lg:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Wallet className="h-5 w-5 shrink-0 text-[#9A7B38]" aria-hidden="true" />
            {t('institutions.wallet.title')}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{t('institutions.wallet.body')}</p>
        </div>
        <ul className="space-y-3 self-center">
          {(['point1', 'point2', 'point3'] as const).map((point) => (
            <li key={point} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>{t(`institutions.wallet.${point}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Formulir permintaan penawaran */}
      <section ref={formRef} id="institution-inquiry-form" className="mt-12 scroll-mt-32 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold text-slate-900">{t('institutions.form.title')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('institutions.form.description')}</p>
        </div>

        {status === 'success' ? (
          <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <h3 className="flex items-center gap-2 text-base font-bold text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              {t('institutions.form.success.title')}
            </h3>
            <p className="mt-2 text-sm text-emerald-800 [overflow-wrap:anywhere]">{t('institutions.form.success.body', { email: sentTo })}</p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="mt-4 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
            >
              {t('institutions.form.sendAnother')}
            </button>
          </div>
        ) : (
          <form noValidate onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="inquiry-institutionName" className={labelClass}>{t('institutions.form.institutionName')}</label>
              <input
                id="inquiry-institutionName"
                type="text"
                autoComplete="organization"
                maxLength={INSTITUTION_INQUIRY_LIMITS.nameMax}
                value={form.institutionName}
                onChange={update('institutionName')}
                className={inputClass(Boolean(errors.institutionName))}
                {...errorProps('institutionName')}
              />
              {fieldError('institutionName')}
            </div>

            <div>
              <label htmlFor="inquiry-institutionType" className={labelClass}>{t('institutions.form.institutionType')}</label>
              <select
                id="inquiry-institutionType"
                value={form.institutionType}
                onChange={update('institutionType')}
                className={inputClass(Boolean(errors.institutionType))}
                {...errorProps('institutionType')}
              >
                <option value="">{t('institutions.form.selectType')}</option>
                {INSTITUTION_TYPES.map((type) => (
                  <option key={type} value={type}>{t(`institutions.form.types.${type}`)}</option>
                ))}
              </select>
              {fieldError('institutionType')}
            </div>

            <div>
              <label htmlFor="inquiry-userCount" className={labelClass}>{t('institutions.form.userCount')}</label>
              <input
                id="inquiry-userCount"
                type="number"
                inputMode="numeric"
                min={1}
                max={INSTITUTION_INQUIRY_LIMITS.maxUsers}
                value={form.userCount}
                onChange={update('userCount')}
                className={inputClass(Boolean(errors.userCount))}
                {...errorProps('userCount')}
              />
              {errors.userCount ? fieldError('userCount') : <p className="mt-1 text-[11px] text-slate-500">{t('institutions.form.userCountHint')}</p>}
            </div>

            <div>
              <label htmlFor="inquiry-email" className={labelClass}>{t('institutions.form.email')}</label>
              <input
                id="inquiry-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={update('email')}
                className={inputClass(Boolean(errors.email))}
                {...errorProps('email')}
              />
              {fieldError('email')}
            </div>

            <div>
              <label htmlFor="inquiry-contactName" className={labelClass}>{t('institutions.form.contactName')}</label>
              <input
                id="inquiry-contactName"
                type="text"
                autoComplete="name"
                maxLength={INSTITUTION_INQUIRY_LIMITS.contactMax}
                value={form.contactName}
                onChange={update('contactName')}
                className={inputClass(false)}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="inquiry-phone" className={labelClass}>{t('institutions.form.phone')}</label>
              <input
                id="inquiry-phone"
                type="tel"
                autoComplete="tel"
                maxLength={INSTITUTION_INQUIRY_LIMITS.phoneMax}
                value={form.phone}
                onChange={update('phone')}
                className={inputClass(false)}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="inquiry-message" className={labelClass}>{t('institutions.form.message')}</label>
              <textarea
                id="inquiry-message"
                rows={4}
                maxLength={INSTITUTION_INQUIRY_LIMITS.messageMax}
                value={form.message}
                onChange={update('message')}
                placeholder={t('institutions.form.messagePlaceholder')}
                className={inputClass(false)}
              />
            </div>

            {/* Honeypot: tersembunyi dari pengunjung; bot yang mengisinya diabaikan server. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor="inquiry-website">{t('institutions.form.honeypot')}</label>
              <input id="inquiry-website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={update('website')} />
            </div>

            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-slate-500">{t('institutions.form.privacy')}</p>
              <button
                type="submit"
                id="btn-institution-inquiry-submit"
                disabled={status === 'submitting'}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-[#c5a059] disabled:cursor-wait disabled:opacity-70 cursor-pointer"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {status === 'submitting' ? t('institutions.form.submitting') : t('institutions.form.submit')}
              </button>
            </div>

            {status === 'error' && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 sm:col-span-2">
                {submitError}
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  );
};
