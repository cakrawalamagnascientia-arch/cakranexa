import React, { useState, useEffect } from 'react';
import { BookCheck, Award, Globe, ArrowRight, FileText, ShieldCheck } from 'lucide-react';
import { Book } from '../types';
import { resolveImageUrl, handleImageError } from '../utils/imageUtils';
import { getStoredSiteContent } from '../services/siteContentService';

interface PublisherShowcaseProps {
  books?: Book[];
  onKirimNaskah: () => void;
  onPanduanPenulis: () => void;
}

export const PublisherShowcase: React.FC<PublisherShowcaseProps> = ({
  books = [],
  onKirimNaskah,
  onPanduanPenulis
}) => {
  const [keanggotaan, setKeanggotaan] = useState<string>(
    () => getStoredSiteContent().companyCredentials?.keanggotaanPenerbit || ''
  );

  useEffect(() => {
    const handleUpdate = (e: any) => {
      const creds = e.detail?.companyCredentials;
      if (creds) {
        setKeanggotaan(creds.keanggotaanPenerbit || '');
      }
    };
    window.addEventListener('cakranexa_content_updated', handleUpdate);
    return () => window.removeEventListener('cakranexa_content_updated', handleUpdate);
  }, []);

  const stackCovers = [
    books[0]?.coverBuku || '/images/books/book-1.jpg',
    books[1]?.coverBuku || '/images/books/book-2.jpg',
    books[2]?.coverBuku || '/images/books/book-3.jpg'
  ];

  return (
    <section id="publisher-showcase-section" className="py-16 md:py-24 bg-white text-slate-900 border-b border-slate-200 relative overflow-hidden">
      {/* Background Architectural Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:28px_28px] opacity-40 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Side: Aesthetic Overlapping Book Stack Graphics */}
          <div className="lg:col-span-5 flex justify-center order-2 lg:order-1">
            <div className="relative w-full max-w-sm sm:max-w-md h-80 sm:h-96 flex items-center justify-center">
              
              {/* Stack Book 1 (Back Left) */}
              <div 
                className="absolute w-44 sm:w-52 h-64 sm:h-76 rounded-lg overflow-hidden shadow-2xl border border-slate-300 transform -rotate-8 -translate-x-12 sm:-translate-x-16 -translate-y-4 transition-transform duration-500 hover:-rotate-10 hover:-translate-x-18 bg-slate-900"
              >
                <img 
                  src={resolveImageUrl(stackCovers[2], 'book', books[2]?.id)} 
                  alt="Monografi 3" 
                  onError={(e) => handleImageError(e, { title: books[2]?.name || 'Monografi Ilmiah 3' }, 'book')}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-85"
                />
                <div className="absolute inset-0 bg-slate-950/25" />
              </div>

              {/* Stack Book 2 (Back Right) */}
              <div 
                className="absolute w-44 sm:w-52 h-64 sm:h-76 rounded-lg overflow-hidden shadow-2xl border border-slate-300 transform rotate-8 translate-x-12 sm:translate-x-16 translate-y-3 transition-transform duration-500 hover:rotate-10 hover:translate-x-18 bg-slate-900"
              >
                <img 
                  src={resolveImageUrl(stackCovers[1], 'book', books[1]?.id)} 
                  alt="Monografi 2" 
                  onError={(e) => handleImageError(e, { title: books[1]?.name || 'Monografi Ilmiah 2' }, 'book')}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-90"
                />
                <div className="absolute inset-0 bg-slate-950/20" />
              </div>

              {/* Stack Book 3 (Front Center Focus) */}
              <div 
                className="relative z-20 w-48 sm:w-56 h-68 sm:h-80 rounded-xl overflow-hidden shadow-2xl border-2 border-[#D4AF37] transform hover:scale-105 transition-all duration-500 bg-slate-900"
              >
                <img 
                  src={resolveImageUrl(stackCovers[0], 'book', books[0]?.id)} 
                  alt="Monografi Utama CakraNexa" 
                  onError={(e) => handleImageError(e, { title: books[0]?.name || 'Monografi Utama CakraNexa' }, 'book')}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Verified Trust Badge Floating */}
              <div className="absolute -bottom-4 right-4 sm:right-8 z-30 bg-slate-900/95 border border-slate-700 px-3 py-1.5 rounded-full shadow-xl flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                <ShieldCheck className="w-4 h-4 text-[#DFBF64]" />
                <span>{keanggotaan.trim() ? keanggotaan : 'Penerbit Terdaftar Resmi'}</span>
              </div>

            </div>
          </div>

          {/* Right Side: High-Contrast Editorial Content */}
          <div className="lg:col-span-7 space-y-6 text-left order-1 lg:order-2">
            
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase text-amber-800 bg-amber-50 border border-amber-200/80 px-3 py-1 rounded-full">
                Layanan Penerbitan Mandiri & Institusi
              </span>
              
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
                Be Your Own Publisher. <br />
                <span className="text-slate-600 font-medium">Penerbitan Profesional Berstandar Nasional.</span>
              </h2>

              <p className="text-sm sm:text-base text-slate-600 font-normal leading-relaxed pt-1">
                PT Cakrawala Magna Scientia mendampingi para akademisi, dosen, praktisi hukum, akuntan, dan peneliti untuk menerbitkan naskah ilmiah bermutu tinggi dengan alur cepat, transparan, dan terindeks resmi.
              </p>
            </div>

            {/* 3 Key Feature Bullets with Custom Subtle Lucide Icons */}
            <div className="space-y-4 pt-2">
              
              <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 hover:border-slate-300 hover:bg-slate-100/60 transition-colors shadow-2xs">
                <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200/80 flex items-center justify-center shrink-0 text-amber-700">
                  <BookCheck className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Editorial & Penelaahan Ilmiah Presisi
                  </h4>
                  <p className="text-xs text-slate-600 font-normal leading-relaxed">
                    Penyelarasan sitasi akademik, proofreading tata bahasa baku, serta verifikasi substansi oleh dewan redaksi hukum dan perpajakan terapan.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 hover:border-slate-300 hover:bg-slate-100/60 transition-colors shadow-2xs">
                <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200/80 flex items-center justify-center shrink-0 text-amber-700">
                  <Award className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-slate-900">
                    ISBN & Barcode Resmi Perpusnas RI
                  </h4>
                  <p className="text-xs text-slate-600 font-normal leading-relaxed">
                    Pengurusan International Standard Book Number resmi, kewajiban serah simpan karya cetak ke Perpustakaan Nasional RI, dan pendaftaran HAKI.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 hover:border-slate-300 hover:bg-slate-100/60 transition-colors shadow-2xs">
                <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200/80 flex items-center justify-center shrink-0 text-amber-700">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Percetakan Eksklusif & E-Commerce Terintegrasi
                  </h4>
                  <p className="text-xs text-slate-600 font-normal leading-relaxed">
                    Format ukuran UNESCO B5, kertas bookpaper premium, serta katalog online terintegrasi langsung dengan payment gateway dan sistem ekspedisi.
                  </p>
                </div>
              </div>

            </div>

            {/* Action Buttons: Primary CTA & Secondary Link */}
            <div className="flex flex-wrap items-center gap-4 pt-3">
              <button
                id="btn-showcase-kirim-naskah"
                onClick={onKirimNaskah}
                className="px-6 py-3 rounded-lg bg-[#D4AF37] hover:bg-[#c5a059] text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 group cursor-pointer"
              >
                <span>Kirim Naskah</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                id="btn-showcase-panduan"
                onClick={onPanduanPenulis}
                className="px-5 py-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs uppercase tracking-wider transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-amber-600" />
                <span>Panduan Penulis</span>
              </button>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
};
