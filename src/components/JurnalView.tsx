import React from 'react';
import { BookMarked, ExternalLink, FileText, Award, Calendar, Search } from 'lucide-react';

export const JurnalView: React.FC = () => {
  const journals = [
    {
      title: 'Jurnal Hukum Fiskal & Tata Kelola Peradilan Pajak Indonesia',
      eIssn: '2987-1120',
      volume: 'Vol. 4 No. 2 (Juli - Desember 2026)',
      scope: 'Hukum Acara Pengadilan Pajak, Sengketa Transfer Pricing, Tindak Pidana Fiskal',
      frequency: 'Dua kali setahun (Bilingual: ID & EN)',
      indexing: 'Garuda, Google Scholar, SINTA S2 Accreditation Process'
    },
    {
      title: 'Indonesian Journal of Forensic Accounting & Investigatory Studies',
      eIssn: '2988-9041',
      volume: 'Vol. 3 No. 1 (Januari - Juni 2026)',
      scope: 'Fraud Auditing, Penelusuran Aset TPPU, Audit Investigasi Sektor Publik',
      frequency: 'Tiga kali setahun',
      indexing: 'Crossref (DOI), Garuda, Dimensions, Google Scholar'
    },
    {
      title: 'Cakrawala Magna Review: Kebijakan Pajak Digital & Ekonomi Internasional',
      eIssn: '2989-3312',
      volume: 'Vol. 2 No. 2 (Agustus 2026)',
      scope: 'Pillar One & Pillar Two OECD, PPN PMSE Lintas Batas, Tax Treaties (P3B)',
      frequency: 'Dua kali setahun',
      indexing: 'Directory of Open Access Journals (DOAJ Candidate), SINTA'
    }
  ];

  return (
    <div id="jurnal-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 text-left space-y-12">
      
      {/* Header */}
      <div className="bg-[#0F172A] text-white rounded-3xl p-8 sm:p-12 relative overflow-hidden border border-[#DFBF64]/30 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <span className="text-xs uppercase tracking-widest text-[#DFBF64] font-semibold flex items-center gap-2">
            <BookMarked className="w-4 h-4" />
            PUBLIKASI ILMIAH BERKALA
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
            Jurnal Ilmiah Peer-Reviewed Terindeks Nasional
          </h1>
          <p className="text-slate-300 text-sm sm:text-base font-light leading-relaxed">
            Menyediakan wadah diseminasi riset ilmiah orisinal berstandar OJS (Open Journal Systems) bagi akademisi, peneliti, dan praktisi di bidang perpajakan, audit forensik, serta hukum bisnis.
          </p>
        </div>
      </div>

      {/* Call for Papers Alert */}
      <div className="bg-gradient-to-r from-amber-50 via-amber-100/50 to-amber-50 border border-amber-300 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-700 text-white inline-block mb-1">
            CALL FOR PAPERS 2026 - 2025
          </span>
          <h3 className="font-serif font-bold text-slate-900 text-base">
            Menerima Naskah Artikel Ilmiah untuk Edisi Mendatang
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Bebas biaya submit naskah (Fast-Track Peer-Review & DOI Crossref resmi).
          </p>
        </div>
        <button
          onClick={() => alert('Formulir pengajuan naskah artikel jurnal dialihkan ke sistem OJS PT Cakrawala Magna Scientia.')}
          className="px-4 py-2.5 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-[#DFBF64] font-bold text-xs whitespace-nowrap shadow-sm"
        >
          Submit Artikel (OJS)
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
                <strong>Fokus & Cakupan:</strong> {j.scope}
              </p>
              <div className="pt-2 text-[11px] text-slate-500 flex flex-wrap items-center gap-4">
                <span>Frekuensi: {j.frequency}</span>
                <span>•</span>
                <span>Pengindeks: <strong className="text-slate-800">{j.indexing}</strong></span>
              </div>
            </div>

            <div className="flex md:flex-col justify-end gap-2.5 flex-shrink-0 self-end md:self-center">
              <button
                onClick={() => alert(`Membuka arsip ${j.title}...`)}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Lihat Arsip Terbitan</span>
              </button>
              <button
                onClick={() => alert(`Pedoman penulis naskah artikel untuk ${j.title} siap diunduh.`)}
                className="px-4 py-2 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-[#DFBF64] text-xs font-bold flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Author Guidelines</span>
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
