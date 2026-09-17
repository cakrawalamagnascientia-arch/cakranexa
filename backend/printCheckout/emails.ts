import type { CompanyBankAccount } from '../digital/institution/types';
import { formatRupiahPlain, transferConfirmationText, whatsappLink } from '../../src/utils/transferConfirmation';
import { formatUniqueCode } from './uniqueCode';

/**
 * Email ke pembeli buku cetak (dikirim lewat Resend oleh server; bahasa mengikuti bahasa checkout: id, en, zh).
 * Email instruksi memuat nomor pesanan, nominal PERSIS termasuk ongkir dan kode unik, rekening PT, batas waktu,
 * tombol konfirmasi WhatsApp Finance, dan tautan halaman pesanan untuk mengunggah bukti transfer.
 */
export type PrintOrderEmailKind = 'instructions' | 'quoted' | 'extended' | 'awaitingQuote' | 'paid' | 'expired' | 'shipped';

export interface PrintOrderEmailData {
  language: string;
  orderNumber: string;
  buyerName: string;
  items: Array<{ title: string; quantity: number; subtotal: number }>;
  subtotal: number;
  shippingFee: number;
  shippingZone: string | null;
  uniqueCode: number | null;
  uniqueDiscount: number;
  total: number;
  dueAt: string | null;
  dueHours: number;
  /** 'USD' = pembeli membayar dari luar negeri (tanpa kode unik, batas hari kerja). */
  transferCurrency?: 'IDR' | 'USD' | null;
  dueBusinessDays?: number | null;
  manualQuoteMinCopies: number;
  /** Alasan ongkir diisi admin: pesanan besar (bulk) atau tarif kurir tidak tersedia (rates). */
  manualQuoteReason?: 'bulk' | 'rates';
  bankAccounts: CompanyBankAccount[];
  financeWhatsapp: string;
  orderUrl: string;
  companyName: string;
  trackingNumber?: string | null;
}

type Lang = 'id' | 'en' | 'zh';
const PAYMENT_KINDS: PrintOrderEmailKind[] = ['instructions', 'quoted', 'extended'];

const TEXT = {
  id: {
    locale: 'id-ID',
    subject: {
      instructions: (n: string) => `Instruksi pembayaran pesanan ${n}`,
      quoted: (n: string) => `Tagihan pesanan ${n}: ongkos kirim sudah ditentukan`,
      extended: (n: string) => `Batas waktu pembayaran pesanan ${n} diperpanjang`,
      awaitingQuote: (n: string) => `Pesanan ${n} diterima, menunggu ongkos kirim`,
      paid: (n: string) => `Pembayaran pesanan ${n} diterima`,
      expired: (n: string) => `Pesanan ${n} kedaluwarsa`,
      shipped: (n: string) => `Pesanan ${n} telah dikirim`
    },
    intro: {
      instructions: 'Terima kasih, pesanan Anda sudah kami terima. Selesaikan transfer sebelum batas waktu agar pesanan segera kami proses.',
      quoted: 'Ongkos kirim pesanan Anda sudah kami tentukan. Berikut tagihan dan instruksi pembayarannya.',
      extended: 'Batas waktu pembayaran pesanan Anda telah diperpanjang. Berikut instruksi pembayarannya.',
      awaitingQuote: (min: number) => `Pesanan Anda berisi ${min} eksemplar atau lebih, sehingga ongkos kirim dihitung manual oleh tim kami. Tagihan beserta instruksi pembayaran akan kami kirim ke email ini.`,
      awaitingQuoteRates: 'Terima kasih, pesanan Anda sudah kami terima. Ongkos kirim ke alamat Anda sedang kami cek langsung ke kurir. Tagihan beserta instruksi pembayaran akan kami kirim ke email ini.',
      paid: 'Pembayaran Anda telah kami terima dan konfirmasi. Pesanan sedang disiapkan; nomor resi kami kirim setelah paket diserahkan ke kurir.',
      expired: 'Kami belum menerima pembayaran sampai batas waktu, sehingga pesanan ini kami tutup. Silakan buat pesanan baru. Bila Anda sudah mentransfer, hubungi Finance lewat WhatsApp dan sertakan bukti transfer.',
      shipped: 'Pesanan Anda sudah diserahkan kepada ekspedisi dan sedang dikirim. Gunakan nomor resi berikut untuk pelacakan.'
    },
    greeting: (name: string) => `Halo ${name},`,
    orderNumber: 'Nomor pesanan',
    amountDue: 'Jumlah yang harus ditransfer',
    exactNote: 'Transfer tepat sampai 3 digit terakhir agar pembayaran cepat kami cocokkan.',
    subtotal: 'Subtotal buku',
    shipping: 'Ongkos kirim',
    uniqueDiscount: (code: string) => `Potongan kode unik (${code})`,
    total: 'Total',
    transferTo: 'Transfer ke rekening berikut',
    bank: 'Bank',
    accountNumber: 'Nomor rekening',
    accountHolder: 'Atas nama',
    deadline: 'Batas waktu pembayaran',
    deadlineNote: (hours: number) => `${hours} jam sejak tagihan terbit. Pesanan otomatis kedaluwarsa bila belum dibayar sampai batas waktu.`,
    deadlineNoteBusinessDays: (days: number) => `${days} hari kerja sejak tagihan terbit untuk transfer dari luar negeri. Pesanan otomatis kedaluwarsa bila belum dibayar sampai batas waktu.`,
    foreignTitle: 'Untuk pembayaran dari luar negeri',
    swift: 'Kode SWIFT',
    foreignNote: (n: string) => `Tagihan tetap dalam Rupiah. Transfer USD senilai nominal di atas (biaya bank pengirim ditanggung pengirim) dan tulis nomor pesanan ${n} di berita transfer.`,
    usdAmountNote: 'Nominal dalam Rupiah. Transfer USD dengan nilai setara; tanpa kode unik.',
    confirmWhatsApp: 'Konfirmasi via WhatsApp',
    viewOrder: 'Lihat pesanan dan unggah bukti transfer (opsional)',
    viewOrderPlain: 'Lihat pesanan',
    tracking: 'Nomor resi',
    closing: 'Salam,',
    copies: 'eks.'
  },
  en: {
    locale: 'en-GB',
    subject: {
      instructions: (n: string) => `Payment instructions for order ${n}`,
      quoted: (n: string) => `Invoice for order ${n}: shipping cost confirmed`,
      extended: (n: string) => `Payment deadline for order ${n} extended`,
      awaitingQuote: (n: string) => `Order ${n} received, awaiting shipping cost`,
      paid: (n: string) => `Payment for order ${n} received`,
      expired: (n: string) => `Order ${n} has expired`,
      shipped: (n: string) => `Order ${n} has been shipped`
    },
    intro: {
      instructions: 'Thank you, we have received your order. Please complete the bank transfer before the deadline so we can process it.',
      quoted: 'We have confirmed the shipping cost for your order. Your invoice and payment instructions are below.',
      extended: 'The payment deadline for your order has been extended. Your payment instructions are below.',
      awaitingQuote: (min: number) => `Your order has ${min} or more copies, so our team calculates the shipping cost manually. We will send the invoice and payment instructions to this email address.`,
      awaitingQuoteRates: 'Thank you, we have received your order. We are checking the shipping cost to your address directly with the courier and will send the invoice and payment instructions to this email address.',
      paid: 'We have received and confirmed your payment. Your order is being prepared; we will send the tracking number once the parcel is handed to the courier.',
      expired: 'We did not receive payment before the deadline, so this order has been closed. Please place a new order. If you have already transferred, contact our Finance team on WhatsApp with your transfer receipt.',
      shipped: 'Your order has been handed to the courier and is on its way. Use the tracking number below to follow the delivery.'
    },
    greeting: (name: string) => `Dear ${name},`,
    orderNumber: 'Order number',
    amountDue: 'Amount to transfer',
    exactNote: 'Please transfer the exact amount, including the last 3 digits, so we can match your payment quickly.',
    subtotal: 'Books subtotal',
    shipping: 'Shipping',
    uniqueDiscount: (code: string) => `Unique code discount (${code})`,
    total: 'Total',
    transferTo: 'Transfer to the following account',
    bank: 'Bank',
    accountNumber: 'Account number',
    accountHolder: 'Account name',
    deadline: 'Payment deadline',
    deadlineNote: (hours: number) => `${hours} hours after the invoice is issued. The order expires automatically if unpaid by the deadline.`,
    deadlineNoteBusinessDays: (days: number) => `${days} business days after the invoice is issued for transfers from abroad. The order expires automatically if unpaid by the deadline.`,
    foreignTitle: 'For payments from abroad',
    swift: 'SWIFT code',
    foreignNote: (n: string) => `The invoice stays in Indonesian rupiah. Transfer the USD equivalent of the amount above (sender bank fees are borne by the sender) and write order number ${n} in the transfer reference.`,
    usdAmountNote: 'Amount in Indonesian rupiah. Transfer the equivalent in USD; no unique code applies.',
    confirmWhatsApp: 'Confirm via WhatsApp',
    viewOrder: 'View order and upload transfer receipt (optional)',
    viewOrderPlain: 'View order',
    tracking: 'Tracking number',
    closing: 'Kind regards,',
    copies: 'cop.'
  },
  zh: {
    locale: 'zh-CN',
    subject: {
      instructions: (n: string) => `订单 ${n} 付款说明`,
      quoted: (n: string) => `订单 ${n} 账单：运费已确定`,
      extended: (n: string) => `订单 ${n} 付款期限已延长`,
      awaitingQuote: (n: string) => `订单 ${n} 已收到，等待运费报价`,
      paid: (n: string) => `订单 ${n} 已收到付款`,
      expired: (n: string) => `订单 ${n} 已过期`,
      shipped: (n: string) => `订单 ${n} 已发货`
    },
    intro: {
      instructions: '感谢您的订购，我们已收到您的订单。请在付款期限前完成银行转账，以便我们尽快处理订单。',
      quoted: '您订单的运费已确定。以下是账单及付款说明。',
      extended: '您订单的付款期限已延长。以下是付款说明。',
      awaitingQuote: (min: number) => `您的订单包含 ${min} 本或以上，运费将由我们的团队人工计算。账单及付款说明将发送至此邮箱。`,
      awaitingQuoteRates: '感谢您的订单。我们正在向快递公司核实寄往您地址的运费，账单及付款说明将发送至此邮箱。',
      paid: '我们已收到并确认您的付款。订单正在准备中；包裹交付快递后，我们会发送运单号。',
      expired: '我们在付款期限前未收到付款，因此该订单已关闭。请重新下单。如您已转账，请通过 WhatsApp 联系财务并附上转账凭证。',
      shipped: '您的订单已交给快递公司，正在配送中。请使用以下运单号查询物流。'
    },
    greeting: (name: string) => `${name}，您好：`,
    orderNumber: '订单号',
    amountDue: '应转账金额',
    exactNote: '请按精确金额（含最后三位数）转账，以便我们快速核对。',
    subtotal: '图书小计',
    shipping: '运费',
    uniqueDiscount: (code: string) => `唯一码优惠（${code}）`,
    total: '合计',
    transferTo: '请转账至以下账户',
    bank: '银行',
    accountNumber: '账号',
    accountHolder: '户名',
    deadline: '付款期限',
    deadlineNote: (hours: number) => `账单开具后 ${hours} 小时。逾期未付款，订单将自动过期。`,
    deadlineNoteBusinessDays: (days: number) => `境外转账的付款期限为账单开具后 ${days} 个工作日。逾期未付款，订单将自动过期。`,
    foreignTitle: '境外付款',
    swift: 'SWIFT 代码',
    foreignNote: (n: string) => `账单金额以印尼盾计。请转账与上述金额等值的美元（汇款行手续费由汇款人承担），并在转账附言中注明订单号 ${n}。`,
    usdAmountNote: '金额以印尼盾计。请以等值美元转账，不适用唯一码。',
    confirmWhatsApp: '通过 WhatsApp 确认',
    viewOrder: '查看订单并上传转账凭证（可选）',
    viewOrderPlain: '查看订单',
    tracking: '运单号',
    closing: '此致',
    copies: '本'
  }
} as const;

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const langOf = (language: string): Lang => (language === 'en' || language === 'zh' ? language : 'id');

/** Batas waktu dalam WIB, mis. "Rabu, 16 September 2026 pukul 10.15 WIB". */
export const formatDeadline = (iso: string, language: string): string => {
  const t = TEXT[langOf(language)];
  return `${new Date(iso).toLocaleString(t.locale, { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'short' })} WIB`;
};

export const printOrderEmail = (kind: PrintOrderEmailKind, d: PrintOrderEmailData): { subject: string; html: string } => {
  const lang = langOf(d.language);
  const t = TEXT[lang];
  const money = (n: number) => escapeHtml(formatRupiahPlain(n));
  const intro = kind === 'awaitingQuote'
    ? (d.manualQuoteReason === 'rates' ? t.intro.awaitingQuoteRates : t.intro.awaitingQuote(d.manualQuoteMinCopies))
    : t.intro[kind];
  const row = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#475569">${escapeHtml(label)}</td><td style="padding:4px 0;text-align:right;${bold ? 'font-weight:bold;' : ''}">${value}</td></tr>`;

  const itemRows = d.items.map((item) =>
    `<tr><td style="padding:3px 16px 3px 0">${escapeHtml(item.title)} × ${item.quantity}</td><td style="padding:3px 0;text-align:right">${money(item.subtotal)}</td></tr>`).join('');

  const breakdown = [
    row(t.subtotal, money(d.subtotal)),
    kind === 'awaitingQuote' ? '' : row(`${t.shipping}${d.shippingZone ? ` (${d.shippingZone})` : ''}`, money(d.shippingFee)),
    d.uniqueDiscount > 0 && d.uniqueCode !== null ? row(t.uniqueDiscount(formatUniqueCode(d.uniqueCode)), `−${money(d.uniqueDiscount)}`) : '',
    kind === 'awaitingQuote' ? '' : row(t.total, money(d.total), true)
  ].join('');

  let payment = '';
  if (PAYMENT_KINDS.includes(kind)) {
    const waText = transferConfirmationText({ orderNumber: d.orderNumber, amount: d.total, buyerName: d.buyerName });
    // Rekening IDR sebagai rekening utama; rekening USD di bawahnya untuk pembayaran dari luar negeri.
    const usdPath = d.transferCurrency === 'USD';
    const local = d.bankAccounts.filter((b) => b.currency !== 'USD');
    const foreign = d.bankAccounts.filter((b) => b.currency === 'USD');
    const accounts = local.map((b) =>
      `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(b.bankName)}${b.currency ? ` (${escapeHtml(b.currency)})` : ''}${b.branch ? ` - ${escapeHtml(b.branch)}` : ''}</td>` +
      `<td style="padding:4px 12px 4px 0;font-family:monospace;font-weight:bold">${escapeHtml(b.accountNumber)}</td>` +
      `<td style="padding:4px 0">${escapeHtml(b.accountHolder)}</td></tr>`).join('');
    const label = (text: string) => `<td style="padding:2px 12px 2px 0;color:#64748B">${escapeHtml(text)}</td>`;
    const foreignBlock = foreign.length === 0 ? '' : `
      <p style="margin:16px 0 6px;font-weight:bold">${escapeHtml(t.foreignTitle)}</p>
      ${foreign.map((b) => `<table style="border-collapse:collapse;font-size:14px;margin-bottom:6px">
        <tr>${label(t.bank)}<td>${escapeHtml(b.bankName)} (USD)${b.branch ? ` - ${escapeHtml(b.branch)}` : ''}</td></tr>
        <tr>${label(t.accountHolder)}<td>${escapeHtml(b.accountHolder)}</td></tr>
        <tr>${label(t.accountNumber)}<td style="font-family:monospace;font-weight:bold">${escapeHtml(b.accountNumber)}</td></tr>
        ${b.swiftCode ? `<tr>${label(t.swift)}<td style="font-family:monospace;font-weight:bold">${escapeHtml(b.swiftCode)}</td></tr>` : ''}
      </table>`).join('')}
      <p style="margin:4px 0 0;font-size:12px;color:#475569">${escapeHtml(t.foreignNote(d.orderNumber))}</p>`;
    const deadlineNote = usdPath && d.dueBusinessDays ? t.deadlineNoteBusinessDays(d.dueBusinessDays) : t.deadlineNote(d.dueHours);
    payment = `
      <div style="margin:20px 0;padding:16px;border:2px solid #D4AF37;border-radius:10px;background:#FFFBEB">
        <div style="font-size:12px;color:#92400E;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(t.amountDue)}</div>
        <div style="font-size:26px;font-weight:bold;font-family:monospace;color:#0F172A">${money(d.total)}</div>
        <div style="font-size:12px;color:#92400E">${escapeHtml(usdPath ? t.usdAmountNote : t.exactNote)}</div>
      </div>
      <p style="margin:16px 0 6px;font-weight:bold">${escapeHtml(t.transferTo)}</p>
      <table style="border-collapse:collapse;font-size:14px">
        <tr style="color:#64748B;font-size:12px"><td style="padding:2px 12px 2px 0">${escapeHtml(t.bank)}</td><td style="padding:2px 12px 2px 0">${escapeHtml(t.accountNumber)}</td><td>${escapeHtml(t.accountHolder)}</td></tr>
        ${accounts}
      </table>
      ${foreignBlock}
      ${d.dueAt ? `<p style="margin:16px 0 4px"><strong>${escapeHtml(t.deadline)}:</strong> ${escapeHtml(formatDeadline(d.dueAt, lang))}</p>
      <p style="margin:0;font-size:12px;color:#64748B">${escapeHtml(deadlineNote)}</p>` : ''}
      <p style="margin:20px 0">
        <a href="${escapeHtml(whatsappLink(d.financeWhatsapp, waText))}" style="display:inline-block;padding:10px 16px;background:#059669;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(t.confirmWhatsApp)}</a>
      </p>`;
  }

  const expiredContact = kind === 'expired'
    ? `<p><a href="${escapeHtml(whatsappLink(d.financeWhatsapp, transferConfirmationText({ orderNumber: d.orderNumber, amount: d.total, buyerName: d.buyerName })))}">${escapeHtml(t.confirmWhatsApp)}</a></p>`
    : '';
  const tracking = (kind === 'paid' || kind === 'shipped') && d.trackingNumber ? `<p><strong>${escapeHtml(t.tracking)}:</strong> ${escapeHtml(d.trackingNumber)}</p>` : '';

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0F172A;max-width:600px">
  <p>${escapeHtml(t.greeting(d.buyerName))}</p>
  <p>${escapeHtml(intro)}</p>
  <p><strong>${escapeHtml(t.orderNumber)}:</strong> <span style="font-family:monospace">${escapeHtml(d.orderNumber)}</span></p>
  <table style="border-collapse:collapse;font-size:14px;margin:8px 0">${itemRows}${breakdown}</table>
  ${payment}
  ${tracking}
  ${expiredContact}
  <p><a href="${escapeHtml(d.orderUrl)}">${escapeHtml(PAYMENT_KINDS.includes(kind) ? t.viewOrder : t.viewOrderPlain)}</a></p>
  <p style="margin-top:24px">${escapeHtml(t.closing)}<br/>${escapeHtml(d.companyName)}</p>
</div>`;
  return { subject: `${t.subject[kind](d.orderNumber)} — CakraNexa`, html };
};
