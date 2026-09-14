import type { OrderRecord } from './types';

/**
 * Template email produk digital (id/en/zh). Email tidak pernah berisi file atau tautan unduhan — hanya tautan ke
 * Pustaka Saya dalam bahasa pesanan.
 */
const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const rupiah = (amount: number) => `Rp ${Math.round(amount).toLocaleString('id-ID')}`;

type EmailLanguage = 'id' | 'en' | 'zh';

const FORMAT_LABEL: Record<EmailLanguage, { ebook: string; audiobook: string }> = {
  id: { ebook: 'E-Book', audiobook: 'Audiobook' },
  en: { ebook: 'E-Book', audiobook: 'Audiobook' },
  zh: { ebook: '电子书', audiobook: '有声书' }
};

const LANGUAGE_PREFIX: Record<EmailLanguage, string> = { id: '', en: '/en', zh: '/zh' };

const PURCHASE_TEXT: Record<EmailLanguage, (orderNumber: string, name: string) => {
  subject: string; greeting: string; intro: string; total: string; button: string; note: string; license: string;
}> = {
  id: (orderNumber, name) => ({
    subject: `Pembelian digital berhasil — ${orderNumber}`,
    greeting: `Halo ${name},`,
    intro: 'Terima kasih. Pembayaran Anda sudah kami terima dan judul berikut sudah tersedia di Pustaka Saya:',
    total: 'Total',
    button: 'Buka Pustaka Saya',
    note: 'Email ini tidak berisi file. Baca atau dengarkan melalui Pustaka Saya setelah masuk ke akun Anda.',
    license: 'Pembelian ini merupakan lisensi personal non-eksklusif, bukan pengalihan hak cipta (UU No. 28 Tahun 2014 tentang Hak Cipta).'
  }),
  en: (orderNumber, name) => ({
    subject: `Your digital purchase is ready — ${orderNumber}`,
    greeting: `Hello ${name},`,
    intro: 'Thank you. We have received your payment and the following titles are now in My Library:',
    total: 'Total',
    button: 'Open My Library',
    note: 'This email contains no files. Read or listen through My Library after signing in to your account.',
    license: 'This purchase is a personal, non-exclusive license, not a transfer of copyright (Indonesian Copyright Law No. 28 of 2014).'
  }),
  zh: (orderNumber, name) => ({
    subject: `数字产品购买成功 — ${orderNumber}`,
    greeting: `${name}，您好：`,
    intro: '感谢您的购买。我们已收到您的付款，以下产品现已添加到“我的书库”：',
    total: '合计',
    button: '打开我的书库',
    note: '本邮件不含任何文件。请登录账户后通过“我的书库”阅读或收听。',
    license: '本次购买为个人非独占许可，并非著作权转让（印度尼西亚 2014 年第 28 号著作权法）。'
  })
};

export const purchaseConfirmationEmail = (order: OrderRecord, siteUrl: string): { subject: string; html: string } => {
  const lang: EmailLanguage = order.language === 'en' || order.language === 'zh' ? order.language : 'id';
  const libraryUrl = `${siteUrl}${LANGUAGE_PREFIX[lang]}/library`;
  const rows = order.items.map((item) =>
    `<tr><td style="padding:6px 0">${escapeHtml(item.title)} <span style="color:#64748b">(${FORMAT_LABEL[lang][item.format]})</span></td>`
    + `<td style="padding:6px 0;text-align:right;white-space:nowrap">${rupiah(item.unitPrice)}</td></tr>`).join('');

  const text = PURCHASE_TEXT[lang](order.orderNumber, escapeHtml(order.customerName));

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 12px">CakraNexa</h2>
      <p>${text.greeting}</p>
      <p>${text.intro}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
        <tr><td style="padding:8px 0;border-top:1px solid #e2e8f0;font-weight:bold">${text.total}</td>
        <td style="padding:8px 0;border-top:1px solid #e2e8f0;text-align:right;font-weight:bold">${rupiah(order.amount)}</td></tr>
      </table>
      <p style="margin:24px 0">
        <a href="${escapeHtml(libraryUrl)}" style="background:#d4af37;color:#0f172a;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${text.button}</a>
      </p>
      <p style="font-size:12px;color:#475569">${text.note}</p>
      <p style="font-size:12px;color:#475569">${text.license}</p>
      <p style="font-size:12px;color:#94a3b8">Order ${escapeHtml(order.orderNumber)}</p>
    </div>`;
  return { subject: text.subject, html };
};

export interface AnomalyAlertItem {
  rule: string;
  userEmail: string;
  userName: string;
  productTitle: string | null;
  actionTaken: 'flagged' | 'suspended';
  details: Record<string, unknown>;
}

const RULE_LABEL: Record<string, string> = {
  ip_spread: 'Lebih dari 5 IP berbeda dalam 24 jam pada satu produk',
  device_limit_denials: 'Lebih dari 3 penolakan batas perangkat dalam 24 jam',
  page_speed: 'Membuka lebih dari 3 halaman/detik secara berkelanjutan'
};

export const anomalyAlertEmail = (items: AnomalyAlertItem[], adminUrl: string): { subject: string; html: string } => {
  const rows = items.map((item) => `
    <li style="margin-bottom:10px">
      <strong>${escapeHtml(item.userName || item.userEmail)}</strong> &lt;${escapeHtml(item.userEmail)}&gt;<br/>
      ${escapeHtml(RULE_LABEL[item.rule] || item.rule)}${item.productTitle ? ` — ${escapeHtml(item.productTitle)}` : ''}<br/>
      Tindakan: <strong>${item.actionTaken === 'suspended' ? 'entitlement ditangguhkan otomatis' : 'ditandai untuk ditinjau'}</strong><br/>
      <span style="color:#64748b;font-size:12px">${escapeHtml(JSON.stringify(item.details))}</span>
    </li>`).join('');
  return {
    subject: `[CakraNexa] ${items.length} anomali akses produk digital`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#0f172a">
        <h2>Anomali akses produk digital</h2>
        <p>Deteksi per jam menemukan pola akses berikut:</p>
        <ul>${rows}</ul>
        <p>Tinjau dan pulihkan akses di <a href="${escapeHtml(adminUrl)}">Dashboard Admin &rarr; Anomali</a>.</p>
      </div>`
  };
};
