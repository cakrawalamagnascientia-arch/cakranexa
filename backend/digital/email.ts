import type { OrderRecord } from './types';

/**
 * Template email produk digital. Email tidak pernah berisi file atau tautan unduhan — hanya tautan ke Pustaka Saya.
 * Pesanan berbahasa Mandarin memakai template Inggris.
 */
const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const rupiah = (amount: number) => `Rp ${Math.round(amount).toLocaleString('id-ID')}`;

const FORMAT_LABEL = { id: { ebook: 'E-Book', audiobook: 'Audiobook' }, en: { ebook: 'E-Book', audiobook: 'Audiobook' } } as const;

const LANGUAGE_PREFIX: Record<string, string> = { id: '', en: '/en', zh: '/zh' };

export const purchaseConfirmationEmail = (order: OrderRecord, siteUrl: string): { subject: string; html: string } => {
  const lang: 'id' | 'en' = order.language === 'id' ? 'id' : 'en';
  const libraryUrl = `${siteUrl}${LANGUAGE_PREFIX[order.language] ?? ''}/library`;
  const rows = order.items.map((item) =>
    `<tr><td style="padding:6px 0">${escapeHtml(item.title)} <span style="color:#64748b">(${FORMAT_LABEL[lang][item.format]})</span></td>`
    + `<td style="padding:6px 0;text-align:right;white-space:nowrap">${rupiah(item.unitPrice)}</td></tr>`).join('');

  const text = lang === 'id'
    ? {
        subject: `Pembelian digital berhasil — ${order.orderNumber}`,
        greeting: `Halo ${escapeHtml(order.customerName)},`,
        intro: 'Terima kasih. Pembayaran Anda sudah kami terima dan judul berikut sudah tersedia di Pustaka Saya:',
        total: 'Total',
        button: 'Buka Pustaka Saya',
        note: 'Email ini tidak berisi file. Baca atau dengarkan melalui Pustaka Saya setelah masuk ke akun Anda.',
        license: 'Pembelian ini merupakan lisensi personal non-eksklusif, bukan pengalihan hak cipta (UU No. 28 Tahun 2014 tentang Hak Cipta).'
      }
    : {
        subject: `Your digital purchase is ready — ${order.orderNumber}`,
        greeting: `Hello ${escapeHtml(order.customerName)},`,
        intro: 'Thank you. We have received your payment and the following titles are now in My Library:',
        total: 'Total',
        button: 'Open My Library',
        note: 'This email contains no files. Read or listen through My Library after signing in to your account.',
        license: 'This purchase is a personal, non-exclusive license, not a transfer of copyright (Indonesian Copyright Law No. 28 of 2014).'
      };

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
