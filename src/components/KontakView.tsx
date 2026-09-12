import React, { useState } from 'react';
import { ContactSettings, SiteContentSettings } from '../types';
import { Mail, Phone, MapPin, Clock, Send, CheckCircle2, MessageSquare, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCmsText } from '../i18n/hooks';
import { DEFAULT_SITE_CONTENT } from '../services/siteContentService';

interface KontakViewProps {
  siteContent?: SiteContentSettings;
}

export const KontakView: React.FC<KontakViewProps> = ({ siteContent }) => {
  const { t } = useTranslation('contact');
  const cmsText = useCmsText();
  const [submitted, setSubmitted] = useState(false);
  const contact: ContactSettings = siteContent?.contact || {};
  const footer = siteContent?.footer;
  const address = footer?.address || contact.address || '';
  const phone = footer?.phone || contact.phone || '';
  const email = footer?.email || contact.email || '';
  const workingHours = footer?.workingHours || contact.workingHours || '';
  // Jam operasional berasal dari CMS: nilai bawaan diterjemahkan, nilai yang diubah admin tampil apa adanya.
  const workingHoursText = workingHours
    ? cmsText(workingHours, DEFAULT_SITE_CONTENT.footer?.workingHours, t('office.workingHoursDefault'))
    : '';
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'Pengadaan Koleksi Perpustakaan Kampus',
    message: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setForm({
        name: '',
        email: '',
        phone: '',
        subject: 'Pengadaan Koleksi Perpustakaan Kampus',
        message: ''
      });
    }, 4000);
  };

  return (
    <div id="kontak-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 text-left space-y-12">
      <div className="bg-[#0F172A] text-white rounded-3xl p-8 sm:p-12 relative overflow-hidden border border-[#DFBF64]/30 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <span className="text-xs uppercase tracking-widest text-[#DFBF64] font-semibold flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            {t('header.eyebrow')}
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
            {t('header.title')}
          </h1>
          <p className="text-slate-300 text-sm sm:text-base font-light leading-relaxed">
            {t('header.subtitle')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Contact Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <h3 className="font-serif font-bold text-lg text-slate-900 pb-3 border-b border-slate-100">
              {t('office.title')}
            </h3>

            <div className="space-y-4 text-xs">
              {address && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#C5A059] flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900 block font-serif">PT CAKRAWALA MAGNA SCIENTIA</strong>
                    <span className="text-slate-600 block mt-0.5 whitespace-pre-line">{address}</span>
                  </div>
                </div>
              )}

              {phone && <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-[#C5A059] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block">{t('office.phoneLabel')}</strong>
                  <span className="text-slate-600 font-mono block mt-0.5">{phone}</span>
                  <span className="text-slate-600 font-mono block">{t('office.whatsappEditorial', { phone })}</span>
                </div>
              </div>}

              {email && <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-[#C5A059] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block">{t('office.emailLabel')}</strong>
                  <span className="text-slate-600 font-mono block mt-0.5">{email}</span>
                </div>
              </div>}

              {workingHours && <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-[#C5A059] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block">{t('office.hoursLabel')}</strong>
                  <span className="text-slate-600 block mt-0.5 whitespace-pre-line">{workingHoursText}</span>
                </div>
              </div>}
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          {submitted ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="font-serif font-bold text-xl text-slate-900">
                {t('success.title')}
              </h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                {t('success.text')}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <h3 className="font-serif font-bold text-lg text-slate-900">{t('form.title')}</h3>
                <p className="text-slate-500 mt-0.5">{t('form.subtitle')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">{t('form.name.label')}</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder={t('form.name.placeholder')}
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">{t('form.email.label')}</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder={t('form.email.placeholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">{t('form.phone.label')}</label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder="0812xxxxxxxx"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">{t('form.subject.label')}</label>
                  <select
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059] bg-white"
                  >
                    <option value="Pengadaan Koleksi Perpustakaan Kampus">{t('form.subject.options.libraryProcurement')}</option>
                    <option value="Konsultasi Penerbitan Naskah Buku">{t('form.subject.options.publishingConsultation')}</option>
                    <option value="Pendaftaran Executive Workshop Pajak">{t('form.subject.options.workshopRegistration')}</option>
                    <option value="Kemitraan Jurnal Ilmiah OJS">{t('form.subject.options.journalPartnership')}</option>
                    <option value="Kerjasama Distribusi & Reseller">{t('form.subject.options.distributionPartnership')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">{t('form.message.label')}</label>
                <textarea
                  rows={4}
                  required
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                  placeholder={t('form.message.placeholder')}
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-[#DFBF64] font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{t('form.submit')}</span>
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
