import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatDate, rupiah } from '../membership/email';
import type { CompanyBankAccount, CompanyProfile, ContractRecord, InstitutionInvoiceRecord, InstitutionLanguage, InstitutionRecord } from './types';

/**
 * Invoice institusi (PDF, pdf-lib). Isi dokumen disusun dulu sebagai data (invoiceDocument, mudah dites), lalu digambar
 * dengan font standar Helvetica. Rekening dari CMS (admin_bank_accounts), identitas penerbit dari konten CMS.
 * Bukan Faktur Pajak.
 */

export interface InvoiceDocumentInput {
  language: InstitutionLanguage;
  company: CompanyProfile;
  bankAccounts: CompanyBankAccount[];
  institution: Pick<InstitutionRecord, 'name' | 'address' | 'contactName' | 'contactEmail' | 'npwp'>;
  invoice: Pick<InstitutionInvoiceRecord, 'number' | 'amount' | 'taxPct' | 'taxAmount' | 'total' | 'issuedAt' | 'dueAt'>;
  contract: Pick<ContractRecord,
    'concurrentUsers' | 'fullPrice' | 'catalogScalePct' | 'catalogTitleCountAtSigning' | 'foundingDiscountPct' | 'contractedPrice'
    | 'periodStart' | 'periodEnd' | 'ebaPct' | 'ebaCredit'>;
  tierName: string;
  /** Halaman bayar Midtrans (VA sekali bayar), bila dibuat admin. */
  paymentUrl: string | null;
}

export interface InvoiceDocument {
  title: string;
  subtitle: string;
  issuer: string[];
  meta: Array<[string, string]>;
  billToTitle: string;
  billTo: string[];
  description: string;
  items: Array<{ label: string; amount: string; strong?: boolean }>;
  paymentTitle: string;
  payment: string[];
  notes: string[];
}

const pct = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(2).replace(/\.?0+$/, '')}%`;

export const invoiceDocument = (input: InvoiceDocumentInput): InvoiceDocument => {
  const id = input.language === 'id';
  const { invoice, contract, institution, company } = input;
  const date = (value: string | null | undefined) => formatDate(value, input.language);
  const scaled = Math.round((contract.fullPrice * contract.catalogScalePct) / 100);
  const discount = scaled - contract.contractedPrice;
  const issuer = [company.name, company.address, [company.phone, company.email].filter(Boolean).join(' · '), company.npwp ? `NPWP ${company.npwp}` : '']
    .map((line) => line.trim())
    .filter(Boolean);
  const billTo = [
    institution.name,
    institution.contactName ? `${id ? 'u.p.' : 'Attn.'} ${institution.contactName}` : '',
    institution.address ?? '',
    institution.contactEmail ?? '',
    institution.npwp ? `NPWP ${institution.npwp}` : ''
  ].map((line) => line.trim()).filter(Boolean);

  const items: InvoiceDocument['items'] = [
    { label: id ? 'Harga penuh tahunan' : 'Full annual price', amount: rupiah(contract.fullPrice) },
    {
      label: id
        ? `Skala katalog ${pct(contract.catalogScalePct)} (${contract.catalogTitleCountAtSigning} judul di rak saat kontrak dibuat)`
        : `Catalogue scale ${pct(contract.catalogScalePct)} (${contract.catalogTitleCountAtSigning} titles on the shelf at signing)`,
      amount: rupiah(scaled)
    }
  ];
  if (contract.foundingDiscountPct > 0 && discount > 0) {
    items.push({
      label: id ? `Diskon Founding ${pct(contract.foundingDiscountPct)} (tahun pertama)` : `Founding discount ${pct(contract.foundingDiscountPct)} (first year)`,
      amount: `- ${rupiah(discount)}`
    });
  }
  items.push(
    { label: id ? 'Subtotal (harga kontrak)' : 'Subtotal (contract price)', amount: rupiah(invoice.amount), strong: true },
    { label: `${id ? 'PPN' : 'VAT'} ${pct(invoice.taxPct)}`, amount: rupiah(invoice.taxAmount) },
    { label: id ? 'Total tagihan' : 'Total due', amount: rupiah(invoice.total), strong: true }
  );

  const payment: string[] = [];
  if (input.bankAccounts.length > 0) {
    payment.push(id
      ? 'Transfer ke salah satu rekening resmi berikut dan cantumkan nomor invoice pada berita transfer:'
      : 'Please transfer to one of the following official accounts and state the invoice number in the transfer reference:');
    for (const bank of input.bankAccounts) {
      payment.push(`${bank.bankName} ${bank.accountNumber} ${id ? 'a.n.' : 'in the name of'} ${bank.accountHolder}${bank.branch ? ` (${bank.branch})` : ''}`);
    }
  }
  if (input.paymentUrl) {
    payment.push(id ? `Atau bayar melalui Virtual Account (Midtrans): ${input.paymentUrl}` : `Or pay by Virtual Account (Midtrans): ${input.paymentUrl}`);
  }

  const notes: string[] = [];
  if (contract.ebaCredit > 0) {
    notes.push(id
      ? `Kredit akuisisi (Evidence-Based Acquisition) ${pct(contract.ebaPct)} dari biaya yang dibayar, sebesar ${rupiah(contract.ebaCredit)}, tersedia di akhir periode kontrak untuk lisensi permanen judul atau pembelian buku cetak.`
      : `An acquisition credit (Evidence-Based Acquisition) of ${pct(contract.ebaPct)} of the fee paid, ${rupiah(contract.ebaCredit)}, becomes available at the end of the contract period for perpetual title licences or print purchases.`);
  }
  notes.push(
    id ? 'Harga kontrak dikunci selama periode kontrak.' : 'The contract price is locked for the contract period.',
    id ? 'Dokumen ini diterbitkan otomatis oleh sistem CakraNexa dan bukan Faktur Pajak.' : 'This document is issued automatically by the CakraNexa system and is not a tax invoice.'
  );

  return {
    title: 'INVOICE',
    subtitle: id
      ? 'Tagihan Langganan Institusi — CakraNexa Institution & Library Network'
      : 'Institutional Subscription Invoice — CakraNexa Institution & Library Network',
    issuer,
    meta: [
      [id ? 'Nomor invoice' : 'Invoice number', invoice.number],
      [id ? 'Tanggal terbit' : 'Issue date', date(invoice.issuedAt)],
      [id ? 'Jatuh tempo' : 'Due date', date(invoice.dueAt)],
      [id ? 'Periode kontrak' : 'Contract period', `${date(contract.periodStart)} – ${date(contract.periodEnd)}`]
    ],
    billToTitle: id ? 'Ditagihkan kepada' : 'Bill to',
    billTo,
    description: id
      ? `Akses Digital Reading Shelf CakraNexa, tingkat ${input.tierName}: ${contract.concurrentUsers} pengguna bersamaan, 12 bulan.`
      : `CakraNexa Digital Reading Shelf access, ${input.tierName} tier: ${contract.concurrentUsers} concurrent users, 12 months.`,
    items,
    paymentTitle: id ? 'Cara pembayaran' : 'How to pay',
    payment,
    notes
  };
};

// Karakter di luar WinAnsi (mis. aksara Tionghoa) tidak bisa digambar font standar; huruf beraksen diganti huruf dasar.
const WIN_ANSI_EXTRA = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'));
const isWinAnsi = (ch: string) => {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch);
};

export const pdfSafe = (text: string): string => Array.from(String(text ?? '').replace(/\s+/g, ' '))
  .map((ch) => {
    if (isWinAnsi(ch)) return ch;
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return base && Array.from(base).every(isWinAnsi) ? base : '?';
  })
  .join('');

const wrap = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
  const words = pdfSafe(text).split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  // Kata tunggal yang lebih lebar dari kolom (mis. URL panjang) dipotong per karakter.
  return lines.flatMap((line) => {
    if (font.widthOfTextAtSize(line, size) <= maxWidth) return [line];
    const parts: string[] = [];
    let part = '';
    for (const ch of line) {
      if (font.widthOfTextAtSize(part + ch, size) > maxWidth && part) {
        parts.push(part);
        part = '';
      }
      part += ch;
    }
    if (part) parts.push(part);
    return parts;
  });
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.4, 0.45, 0.52);
const GOLD = rgb(0.83, 0.69, 0.22);
const RULE = rgb(0.88, 0.86, 0.82);

export const renderInvoicePdf = async (input: InvoiceDocumentInput): Promise<Buffer> => {
  const doc = invoiceDocument(input);
  const pdf = await PDFDocument.create();
  const when = new Date(input.invoice.issuedAt ?? Date.now());
  pdf.setTitle(`Invoice ${input.invoice.number}`);
  pdf.setAuthor(pdfSafe(input.company.name));
  pdf.setSubject(pdfSafe(doc.subtitle));
  pdf.setCreator('CakraNexa');
  pdf.setProducer('CakraNexa');
  pdf.setCreationDate(when);
  pdf.setModificationDate(when);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const width = A4[0] - 2 * MARGIN;
  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGIN;
  const newPage = () => {
    page = pdf.addPage(A4);
    y = A4[1] - MARGIN;
  };
  const ensure = (height: number) => {
    if (y - height < MARGIN) newPage();
  };
  const write = (text: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; maxWidth?: number; gap?: number } = {}) => {
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    const x = options.x ?? MARGIN;
    for (const line of wrap(text, font, size, options.maxWidth ?? width - (x - MARGIN))) {
      ensure(size + (options.gap ?? 4));
      page.drawText(line, { x, y: y - size, size, font, color: options.color ?? INK });
      y -= size + (options.gap ?? 4);
    }
  };
  const rule = (space = 10) => {
    ensure(space * 2);
    y -= space;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.6, color: RULE });
    y -= space;
  };
  const heading = (text: string) => {
    ensure(24);
    write(text.toUpperCase(), { size: 8.5, font: bold, color: MUTED, gap: 6 });
  };

  // Kepala: pita emas, merek, judul INVOICE di kanan.
  page.drawRectangle({ x: 0, y: A4[1] - 8, width: A4[0], height: 8, color: GOLD });
  page.drawText(doc.title, { x: A4[0] - MARGIN - bold.widthOfTextAtSize(doc.title, 24), y: y - 24, size: 24, font: bold, color: INK });
  write('CakraNexa', { size: 20, font: bold, gap: 6 });
  for (const line of doc.issuer) write(line, { size: 9, color: MUTED, maxWidth: width - 140, gap: 3 });
  y -= 6;
  write(doc.subtitle, { size: 10, font: bold });
  rule();

  // Rincian invoice (kiri) & penerima (kanan).
  const top = y;
  const rightX = MARGIN + width / 2 + 20;
  // Nilai kolom kiri dibungkus agar tidak menimpa kolom penerima (mis. periode kontrak yang panjang).
  const valueWidth = rightX - 12 - (MARGIN + 95);
  for (const [label, value] of doc.meta) {
    const lines = wrap(value, bold, 9, valueWidth);
    ensure(lines.length * 12 + 4);
    page.drawText(pdfSafe(label), { x: MARGIN, y: y - 9, size: 9, font: regular, color: MUTED });
    lines.forEach((line, index) => page.drawText(line, { x: MARGIN + 95, y: y - 9 - index * 12, size: 9, font: bold, color: INK }));
    y -= 15 + (lines.length - 1) * 12;
  }
  const leftBottom = y;
  y = top;
  write(doc.billToTitle.toUpperCase(), { size: 8.5, font: bold, color: MUTED, x: rightX, gap: 5 });
  doc.billTo.forEach((line, index) => write(line, { size: index === 0 ? 10.5 : 9, font: index === 0 ? bold : regular, x: rightX, gap: 3 }));
  y = Math.min(y, leftBottom);
  rule();

  // Rincian harga.
  write(doc.description, { size: 10, gap: 8 });
  const amountRight = A4[0] - MARGIN;
  for (const item of doc.items) {
    const font = item.strong ? bold : regular;
    const size = item.strong ? 10.5 : 10;
    const lines = wrap(item.label, font, size, width - 150);
    ensure(lines.length * (size + 4) + 6);
    if (item.strong) {
      page.drawLine({ start: { x: MARGIN, y: y - 1 }, end: { x: amountRight, y: y - 1 }, thickness: 0.4, color: RULE });
      y -= 4;
    }
    const amount = pdfSafe(item.amount);
    page.drawText(amount, { x: amountRight - font.widthOfTextAtSize(amount, size), y: y - size, size, font, color: INK });
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color: INK });
      y -= size + 4;
    }
    y -= 3;
  }
  rule();

  // Pembayaran & catatan.
  if (doc.payment.length > 0) {
    heading(doc.paymentTitle);
    doc.payment.forEach((line, index) => write(index === 0 ? line : `• ${line}`, { size: 9.5, font: index === 0 ? regular : bold, gap: 4 }));
    y -= 6;
  }
  for (const note of doc.notes) write(note, { size: 8.5, color: MUTED, gap: 3 });

  return Buffer.from(await pdf.save());
};
