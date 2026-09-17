/**
 * Template email keanggotaan (id & en; pesanan berbahasa zh memakai en). Email tidak berisi data kartu atau file,
 * hanya ringkasan dan tautan ke /account/membership atau /library.
 */
export type MembershipEmailKind =
  | 'welcome'
  | 'invoice'
  | 'reminder'
  | 'paymentFailed'
  | 'grace'
  | 'locked'
  | 'planChanged'
  | 'canceled'
  | 'foundingNotice'
  | 'pickLocked'
  | 'planMigration'
  | 'titlePicked'
  | 'familyAdded';

export interface MembershipEmailData {
  language: string;
  name: string;
  siteUrl: string;
  planName?: string;
  cycle?: 'monthly' | 'yearly';
  amount?: number;
  /** Tanggal utama email (ISO): jatuh tempo, akhir akses, tanggal berlaku, dsb. */
  date?: string | null;
  days?: number;
  autodebit?: boolean;
  regularPrice?: number;
  productTitle?: string;
  change?: 'upgrade' | 'downgrade_scheduled' | 'downgrade_applied';
  graceDays?: number;
  retentionMonths?: number;
  invoiceRef?: string;
  /** planMigration: nama paket lama (paket baru di planName). */
  fromPlanName?: string;
  /** titlePicked: jatah terpakai / batas slot. */
  used?: number;
  limit?: number;
  /** familyAdded: nama pemilik langganan. */
  ownerName?: string;
}

export const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const rupiah = (amount: number | undefined) => `Rp ${Math.round(amount ?? 0).toLocaleString('id-ID')}`;
export const formatDate = (iso: string | null | undefined, lang: 'id' | 'en') =>
  iso ? new Date(iso).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '-';

type Copy = { subject: string; intro: string; body?: string; button: string; path: string };

const copyFor = (kind: MembershipEmailKind, lang: 'id' | 'en', d: MembershipEmailData): Copy => {
  const plan = escapeHtml(d.planName || '');
  const cycle = d.cycle === 'yearly' ? (lang === 'id' ? 'tahunan' : 'annual') : (lang === 'id' ? 'bulanan' : 'monthly');
  const date = formatDate(d.date, lang);
  const amount = rupiah(d.amount);
  const account = '/account/membership';
  if (lang === 'id') {
    switch (kind) {
      case 'welcome':
        return { subject: `Selamat datang di ${d.planName}`, intro: `Keanggotaan <strong>${plan}</strong> (${cycle}) Anda sudah aktif sampai ${date}.`, body: 'Buka Pustaka Saya untuk melihat rak digital, perangkat, dan cara perpanjangan.', button: 'Buka Pustaka Saya', path: '/library?welcome=1' };
      case 'invoice':
        return d.autodebit
          ? { subject: `Perpanjangan ${d.planName} pada ${date}`, intro: `Keanggotaan Anda akan diperpanjang otomatis pada ${date} sebesar <strong>${amount}</strong>.`, body: 'Tidak perlu tindakan apa pun. Anda bisa membatalkan atau mengganti metode bayar dari halaman akun.', button: 'Kelola keanggotaan', path: account }
          : { subject: `Tagihan perpanjangan ${d.planName}`, intro: `Tagihan perpanjangan sebesar <strong>${amount}</strong> sudah terbit dan jatuh tempo pada ${date}.`, body: 'Bayar lewat Virtual Account atau QRIS dari halaman akun.', button: 'Bayar tagihan', path: account };
      case 'reminder':
        return { subject: d.days === 0 ? `Hari ini jatuh tempo: ${d.planName}` : `${d.days} hari lagi: tagihan ${d.planName}`, intro: d.days === 0 ? `Tagihan <strong>${amount}</strong> jatuh tempo hari ini.` : `Tagihan <strong>${amount}</strong> jatuh tempo dalam ${d.days} hari (${date}).`, body: `Setelah jatuh tempo ada masa tenggang ${d.graceDays ?? 5} hari dengan akses tetap terbuka.`, button: 'Bayar tagihan', path: account };
      case 'paymentFailed':
        return { subject: `Pembayaran otomatis ${d.planName} gagal`, intro: `Kami gagal menagih <strong>${amount}</strong> untuk perpanjangan keanggotaan Anda.`, body: 'Midtrans akan mencoba lagi dalam beberapa hari. Anda juga bisa membayar sekarang atau mengganti metode bayar.', button: 'Periksa pembayaran', path: account };
      case 'grace':
        return { subject: `Masa tenggang ${d.planName} dimulai`, intro: `Tagihan perpanjangan belum dibayar. Akses Anda tetap terbuka sampai ${date}.`, body: 'Bayar sebelum tanggal itu agar akses tidak terkunci.', button: 'Bayar tagihan', path: account };
      case 'locked':
        return { subject: `Akses ${d.planName} dikunci`, intro: 'Masa tenggang berakhir dan akses rak digital Anda dikunci.', body: `Progres baca dan catatan Anda tersimpan ${d.retentionMonths ?? 12} bulan. Berlangganan lagi untuk membukanya kembali.`, button: 'Berlangganan lagi', path: '/membership' };
      case 'planChanged':
        return d.change === 'downgrade_scheduled'
          ? { subject: `Perubahan paket dijadwalkan: ${d.planName}`, intro: `Paket Anda akan berubah menjadi <strong>${plan}</strong> (${cycle}) pada ${date}.`, body: 'Sampai tanggal itu manfaat paket saat ini tetap berlaku.', button: 'Kelola keanggotaan', path: account }
          : { subject: `Paket Anda sekarang ${d.planName}`, intro: `Paket Anda sekarang <strong>${plan}</strong> (${cycle}), berlaku sampai ${date}.`, body: d.change === 'upgrade' ? 'Batas perangkat dan akses rak digital sudah diperbarui.' : undefined, button: 'Buka Pustaka Saya', path: '/library' };
      case 'canceled':
        return { subject: `Keanggotaan ${d.planName} dibatalkan`, intro: `Pembatalan diterima. Akses Anda tetap berlaku sampai <strong>${date}</strong> dan tidak ada tagihan berikutnya.`, body: 'Berubah pikiran? Anda bisa membatalkan pembatalan dari halaman akun sebelum tanggal itu.', button: 'Kelola keanggotaan', path: account };
      case 'foundingNotice':
        return { subject: 'Harga Founding Member Anda akan berakhir', intro: `Harga Founding Member Anda berlaku sampai ${date}.`, body: `Perpanjangan berikutnya memakai harga reguler <strong>${rupiah(d.regularPrice)}</strong> per tahun. Anda bisa membatalkan atau mengubah paket sebelum tanggal itu.`, button: 'Kelola keanggotaan', path: account };
      case 'pickLocked':
        return { subject: `Digital Member Pick: ${d.productTitle}`, intro: `Pilihan Anda bulan ini, <strong>${escapeHtml(d.productTitle)}</strong>, sudah dikunci sampai ${date}.`, body: 'Anda bisa memilih judul lain pada periode berikutnya.', button: 'Mulai membaca', path: '/library' };
      case 'planMigration':
        return { subject: `Paket ${d.fromPlanName} berganti menjadi ${d.planName}`, intro: `Paket <strong>${escapeHtml(d.fromPlanName)}</strong> tidak lagi dijual. Mulai perpanjangan ${date}, keanggotaan Anda menjadi <strong>${plan}</strong> (${cycle}) dengan harga <strong>${amount}</strong>.`, body: 'Sampai tanggal itu paket Anda saat ini tetap berlaku. Anda bisa memilih paket lain atau membatalkan dari halaman akun sebelum tanggal itu.', button: 'Kelola keanggotaan', path: account };
      case 'titlePicked':
        return { subject: `Jatah bulan ini: ${d.productTitle}`, intro: `<strong>${escapeHtml(d.productTitle)}</strong> terbuka sampai ${date} (${d.used ?? 0} dari ${d.limit ?? 0} jatah bulan ini).`, body: 'Bulan berikutnya Anda memilih lagi; judul yang sama boleh dipilih kembali.', button: 'Mulai membaca', path: '/library' };
      case 'familyAdded':
        return { subject: 'Anda ditambahkan ke akun keluarga Platinum', intro: `${escapeHtml(d.ownerName)} menambahkan Anda ke akun keluarga <strong>${plan}</strong>, berlaku sampai ${date}.`, body: 'Anda mendapat rak, perangkat, dan jam audio sendiri.', button: 'Buka Pustaka Saya', path: '/library' };
    }
  }
  switch (kind) {
    case 'welcome':
      return { subject: `Welcome to ${d.planName}`, intro: `Your <strong>${plan}</strong> (${cycle}) membership is active until ${date}.`, body: 'Open My Library to see the digital shelf, your devices, and how renewal works.', button: 'Open My Library', path: '/library?welcome=1' };
    case 'invoice':
      return d.autodebit
        ? { subject: `${d.planName} renews on ${date}`, intro: `Your membership will renew automatically on ${date} for <strong>${amount}</strong>.`, body: 'No action is needed. You can cancel or change your payment method from your account page.', button: 'Manage membership', path: account }
        : { subject: `${d.planName} renewal invoice`, intro: `A renewal invoice of <strong>${amount}</strong> has been issued and is due on ${date}.`, body: 'Pay by Virtual Account or QRIS from your account page.', button: 'Pay invoice', path: account };
    case 'reminder':
      return { subject: d.days === 0 ? `Due today: ${d.planName}` : `${d.days} days left: ${d.planName} invoice`, intro: d.days === 0 ? `Your invoice of <strong>${amount}</strong> is due today.` : `Your invoice of <strong>${amount}</strong> is due in ${d.days} days (${date}).`, body: `After the due date there is a ${d.graceDays ?? 5}-day grace period with access still open.`, button: 'Pay invoice', path: account };
    case 'paymentFailed':
      return { subject: `${d.planName} automatic payment failed`, intro: `We could not charge <strong>${amount}</strong> for your membership renewal.`, body: 'Midtrans will retry over the next few days. You can also pay now or change your payment method.', button: 'Check payment', path: account };
    case 'grace':
      return { subject: `${d.planName} grace period started`, intro: `Your renewal invoice is unpaid. Your access stays open until ${date}.`, body: 'Pay before then to keep your access.', button: 'Pay invoice', path: account };
    case 'locked':
      return { subject: `${d.planName} access locked`, intro: 'The grace period has ended and your digital shelf access is locked.', body: `Your reading progress and notes are kept for ${d.retentionMonths ?? 12} months. Subscribe again to unlock them.`, button: 'Subscribe again', path: '/membership' };
    case 'planChanged':
      return d.change === 'downgrade_scheduled'
        ? { subject: `Plan change scheduled: ${d.planName}`, intro: `Your plan will change to <strong>${plan}</strong> (${cycle}) on ${date}.`, body: 'Until then your current plan benefits stay in place.', button: 'Manage membership', path: account }
        : { subject: `Your plan is now ${d.planName}`, intro: `Your plan is now <strong>${plan}</strong> (${cycle}), valid until ${date}.`, body: d.change === 'upgrade' ? 'Your device limit and digital shelf access have been updated.' : undefined, button: 'Open My Library', path: '/library' };
    case 'canceled':
      return { subject: `${d.planName} membership canceled`, intro: `Your cancellation is confirmed. Your access stays valid until <strong>${date}</strong> and there will be no further charge.`, body: 'Changed your mind? You can undo the cancellation from your account page before that date.', button: 'Manage membership', path: account };
    case 'foundingNotice':
      return { subject: 'Your Founding Member price is ending', intro: `Your Founding Member price is valid until ${date}.`, body: `The next renewal uses the regular price of <strong>${rupiah(d.regularPrice)}</strong> per year. You can cancel or change plans before then.`, button: 'Manage membership', path: account };
    case 'pickLocked':
      return { subject: `Digital Member Pick: ${d.productTitle}`, intro: `Your pick for this month, <strong>${escapeHtml(d.productTitle)}</strong>, is locked until ${date}.`, body: 'You can choose another title in the next period.', button: 'Start reading', path: '/library' };
    case 'planMigration':
      return { subject: `Your ${d.fromPlanName} plan becomes ${d.planName}`, intro: `The <strong>${escapeHtml(d.fromPlanName)}</strong> plan is no longer offered. From your renewal on ${date}, your membership becomes <strong>${plan}</strong> (${cycle}) at <strong>${amount}</strong>.`, body: 'Until then your current plan stays in place. You can choose another plan or cancel from your account page before that date.', button: 'Manage membership', path: account };
    case 'titlePicked':
      return { subject: `This month's pick: ${d.productTitle}`, intro: `<strong>${escapeHtml(d.productTitle)}</strong> is open until ${date} (${d.used ?? 0} of ${d.limit ?? 0} picks this month).`, body: 'Next month you pick again; you may choose the same title.', button: 'Start reading', path: '/library' };
    case 'familyAdded':
      return { subject: 'You were added to a Platinum family account', intro: `${escapeHtml(d.ownerName)} added you to a <strong>${plan}</strong> family account, valid until ${date}.`, body: 'You get your own shelf, devices, and audio hours.', button: 'Open My Library', path: '/library' };
  }
};

export const membershipEmail = (kind: MembershipEmailKind, data: MembershipEmailData): { subject: string; html: string } => {
  const lang: 'id' | 'en' = data.language === 'id' ? 'id' : 'en';
  const prefix = data.language === 'en' ? '/en' : data.language === 'zh' ? '/zh' : '';
  const copy = copyFor(kind, lang, data);
  const url = `${data.siteUrl}${prefix}${copy.path}`;
  const greeting = lang === 'id' ? `Halo ${escapeHtml(data.name)},` : `Hello ${escapeHtml(data.name)},`;
  const footer = lang === 'id'
    ? 'Email ini dikirim otomatis oleh CakraNexa (Cakrawala Magna Society). Kami tidak pernah meminta data kartu lewat email.'
    : 'This email was sent automatically by CakraNexa (Cakrawala Magna Society). We never ask for card details by email.';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 12px">CakraNexa</h2>
      <p>${greeting}</p>
      <p>${copy.intro}</p>
      ${copy.body ? `<p>${copy.body}</p>` : ''}
      <p style="margin:24px 0">
        <a href="${escapeHtml(url)}" style="background:#d4af37;color:#0f172a;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${copy.button}</a>
      </p>
      ${data.invoiceRef ? `<p style="font-size:12px;color:#94a3b8">${lang === 'id' ? 'Referensi' : 'Reference'} ${escapeHtml(data.invoiceRef)}</p>` : ''}
      <p style="font-size:12px;color:#94a3b8">${footer}</p>
    </div>`;
  return { subject: copy.subject.replace(/<[^>]+>/g, ''), html };
};
