import { escapeHtml, formatDate, rupiah } from '../membership/email';
import type { CompanyBankAccount, InstitutionLanguage } from './types';

/**
 * Email institusi (ragam formal, id & en) untuk kontak institusi dan admin institusinya. Tidak memuat data per anggota;
 * ringkasan penggunaan berbentuk agregat. Tautan invoice memakai token bertanda tangan (tanpa login).
 * renewalAdminEmail: email internal untuk admin CakraNexa (Bahasa Indonesia).
 */
export type InstitutionEmailKind =
  | 'invoiceIssued'
  | 'invoiceReminder'
  | 'invoiceOverdue'
  | 'activated'
  | 'paidScheduled'
  | 'trialStarted'
  | 'renewalNotice'
  | 'grace'
  | 'expired';

export interface InstitutionEmailData {
  language: InstitutionLanguage;
  institutionName: string;
  siteUrl: string;
  invoiceNumber?: string;
  total?: number;
  dueAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  accessEndsAt?: string | null;
  tierName?: string;
  concurrentUsers?: number;
  downloadUrl?: string | null;
  paymentUrl?: string | null;
  bankAccounts?: CompanyBankAccount[];
  days?: number;
  /** Perpanjangan: harga periode berikutnya; invoiceDate = tanggal invoice terbit otomatis (bila belum terbit). */
  renewal?: { price: number; total: number; scalePct: number; titleCount: number; periodStart: string; periodEnd: string; invoiceDate?: string | null } | null;
  usage?: { sessions: number; pagesRead: number; minutesListened: number; deniedConcurrency: number; topTitles: string[] } | null;
}

type Copy = { subject: string; paragraphs: string[]; button: { label: string; url: string } | null; showPayment: boolean };

const copyFor = (kind: InstitutionEmailKind, d: InstitutionEmailData): Copy => {
  const id = d.language === 'id';
  const date = (value: string | null | undefined) => escapeHtml(formatDate(value, d.language));
  const name = escapeHtml(d.institutionName);
  const tier = escapeHtml(d.tierName || '');
  const invoice = escapeHtml(d.invoiceNumber || '');
  const total = rupiah(d.total);
  const prefix = d.language === 'en' ? '/en' : '';
  const library = { label: id ? 'Buka Pustaka CakraNexa' : 'Open the CakraNexa library', url: `${d.siteUrl}${prefix}/library` };
  const download = d.downloadUrl ? { label: id ? 'Unduh invoice (PDF)' : 'Download invoice (PDF)', url: d.downloadUrl } : null;
  switch (kind) {
    case 'invoiceIssued':
      return {
        subject: id ? `Invoice ${d.invoiceNumber} — langganan institusi CakraNexa` : `Invoice ${d.invoiceNumber} — CakraNexa institutional subscription`,
        paragraphs: id
          ? [`Bersama ini kami sampaikan invoice <strong>${invoice}</strong> untuk langganan ${name} pada tingkat ${tier}, periode ${date(d.periodStart)} – ${date(d.periodEnd)}.`,
            `Total tagihan <strong>${total}</strong>, jatuh tempo ${date(d.dueAt)}. Akses anggota dibuka setelah pembayaran kami terima.`]
          : [`Please find invoice <strong>${invoice}</strong> for the ${tier} subscription of ${name}, period ${date(d.periodStart)} – ${date(d.periodEnd)}.`,
            `The total due is <strong>${total}</strong>, payable by ${date(d.dueAt)}. Member access opens once we receive payment.`],
        button: download,
        showPayment: true
      };
    case 'invoiceReminder':
      return {
        subject: id ? `Pengingat: invoice ${d.invoiceNumber} jatuh tempo ${formatDate(d.dueAt, 'id')}` : `Reminder: invoice ${d.invoiceNumber} is due on ${formatDate(d.dueAt, 'en')}`,
        paragraphs: id
          ? [`Invoice <strong>${invoice}</strong> sebesar <strong>${total}</strong> untuk ${name} jatuh tempo pada ${date(d.dueAt)}.`,
            'Abaikan email ini apabila pembayaran sudah dilakukan; konfirmasi akan kami kirim setelah dana diterima.']
          : [`Invoice <strong>${invoice}</strong> of <strong>${total}</strong> for ${name} is due on ${date(d.dueAt)}.`,
            'Please disregard this email if payment has been made; we will confirm once funds are received.'],
        button: download,
        showPayment: true
      };
    case 'invoiceOverdue':
      return {
        subject: id ? `Invoice ${d.invoiceNumber} telah melewati jatuh tempo` : `Invoice ${d.invoiceNumber} is overdue`,
        paragraphs: id
          ? [`Invoice <strong>${invoice}</strong> sebesar <strong>${total}</strong> untuk ${name} telah melewati jatuh tempo ${date(d.dueAt)}.`,
            'Mohon lakukan pembayaran atau hubungi kami apabila memerlukan penyesuaian jadwal.']
          : [`Invoice <strong>${invoice}</strong> of <strong>${total}</strong> for ${name} passed its due date of ${date(d.dueAt)}.`,
            'Please arrange payment, or contact us if you need to adjust the schedule.'],
        button: download,
        showPayment: true
      };
    case 'activated':
      return {
        subject: id ? `Pembayaran diterima — akses ${d.institutionName} aktif` : `Payment received — ${d.institutionName} access is active`,
        paragraphs: id
          ? [`Terima kasih. Pembayaran invoice <strong>${invoice}</strong> telah kami terima dan langganan ${name} tingkat ${tier} aktif sampai ${date(d.periodEnd)}.`,
            `Anggota institusi dapat membaca dan mendengarkan Digital Reading Shelf dengan ${d.concurrentUsers ?? '-'} pengguna bersamaan.`]
          : [`Thank you. We have received payment for invoice <strong>${invoice}</strong>, and the ${tier} subscription of ${name} is active until ${date(d.periodEnd)}.`,
            `Members can read and listen to the Digital Reading Shelf with ${d.concurrentUsers ?? '-'} concurrent users.`],
        button: library,
        showPayment: false
      };
    case 'paidScheduled':
      return {
        subject: id ? `Pembayaran diterima — periode baru ${d.institutionName}` : `Payment received — new period for ${d.institutionName}`,
        paragraphs: id
          ? [`Terima kasih. Pembayaran invoice <strong>${invoice}</strong> telah kami terima.`,
            `Periode langganan berikutnya berlaku ${date(d.periodStart)} – ${date(d.periodEnd)}; akses saat ini tetap berjalan sampai periode baru dimulai.`]
          : [`Thank you. We have received payment for invoice <strong>${invoice}</strong>.`,
            `The next subscription period runs ${date(d.periodStart)} – ${date(d.periodEnd)}; current access continues until then.`],
        button: null,
        showPayment: false
      };
    case 'trialStarted':
      return {
        subject: id ? `Uji coba CakraNexa untuk ${d.institutionName} dimulai` : `CakraNexa trial for ${d.institutionName} has started`,
        paragraphs: id
          ? [`Uji coba gratis ${name} aktif sampai ${date(d.periodEnd)} dengan ${d.concurrentUsers ?? '-'} pengguna bersamaan.`,
            'Setelah masa uji coba berakhir, akses ditutup otomatis tanpa tagihan. Hubungi kami untuk melanjutkan dengan kontrak tahunan.']
          : [`The free trial for ${name} is active until ${date(d.periodEnd)} with ${d.concurrentUsers ?? '-'} concurrent users.`,
            'When the trial ends, access closes automatically without charge. Contact us to continue with an annual contract.'],
        button: library,
        showPayment: false
      };
    case 'renewalNotice': {
      const r = d.renewal;
      const u = d.usage;
      const usage = u && (u.sessions > 0 || u.pagesRead > 0 || u.minutesListened > 0)
        ? (id
          ? `Ringkasan penggunaan periode ini: ${u.sessions.toLocaleString('id-ID')} sesi, ${u.pagesRead.toLocaleString('id-ID')} halaman dibaca, ${u.minutesListened.toLocaleString('id-ID')} menit didengarkan${u.deniedConcurrency > 0 ? `, ${u.deniedConcurrency.toLocaleString('id-ID')} kali akses tertunda karena semua slot terpakai` : ''}.${u.topTitles.length ? ` Judul terpopuler: ${u.topTitles.map(escapeHtml).join(', ')}.` : ''}`
          : `Usage this period: ${u.sessions.toLocaleString('en-GB')} sessions, ${u.pagesRead.toLocaleString('en-GB')} pages read, ${u.minutesListened.toLocaleString('en-GB')} minutes listened${u.deniedConcurrency > 0 ? `, ${u.deniedConcurrency.toLocaleString('en-GB')} access attempts delayed because all seats were in use` : ''}.${u.topTitles.length ? ` Most used titles: ${u.topTitles.map(escapeHtml).join(', ')}.` : ''}`)
        : (id ? 'Laporan penggunaan terperinci tersedia di dasbor admin institusi.' : 'A detailed usage report is available in the institution admin dashboard.');
      const hasInvoice = Boolean(d.invoiceNumber);
      const invoiceLine = hasInvoice
        ? (id
          ? `Invoice perpanjangan <strong>${invoice}</strong> sebesar <strong>${total}</strong> telah terbit dan jatuh tempo ${date(d.dueAt)}. Akses periode berikutnya berlanjut otomatis setelah pembayaran kami terima.`
          : `Renewal invoice <strong>${invoice}</strong> of <strong>${total}</strong> has been issued and is due on ${date(d.dueAt)}. Access for the next period continues automatically once we receive payment.`)
        : r?.invoiceDate
          ? (id
            ? `Invoice perpanjangan akan terbit otomatis pada ${date(r.invoiceDate)}. Apabila institusi tidak memperpanjang, mohon kabari kami sebelum tanggal tersebut dengan membalas email ini.`
            : `The renewal invoice will be issued automatically on ${date(r.invoiceDate)}. If the institution does not wish to renew, please let us know before then by replying to this email.`)
          : '';
      return {
        subject: id ? `Perpanjangan langganan ${d.institutionName}: ${d.days} hari lagi` : `${d.institutionName} subscription renewal: ${d.days} days left`,
        paragraphs: id
          ? [`Langganan ${name} tingkat ${tier} berakhir pada ${date(d.periodEnd)} (${d.days} hari lagi).`,
            r ? `Harga perpanjangan untuk periode ${date(r.periodStart)} – ${date(r.periodEnd)} adalah <strong>${rupiah(r.price)}</strong>${r.total !== r.price ? ` (total dengan PPN ${rupiah(r.total)})` : ''}, dihitung dari skala katalog ${r.scalePct}% (${r.titleCount} judul di rak saat ini).` : '',
            usage,
            invoiceLine]
          : [`The ${tier} subscription of ${name} ends on ${date(d.periodEnd)} (${d.days} days left).`,
            r ? `The renewal price for ${date(r.periodStart)} – ${date(r.periodEnd)} is <strong>${rupiah(r.price)}</strong>${r.total !== r.price ? ` (total incl. VAT ${rupiah(r.total)})` : ''}, based on a ${r.scalePct}% catalogue scale (${r.titleCount} titles currently on the shelf).` : '',
            usage,
            invoiceLine],
        button: hasInvoice ? download : null,
        showPayment: hasInvoice
      };
    }
    case 'grace':
      return {
        subject: id ? `Masa tenggang langganan ${d.institutionName}` : `${d.institutionName} subscription grace period`,
        paragraphs: id
          ? [`Periode langganan ${name} berakhir pada ${date(d.periodEnd)} dan pembayaran perpanjangan belum kami terima.`,
            `Akses anggota tetap dibuka selama masa tenggang sampai ${date(d.accessEndsAt)}. Setelah tanggal tersebut akses ditutup otomatis.`]
          : [`The subscription period of ${name} ended on ${date(d.periodEnd)} and we have not yet received the renewal payment.`,
            `Member access stays open during the grace period until ${date(d.accessEndsAt)}. After that date access closes automatically.`],
        button: download,
        showPayment: Boolean(d.invoiceNumber)
      };
    case 'expired':
      return {
        subject: id ? `Akses institusi ${d.institutionName} telah berakhir` : `${d.institutionName} institutional access has ended`,
        paragraphs: id
          ? [`Akses institusi ${name} ke Digital Reading Shelf CakraNexa telah berakhir pada ${date(d.accessEndsAt)}.`,
            'Progres baca anggota tetap tersimpan. Hubungi kami untuk mengaktifkan kembali langganan; anggota juga dapat berlangganan keanggotaan individu.']
          : [`The institutional access of ${name} to the CakraNexa Digital Reading Shelf ended on ${date(d.accessEndsAt)}.`,
            "Members' reading progress is kept. Contact us to reactivate the subscription; members may also take an individual membership."],
        button: { label: id ? 'Lihat program institusi' : 'View the institution programme', url: `${d.siteUrl}${prefix}/institutions` },
        showPayment: false
      };
  }
};

const paymentBlock = (d: InstitutionEmailData): string => {
  const id = d.language === 'id';
  const banks = d.bankAccounts ?? [];
  if (banks.length === 0 && !d.paymentUrl) return '';
  const rows = banks.map((b) =>
    `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(b.bankName)}</td><td style="padding:4px 12px 4px 0;font-family:monospace;font-weight:bold">${escapeHtml(b.accountNumber)}</td><td style="padding:4px 0">${escapeHtml(b.accountHolder)}${b.branch ? ` (${escapeHtml(b.branch)})` : ''}</td></tr>`).join('');
  return `
      <div style="background:#f8f6f1;border:1px solid #e5e0d5;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px">
        ${banks.length ? `<p style="margin:0 0 8px">${id ? 'Transfer ke rekening resmi berikut dan cantumkan nomor invoice pada berita transfer:' : 'Transfer to the following official account and state the invoice number in the reference:'}</p>
        <table style="border-collapse:collapse">${rows}</table>` : ''}
        ${d.paymentUrl ? `<p style="margin:8px 0 0">${id ? 'Atau bayar melalui Virtual Account:' : 'Or pay by Virtual Account:'} <a href="${escapeHtml(d.paymentUrl)}">${escapeHtml(d.paymentUrl)}</a></p>` : ''}
      </div>`;
};

export const institutionEmail = (kind: InstitutionEmailKind, data: InstitutionEmailData): { subject: string; html: string } => {
  const id = data.language === 'id';
  const copy = copyFor(kind, data);
  const greeting = id ? `Yth. Pengelola ${escapeHtml(data.institutionName)},` : `Dear ${escapeHtml(data.institutionName)} team,`;
  const closing = id ? 'Hormat kami,<br>Tim Institution & Library Network CakraNexa' : 'Kind regards,<br>CakraNexa Institution & Library Network team';
  const footer = id
    ? 'Email ini dikirim otomatis oleh CakraNexa (PT Cakrawala Magna Scientia) kepada kontak dan admin institusi. Tautan invoice bersifat pribadi; jangan diteruskan.'
    : 'This email was sent automatically by CakraNexa (PT Cakrawala Magna Scientia) to the institution contact and administrators. The invoice link is private; please do not forward it.';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 12px">CakraNexa</h2>
      <p>${greeting}</p>
      ${copy.paragraphs.filter(Boolean).map((p) => `<p>${p}</p>`).join('\n      ')}
      ${copy.showPayment ? paymentBlock(data) : ''}
      ${copy.button ? `<p style="margin:24px 0"><a href="${escapeHtml(copy.button.url)}" style="background:#d4af37;color:#0f172a;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(copy.button.label)}</a></p>` : ''}
      <p>${closing}</p>
      ${data.invoiceNumber ? `<p style="font-size:12px;color:#94a3b8">${id ? 'Referensi' : 'Reference'} ${escapeHtml(data.invoiceNumber)}</p>` : ''}
      <p style="font-size:12px;color:#94a3b8">${footer}</p>
    </div>`;
  return { subject: copy.subject.replace(/<[^>]+>/g, ''), html };
};

/**
 * Undangan anggota (Langkah 3) ke satu alamat email. Penerima masuk atau mendaftar dengan email yang sama; setelah
 * email terverifikasi, keanggotaan aktif otomatis. Tidak memuat data anggota lain.
 */
export const memberInviteEmail = (d: {
  language: InstitutionLanguage;
  institutionName: string;
  email: string;
  role: 'member' | 'admin';
  joinUrl: string;
}): { subject: string; html: string } => {
  const id = d.language === 'id';
  const name = escapeHtml(d.institutionName);
  const email = escapeHtml(d.email);
  const paragraphs = id
    ? [`${name} mengundang Anda ${d.role === 'admin' ? 'sebagai <strong>admin institusi</strong> ' : ''}untuk membaca dan mendengarkan koleksi e-book dan audiobook akademik CakraNexa melalui langganan institusi.`,
      `Masuk atau daftar dengan alamat email ini (<strong>${email}</strong>). Setelah email Anda terverifikasi, keanggotaan aktif otomatis.`]
    : [`${name} invites you ${d.role === 'admin' ? 'as an <strong>institution administrator</strong> ' : ''}to read and listen to the CakraNexa academic e-book and audiobook collection through the institutional subscription.`,
      `Sign in or register with this email address (<strong>${email}</strong>). Once your email is verified, your membership is activated automatically.`];
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 12px">CakraNexa</h2>
      ${paragraphs.map((p) => `<p>${p}</p>`).join('\n      ')}
      <p style="margin:24px 0"><a href="${escapeHtml(d.joinUrl)}" style="background:#d4af37;color:#0f172a;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${id ? 'Terima undangan' : 'Accept invitation'}</a></p>
      <p style="font-size:12px;color:#94a3b8">${id
        ? 'Abaikan email ini bila Anda tidak mengenal institusi tersebut. Email dikirim otomatis oleh CakraNexa (PT Cakrawala Magna Scientia).'
        : 'Ignore this email if you do not recognise the institution. Sent automatically by CakraNexa (PT Cakrawala Magna Scientia).'}</p>
    </div>`;
  return {
    subject: id ? `Undangan akses CakraNexa dari ${d.institutionName}` : `CakraNexa access invitation from ${d.institutionName}`,
    html
  };
};

/** Email internal H-45 ke admin CakraNexa: invoice perpanjangan akan terbit otomatis; bisa ditandai "tidak diperpanjang". */
export const renewalAdminEmail = (d: {
  institutionName: string;
  tierName: string;
  contactEmail: string | null;
  periodEnd: string;
  price: number;
  total: number;
  scalePct: number;
  titleCount: number;
  invoiceDate: string;
  adminUrl: string;
}): { subject: string; html: string } => {
  const date = (value: string) => escapeHtml(formatDate(value, 'id'));
  return {
    subject: `[Institusi] Invoice perpanjangan ${d.institutionName} terbit otomatis ${formatDate(d.invoiceDate, 'id')}`,
    html: `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 12px">Perpanjangan institusi</h2>
      <p>Kontrak <strong>${escapeHtml(d.institutionName)}</strong> (${escapeHtml(d.tierName)}) berakhir pada ${date(d.periodEnd)}.</p>
      <p>Invoice perpanjangan sebesar <strong>${escapeHtml(rupiah(d.total))}</strong>${d.total !== d.price ? ` (harga kontrak ${escapeHtml(rupiah(d.price))} + PPN)` : ''}
        akan <strong>terbit dan dikirim otomatis pada ${date(d.invoiceDate)}</strong> ke ${escapeHtml(d.contactEmail || 'kontak institusi')}.
        Harga dihitung dari skala katalog ${d.scalePct}% (${d.titleCount} judul di rak saat ini), tanpa diskon Founding.</p>
      <p>Bila institusi tidak memperpanjang, buka tab <strong>Institusi &amp; Kontrak</strong> dan pilih <strong>Tidak diperpanjang</strong> sebelum tanggal tersebut.</p>
      <p style="margin:24px 0"><a href="${escapeHtml(d.adminUrl)}" style="background:#0f172a;color:#dfbf64;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Buka dasbor admin</a></p>
      <p style="font-size:12px;color:#94a3b8">Email internal otomatis dari job kontrak institusi CakraNexa.</p>
    </div>`
  };
};
