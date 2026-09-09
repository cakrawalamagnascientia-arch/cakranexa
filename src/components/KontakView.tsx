import React, { useState } from 'react';
import { ContactSettings, SiteContentSettings } from '../types';
import { Mail, Phone, MapPin, Clock, Send, CheckCircle2, MessageSquare, Building2 } from 'lucide-react';

interface KontakViewProps {
  siteContent?: SiteContentSettings;
}

export const KontakView: React.FC<KontakViewProps> = ({ siteContent }) => {
  const [submitted, setSubmitted] = useState(false);
  const contact: ContactSettings = siteContent?.contact || {};
  const footer = siteContent?.footer;
  const address = footer?.address || contact.address || '';
  const phone = footer?.phone || contact.phone || '';
  const email = footer?.email || contact.email || '';
  const workingHours = footer?.workingHours || contact.workingHours || '';
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
            HUBUNGI KAMI • PT CAKRAWALA MAGNA SCIENTIA
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
            Konsultasi Penerbitan, Pengadaan Buku & Kerjasama Akademik
          </h1>
          <p className="text-slate-300 text-sm sm:text-base font-light leading-relaxed">
            Tim redaksi dan pemasaran perseroan siap melayani kebutuhan penerbitan naskah, pesanan buku skala institusi/perpustakaan, maupun kemitraan riset.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Contact Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <h3 className="font-serif font-bold text-lg text-slate-900 pb-3 border-b border-slate-100">
              Kantor Pusat Penerbitan
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
                  <strong className="text-slate-900 block">Layanan WhatsApp & Telepon</strong>
                  <span className="text-slate-600 font-mono block mt-0.5">{phone}</span>
                  <span className="text-slate-600 font-mono block">{phone} (WhatsApp Redaksi)</span>
                </div>
              </div>}

              {email && <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-[#C5A059] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block">Surat Elektronik (Email)</strong>
                  <span className="text-slate-600 font-mono block mt-0.5">{email}</span>
                </div>
              </div>}

              {workingHours && <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-[#C5A059] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block">Jam Operasional Layanan</strong>
                  <span className="text-slate-600 block mt-0.5 whitespace-pre-line">{workingHours}</span>
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
                Pesan Anda Telah Kami Terima
              </h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Tim representatif PT Cakrawala Magna Scientia akan merespons permintaan Anda melalui email atau WhatsApp dalam 1x24 jam kerja.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <h3 className="font-serif font-bold text-lg text-slate-900">Kirimkan Pesan atau Permohonan Kerjasama</h3>
                <p className="text-slate-500 mt-0.5">Silakan isi rincian kontak Anda dan hal yang ingin dikonsultasikan.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Lengkap & Gelar *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder="Nama Lengkap Anda"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Alamat Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder="email@institusi.ac.id"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nomor WhatsApp / Telepon *</label>
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
                  <label className="font-semibold text-slate-700 block mb-1">Topik Keperluan *</label>
                  <select
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059] bg-white"
                  >
                    <option value="Pengadaan Koleksi Perpustakaan Kampus">Pengadaan Buku Perpustakaan / Kampus</option>
                    <option value="Konsultasi Penerbitan Naskah Buku">Konsultasi Penerbitan Naskah Buku</option>
                    <option value="Pendaftaran Executive Workshop Pajak">Pendaftaran Workshop / Pelatihan</option>
                    <option value="Kemitraan Jurnal Ilmiah OJS">Kemitraan Jurnal Ilmiah</option>
                    <option value="Kerjasama Distribusi & Reseller">Kerjasama Distribusi / Toko Buku</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Pesan / Rincian Kebutuhan *</label>
                <textarea
                  rows={4}
                  required
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                  placeholder="Uraikan permohonan kerjasama, estimasi eksemplar buku yang dipesan, atau kebutuhan naskah..."
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-[#DFBF64] font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Kirim Pesan Resmi ke CakraNexa</span>
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
