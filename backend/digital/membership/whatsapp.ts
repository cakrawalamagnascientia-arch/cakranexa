import type { WhatsAppConfig } from '../config';
import { formatDate, rupiah, type MembershipEmailData, type MembershipEmailKind } from './email';

/**
 * Pengingat keanggotaan lewat WhatsApp dari nomor resmi CakraNexa (WHATSAPP_SENDER_NUMBER, bawaan +62 852 8614 6806).
 * Hanya untuk anggota yang mengisi nomor dan menyetujui pengingat WhatsApp; email tetap selalu dikirim.
 * Gateway (WHATSAPP_PROVIDER):
 *  - fonnte: nomor tersambung ke Fonnte lewat pindai QR (nomor tetap bisa dipakai di HP); pesan teks bebas.
 *  - cloud:  WhatsApp Cloud API resmi Meta; pesan keluar wajib memakai template yang sudah disetujui
 *            (nama `<WHATSAPP_TEMPLATE_PREFIX><jenis>`, parameter berurutan: lihat docs/SETUP-KEANGGOTAAN.md).
 * Tanpa token, gateway tidak dibuat dan hanya email yang terkirim.
 */

export type WhatsAppKind = Extract<MembershipEmailKind, 'invoice' | 'reminder' | 'paymentFailed' | 'grace' | 'locked' | 'foundingNotice' | 'transferInstructions' | 'transferExpired'>;
export const WHATSAPP_KINDS: readonly WhatsAppKind[] = ['invoice', 'reminder', 'paymentFailed', 'grace', 'locked', 'foundingNotice', 'transferInstructions', 'transferExpired'];
export const isWhatsAppKind = (kind: MembershipEmailKind): kind is WhatsAppKind => (WHATSAPP_KINDS as readonly string[]).includes(kind);

/** Nomor seluler Indonesia -> format internasional tanpa '+', mis. "0852 8614 6806" -> "6285286146806". null bila tidak valid. */
export const normalizeWhatsAppNumber = (input: unknown): string | null => {
  let digits = String(input ?? '').trim().replace(/[\s().-]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return /^628\d{7,11}$/.test(digits) ? digits : null;
};

/** "6285286146806" -> "+62 852 8614 6806". */
export const formatWhatsAppNumber = (digits: string): string =>
  `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)} ${digits.slice(9)}`.trim();

export interface WhatsAppMessage {
  /** Teks bebas (Fonnte). */
  text: string;
  /** Template Cloud API: nama + parameter body berurutan (tanpa baris baru). */
  template: { name: string; params: string[] };
}

export interface WhatsAppStatus {
  ok: boolean;
  detail: string;
  /** Nomor yang benar-benar tersambung ke gateway (untuk dicocokkan dengan WHATSAPP_SENDER_NUMBER). */
  connectedNumber: string | null;
}

export interface WhatsAppSender {
  readonly provider: 'fonnte' | 'cloud';
  send(to: string, message: WhatsAppMessage, language: string): Promise<void>;
  status(): Promise<WhatsAppStatus>;
}

const LANGUAGE_PREFIX: Record<string, string> = { id: '', en: '/en', zh: '/zh' };
const snake = (value: string) => value.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Pesan pengingat (id & en; bahasa lain memakai en). */
export const membershipWhatsApp = (kind: WhatsAppKind, d: MembershipEmailData, templatePrefix = 'cnx_'): WhatsAppMessage => {
  const lang: 'id' | 'en' = d.language === 'id' ? 'id' : 'en';
  const link = `${d.siteUrl}${LANGUAGE_PREFIX[d.language] ?? ''}/account/membership`;
  const name = d.name;
  const plan = d.planName || 'CakraNexa';
  const amount = rupiah(d.amount);
  const date = formatDate(d.date, lang);
  const days = d.days ?? 0;
  const months = String(d.retentionMonths ?? 12);
  const price = rupiah(d.regularPrice);
  const daysLabel = lang === 'id' ? (days > 0 ? `${days} hari lagi` : 'hari ini') : (days > 0 ? `in ${days} days` : 'today');
  const deadline = d.date
    ? new Date(d.date).toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB'
    : '-';
  const plansLink = `${d.siteUrl}${LANGUAGE_PREFIX[d.language] ?? ''}/membership`;

  let body: string;
  let params: string[];
  let template = `${templatePrefix}${snake(kind)}`;
  if (lang === 'id') {
    switch (kind) {
      case 'invoice':
        if (d.autodebit) {
          template = `${templatePrefix}invoice_autodebit`;
          body = `Halo ${name}, keanggotaan ${plan} akan diperpanjang otomatis pada ${date} sebesar ${amount}. Rincian: ${link}`;
        } else {
          body = `Halo ${name}, tagihan perpanjangan keanggotaan ${plan} sebesar ${amount} (transfer bank, termasuk kode unik) sudah terbit dan jatuh tempo ${date}. Rekening dan unggah bukti: ${link}`;
        }
        params = [name, plan, amount, date, link];
        break;
      case 'reminder':
        body = days > 0
          ? `Halo ${name}, pengingat: tagihan keanggotaan ${plan} sebesar ${amount} jatuh tempo ${date} (${daysLabel}). Bayar di: ${link}`
          : `Halo ${name}, tagihan keanggotaan ${plan} sebesar ${amount} jatuh tempo hari ini (${date}). Setelah itu ada masa tenggang ${d.graceDays ?? 5} hari. Bayar di: ${link}`;
        params = [name, plan, amount, date, daysLabel, link];
        break;
      case 'paymentFailed':
        body = `Halo ${name}, pembayaran keanggotaan ${plan} sebesar ${amount} belum berhasil. Lihat tagihan dan instruksi transfer di: ${link}`;
        params = [name, plan, amount, link];
        break;
      case 'grace':
        body = `Halo ${name}, tagihan keanggotaan ${plan} belum dibayar. Akses tetap terbuka sampai ${date} (masa tenggang). Bayar di: ${link}`;
        params = [name, plan, date, link];
        break;
      case 'locked':
        body = `Halo ${name}, akses keanggotaan ${plan} dikunci karena tagihan belum dibayar. Progres baca dan catatan Anda disimpan ${months} bulan. Berlangganan lagi di: ${link}`;
        params = [name, plan, months, link];
        break;
      case 'foundingNotice':
        body = `Halo ${name}, harga Founding Member untuk ${plan} berlaku sampai ${date}. Perpanjangan berikutnya memakai harga reguler ${price}/tahun. Rincian: ${link}`;
        params = [name, plan, date, price, link];
        break;
      case 'transferInstructions':
        body = `Halo ${name}, terima kasih telah memilih paket ${plan}. Transfer tepat ${amount} (termasuk kode unik) sebelum ${deadline}. Rekening tujuan, bukti transfer, dan konfirmasi Finance: ${link}`;
        params = [name, plan, amount, deadline, link];
        break;
      case 'transferExpired':
        body = `Halo ${name}, batas transfer paket ${plan} sebesar ${amount} sudah lewat sehingga tagihan ditutup. Bila sudah mentransfer, kirim bukti ke Finance. Pilih paket lagi di: ${plansLink}`;
        params = [name, plan, amount, plansLink];
        break;
    }
    return { text: `${body}\n\nPesan otomatis CakraNexa. Untuk berhenti menerima pengingat WhatsApp, matikan di ${link}`, template: { name: template, params } };
  }
  switch (kind) {
    case 'invoice':
      if (d.autodebit) {
        template = `${templatePrefix}invoice_autodebit`;
        body = `Hello ${name}, your ${plan} membership will renew automatically on ${date} for ${amount}. Details: ${link}`;
      } else {
        body = `Hello ${name}, your ${plan} membership renewal invoice of ${amount} (bank transfer, unique code included) has been issued and is due on ${date}. Accounts and proof upload: ${link}`;
      }
      params = [name, plan, amount, date, link];
      break;
    case 'reminder':
      body = days > 0
        ? `Hello ${name}, reminder: your ${plan} membership invoice of ${amount} is due on ${date} (${daysLabel}). Pay at: ${link}`
        : `Hello ${name}, your ${plan} membership invoice of ${amount} is due today (${date}). A ${d.graceDays ?? 5}-day grace period follows. Pay at: ${link}`;
      params = [name, plan, amount, date, daysLabel, link];
      break;
    case 'paymentFailed':
      body = `Hello ${name}, the payment of ${amount} for your ${plan} membership has not gone through. See the invoice and transfer instructions at: ${link}`;
      params = [name, plan, amount, link];
      break;
    case 'grace':
      body = `Hello ${name}, your ${plan} membership invoice is unpaid. Access stays open until ${date} (grace period). Pay at: ${link}`;
      params = [name, plan, date, link];
      break;
    case 'locked':
      body = `Hello ${name}, your ${plan} membership access is locked because the invoice is unpaid. Your reading progress and notes are kept for ${months} months. Subscribe again at: ${link}`;
      params = [name, plan, months, link];
      break;
    case 'foundingNotice':
      body = `Hello ${name}, your Founding Member price for ${plan} applies until ${date}. The next renewal uses the regular price of ${price}/year. Details: ${link}`;
      params = [name, plan, date, price, link];
      break;
    case 'transferInstructions':
      body = `Hello ${name}, thank you for choosing ${plan}. Please transfer exactly ${amount} (unique code included) before ${deadline}. Bank accounts, proof upload, and Finance confirmation: ${link}`;
      params = [name, plan, amount, deadline, link];
      break;
    case 'transferExpired':
      body = `Hello ${name}, the transfer deadline for ${plan} (${amount}) has passed, so the invoice was closed. If you already transferred, send the proof to Finance. Choose a plan again at: ${plansLink}`;
      params = [name, plan, amount, plansLink];
      break;
  }
  return { text: `${body}\n\nAutomated message from CakraNexa. To stop WhatsApp reminders, turn them off at ${link}`, template: { name: template, params } };
};

/** Pesan uji dari admin (Cloud API: template bawaan Meta "hello_world"). */
export const whatsappTestMessage = (): WhatsAppMessage => ({
  text: 'Pesan uji pengingat keanggotaan CakraNexa. Bila pesan ini diterima, integrasi WhatsApp berfungsi.',
  template: { name: 'hello_world', params: [] }
});

const readJson = async (response: Response): Promise<any> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/** Fonnte (https://fonnte.com): token perangkat dari dashboard Fonnte setelah nomor dipindai QR. */
export const createFonnteSender = (token: string, fetchImpl: typeof fetch = fetch): WhatsAppSender => ({
  provider: 'fonnte',
  async send(to, message) {
    const response = await fetchImpl('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ target: to, message: message.text, countryCode: '62' }).toString()
    });
    const data = await readJson(response);
    if (!response.ok || data?.status !== true) throw new Error(`Fonnte: ${data?.reason || data?.detail || `HTTP ${response.status}`}`);
  },
  async status() {
    const response = await fetchImpl('https://api.fonnte.com/device', { method: 'POST', headers: { Authorization: token } });
    const data = await readJson(response);
    return {
      ok: Boolean(response.ok && data?.status === true && String(data?.device_status || '').toLowerCase() === 'connect'),
      detail: String(data?.device_status || data?.reason || `HTTP ${response.status}`),
      connectedNumber: normalizeWhatsAppNumber(data?.device)
    };
  }
});

/** WhatsApp Cloud API (Meta): token sistem + Phone Number ID nomor bisnis yang terdaftar. */
export const createCloudSender = (options: { token: string; phoneNumberId: string; apiVersion: string }, fetchImpl: typeof fetch = fetch): WhatsAppSender => {
  const base = `https://graph.facebook.com/${options.apiVersion}/${encodeURIComponent(options.phoneNumberId)}`;
  const headers = { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' };
  return {
    provider: 'cloud',
    async send(to, message, language) {
      const code = message.template.name === 'hello_world' ? 'en_US' : language === 'id' ? 'id' : 'en';
      const template: Record<string, unknown> = { name: message.template.name, language: { code } };
      if (message.template.params.length > 0) {
        template.components = [{ type: 'body', parameters: message.template.params.map((text) => ({ type: 'text', text })) }];
      }
      const response = await fetchImpl(`${base}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template })
      });
      const data = await readJson(response);
      if (!response.ok || data?.error) throw new Error(`WhatsApp Cloud: ${data?.error?.message || `HTTP ${response.status}`}`);
    },
    async status() {
      const response = await fetchImpl(`${base}?fields=display_phone_number,verified_name,quality_rating`, { headers });
      const data = await readJson(response);
      return {
        ok: Boolean(response.ok && !data?.error),
        detail: data?.error?.message || [data?.verified_name, data?.quality_rating].filter(Boolean).join(' · ') || `HTTP ${response.status}`,
        connectedNumber: normalizeWhatsAppNumber(data?.display_phone_number)
      };
    }
  };
};

/** Gateway sesuai env; null bila WHATSAPP_PROVIDER=off atau kredensial belum diisi (hanya email yang terkirim). */
export const createWhatsAppSender = (config: WhatsAppConfig, fetchImpl: typeof fetch = fetch): WhatsAppSender | null => {
  if (config.provider === 'fonnte') {
    if (config.fonnteToken) return createFonnteSender(config.fonnteToken, fetchImpl);
    console.warn('⚠️  WHATSAPP_PROVIDER=fonnte tetapi FONNTE_TOKEN kosong: pengingat WhatsApp nonaktif.');
  } else if (config.provider === 'cloud') {
    if (config.cloudToken && config.cloudPhoneNumberId) {
      return createCloudSender({ token: config.cloudToken, phoneNumberId: config.cloudPhoneNumberId, apiVersion: config.cloudApiVersion }, fetchImpl);
    }
    console.warn('⚠️  WHATSAPP_PROVIDER=cloud tetapi WHATSAPP_CLOUD_TOKEN / WHATSAPP_CLOUD_PHONE_NUMBER_ID kosong: pengingat WhatsApp nonaktif.');
  }
  return null;
};
