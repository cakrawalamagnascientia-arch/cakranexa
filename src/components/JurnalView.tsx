import React from 'react';
import { BookMarked, ExternalLink, FileText, Award, Calendar, Search } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

export const JurnalView: React.FC = () => {
  const { t } = useTranslation('journal');
  // Judul jurnal adalah nama resmi (tidak diterjemahkan); keterangan lain dari journal.json.
  const journals = [
    {
      title: 'Jurnal Hukum Fiskal & Tata Kelola Peradilan Pajak Indonesia',
      eIssn: '2987-1120',
      volume: t('journals.fiscalLaw.volume'),
      scope: t('journals.fiscalLaw.scope'),
      frequency: t('journals.fiscalLaw.frequency'),
      indexing: t('journals.fiscalLaw.indexing')
    },
    {
      title: 'Indonesian Journal of Forensic Accounting & Investigatory Studies',
      eIssn: '2988-9041',
      volume: t('journals.forensicAccounting.volume'),
      scope: t('journals.forensicAccounting.scope'),
      frequency: t('journals.forensicAccounting.frequency'),
      indexing: t('journals.forensicAccounting.indexing')
    },
    {
      title: 'Cakrawala Magna Review: Kebijakan Pajak Digital & Ekonomi Internasional',
      eIssn: '2989-3312',
      volume: t('journals.digitalTax.volume'),
      scope: t('journals.digitalTax.scope'),
      frequency: t('journals.digitalTax.frequency'),
      indexing: t('journals.digitalTax.indexing')
    }
  ];

  return (
    <div id="jurnal-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 text-left space-y-12">

      {/* Header */}
      <div className="bg-[#0F172A] text-white rounded-3xl p-8 sm:p-12 relative overflow-hidden border border-[#DFBF64]/30 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <span className="text-xs uppercase tracking-widest text-[#DFBF64] font-semibold flex items-center gap-2">
            <BookMarked className="w-4 h-4" />
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

      {/* Call for Papers Alert */}
      <div className="bg-gradient-to-r from-amber-50 via-amber-100/50 to-amber-50 border border-amber-300 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-700 text-white inline-block mb-1">
            {t('cfp.badge')}
          </span>
          <h3 className="font-serif font-bold text-slate-900 text-base">
            {t('cfp.title')}
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            {t('cfp.note')}
          </p>
        </div>
        <button
          onClick={() => alert(t('cfp.submitAlert'))}
          className="px-4 py-2.5 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-[#DFBF64] font-bold text-xs whitespace-nowrap shadow-sm"
        >
          {t('cfp.submit')}
        </button>
      </div>

      {/* Journal Cards */}
      <div className="space-y-6">
        {journals.map((j, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:border-[#C5A059]/60 transition-all flex flex-col md:flex-row justify-between gap-6">
            <div className="space-y-3 max-w-3xl">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                  e-ISSN: {j.eIssn}
                </span>
                <span className="text-xs text-[#C5A059] font-medium">{j.volume}</span>
              </div>
              <h3 className="font-serif font-bold text-lg text-slate-900 leading-snug">
                {j.title}
              </h3>
              <p className="text-xs text-slate-600">
                <Trans t={t} i18nKey="card.scope" values={{ scope: j.scope }} components={{ strong: <strong /> }} />
              </p>
              <div className="pt-2 text-[11px] text-slate-500 flex flex-wrap items-center gap-4">
                <span>{t('card.frequency', { frequency: j.frequency })}</span>
                <span>•</span>
                <span>
                  <Trans
                    t={t}
                    i18nKey="card.indexing"
                    values={{ indexing: j.indexing }}
                    components={{ strong: <strong className="text-slate-800" /> }}
                  />
                </span>
              </div>
            </div>

            <div className="flex md:flex-col justify-end gap-2.5 flex-shrink-0 self-end md:self-center">
              <button
                onClick={() => alert(t('card.archiveAlert', { title: j.title }))}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t('card.viewArchive')}</span>
              </button>
              <button
                onClick={() => alert(t('card.guidelinesAlert', { title: j.title }))}
                className="px-4 py-2 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-[#DFBF64] text-xs font-bold flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{t('card.authorGuidelines')}</span>
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
