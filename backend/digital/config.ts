import crypto from 'crypto';
import os from 'os';
import path from 'path';

/** Versi ketentuan lisensi yang disetujui pembeli di checkout (disimpan per pesanan). */
export const LICENSE_VERSION = '2026-09-lisensi-personal-v1';

export interface DigitalConfig {
  /** Bucket PRIVAT untuk file utuh, halaman render, dan HLS. */
  assetsBucket: string;
  /** Rahasia HMAC untuk token playlist/segmen/key bertanda tangan. */
  accessTokenSecret: string;
  /** Rahasia endpoint cron (deteksi anomali). Kosong = endpoint nonaktif. */
  cronSecret: string;
  siteUrl: string;
  /**
   * URL publik API Render untuk tautan di email yang harus dilayani server ini (unduh invoice institusi).
   * PUBLIC_API_URL, lalu RENDER_EXTERNAL_URL (diisi otomatis oleh Render), lalu SITE_URL.
   */
  publicApiUrl: string;
  /** Sesi dianggap hidup bila heartbeat terakhir lebih baru dari jendela ini. */
  heartbeatWindowMs: number;
  defaultMaxDevices: number;
  deviceReleaseCooldownDays: number;
  tools: { ffmpeg: string; pdftoppm: string; pdftotext: string };
  /** Direktori kerja sementara pemrosesan aset (disk efemeral). */
  workDir: string;
  /** Berjalan sebagai fungsi serverless Vercel: endpoint fase 2 dinonaktifkan (pakai API Render). */
  isVercel: boolean;
  /** Mode lokal tanpa Supabase (tes/dev): penyimpanan memori + folder ini untuk aset. Tidak pernah aktif di Render/Vercel. */
  localDevStorageDir: string | null;
  jobsEnabled: boolean;
  /** DIGITAL_ENABLED: false = fitur digital tertutup untuk umum (menu, rute, endpoint pembeli). */
  featureEnabled: boolean;
  /** DIGITAL_BETA_EMAILS (huruf kecil): tetap bisa memakai fitur digital saat flag mati; pesanannya ditandai is_test. */
  betaEmails: string[];
  membership: MembershipConfig;
  whatsapp: WhatsAppConfig;
  institution: InstitutionFlags;
}

/** Akses institusi fase 4. Semua flag bawaan mati. */
export interface InstitutionFlags {
  /** ENABLE_IP_ACCESS: pengguna yang login dari IP jaringan institusi menjadi anggota tamu sementara. */
  ipAccessEnabled: boolean;
}

/** Pengingat WhatsApp keanggotaan (backend/digital/membership/whatsapp.ts). Bawaan mati. */
export interface WhatsAppConfig {
  /** WHATSAPP_PROVIDER: off | fonnte | cloud. */
  provider: 'off' | 'fonnte' | 'cloud';
  /** Nomor resmi pengirim (628…), WHATSAPP_SENDER_NUMBER; bawaan +62 852 8614 6806. */
  senderNumber: string;
  fonnteToken: string;
  cloudToken: string;
  cloudPhoneNumberId: string;
  cloudApiVersion: string;
  /** Awalan nama template Cloud API (bawaan "cnx_"). */
  templatePrefix: string;
}

const DEFAULT_WHATSAPP_SENDER = '6285286146806';

/** Keanggotaan fase 3 (docs/PHASE-3-BRIEF.md). Semua flag bawaan mati. */
export interface MembershipConfig {
  /** ENABLE_AUTODEBIT: perpanjangan otomatis kartu/GoPay lewat Midtrans Subscriptions (butuh aktivasi Midtrans). */
  autodebitEnabled: boolean;
  /** ENABLE_READER_DIGITAL_PICK: Reader Circle memilih 1 judul backlist per bulan. */
  readerDigitalPick: boolean;
  /** ENABLE_AUTHOR_GUILD_SHELF: Author Guild membuka seluruh Digital Reading Shelf (mati = sampel + karya sendiri). */
  authorGuildShelf: boolean;
  /** ENABLE_MEMBER_PRINT_DISCOUNT: harga member buku cetak (Langkah 7). Mati = alur cetak tidak berubah. */
  memberPrintDiscount: boolean;
  /** MEMBERSHIP_EXTENDED_BENEFITS: tampilkan manfaat yang belum bisa dipenuhi saat peluncuran (wallet, poin, dsb.). */
  extendedBenefits: boolean;
  /** ENABLE_OFFLINE (fase 6 Langkah 5): baca/dengar offline Gold/Platinum. Mati = manfaat offline tidak ditampilkan. */
  offlineEnabled: boolean;
  /** ENABLE_CROSS_FORMAT_SYNC (fase 6 Langkah 5): lanjut e-book ↔ audio. Mati = manfaat sinkron tidak ditampilkan. */
  crossFormatSync: boolean;
  /** Masa tenggang setelah akhir periode; akses tetap terbuka. */
  graceDays: number;
  /** Pengingat tagihan (hari sebelum jatuh tempo). */
  reminderDays: number[];
  foundingNoticeDays: number;
  /** Midtrans mengulang tagihan gagal tiap hari sebanyak ini (H+1, H+2, H+3). */
  autodebitRetryDays: number;
  /** Langganan/invoice pending tanpa pembayaran dibatalkan setelah ini (kursi Founding dilepas). */
  pendingTtlHours: number;
  /** Kunci AES-256-GCM untuk token Midtrans (PAYMENT_TOKEN_KEY 64 hex; tanpa itu diturunkan dari ACCESS_TOKEN_SECRET). */
  tokenKey: Buffer;
}

const envFlag = (value: string | undefined) => ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase());

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const loadDigitalConfig = (env: NodeJS.ProcessEnv = process.env): DigitalConfig => {
  const onHostedPlatform = Boolean(env.RENDER || env.VERCEL);
  const localDev = env.DIGITAL_LOCAL_DEV === '1' && !onHostedPlatform;
  let accessTokenSecret = env.ACCESS_TOKEN_SECRET || '';
  if (!accessTokenSecret) {
    // Tanpa rahasia tetap, token media hanya berlaku selama proses berjalan (restart = token lama tidak sah).
    accessTokenSecret = crypto.randomBytes(32).toString('hex');
    if (!localDev && env.NODE_ENV !== 'test') {
      console.warn('⚠️  ACCESS_TOKEN_SECRET belum di-set: token media dibuat per proses (tidak tahan restart).');
    }
  }
  return {
    assetsBucket: env.DIGITAL_ASSETS_BUCKET || 'digital-assets',
    accessTokenSecret,
    cronSecret: env.CRON_SECRET || '',
    siteUrl: String(env.SITE_URL || 'https://cakranexa.com').replace(/\/$/, ''),
    publicApiUrl: String(env.PUBLIC_API_URL || env.RENDER_EXTERNAL_URL || env.SITE_URL || 'https://cakranexa.com').replace(/\/$/, ''),
    heartbeatWindowMs: 2 * 60 * 1000,
    defaultMaxDevices: 2,
    deviceReleaseCooldownDays: 30,
    tools: {
      ffmpeg: env.FFMPEG_PATH || 'ffmpeg',
      pdftoppm: env.PDFTOPPM_PATH || 'pdftoppm',
      pdftotext: env.PDFTOTEXT_PATH || 'pdftotext'
    },
    workDir: env.DIGITAL_WORK_DIR || path.join(os.tmpdir(), 'cakranexa-digital'),
    isVercel: env.VERCEL === '1',
    localDevStorageDir: localDev ? (env.DIGITAL_LOCAL_STORAGE_DIR || path.join(os.tmpdir(), 'cakranexa-digital-assets')) : null,
    jobsEnabled: env.VERCEL !== '1' && env.NODE_ENV !== 'test',
    featureEnabled: ['true', '1', 'yes'].includes(String(env.DIGITAL_ENABLED || '').trim().toLowerCase()),
    betaEmails: Array.from(new Set(String(env.DIGITAL_BETA_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => EMAIL_RE.test(email)))),
    membership: {
      autodebitEnabled: envFlag(env.ENABLE_AUTODEBIT),
      readerDigitalPick: envFlag(env.ENABLE_READER_DIGITAL_PICK),
      authorGuildShelf: envFlag(env.ENABLE_AUTHOR_GUILD_SHELF),
      memberPrintDiscount: envFlag(env.ENABLE_MEMBER_PRINT_DISCOUNT),
      extendedBenefits: envFlag(env.MEMBERSHIP_EXTENDED_BENEFITS),
      offlineEnabled: envFlag(env.ENABLE_OFFLINE),
      crossFormatSync: envFlag(env.ENABLE_CROSS_FORMAT_SYNC),
      graceDays: 5,
      reminderDays: [7, 3, 1, 0],
      foundingNoticeDays: 30,
      autodebitRetryDays: 3,
      pendingTtlHours: 24,
      tokenKey: /^[0-9a-f]{64}$/i.test(env.PAYMENT_TOKEN_KEY || '')
        ? Buffer.from(String(env.PAYMENT_TOKEN_KEY), 'hex')
        : crypto.createHash('sha256').update(`cakranexa-payment-token:${accessTokenSecret}`).digest()
    },
    institution: {
      ipAccessEnabled: envFlag(env.ENABLE_IP_ACCESS)
    },
    whatsapp: {
      provider: (['fonnte', 'cloud'] as const).find((p) => p === String(env.WHATSAPP_PROVIDER || '').trim().toLowerCase()) ?? 'off',
      senderNumber: (() => {
        const digits = String(env.WHATSAPP_SENDER_NUMBER || '').replace(/\D/g, '');
        const normalized = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
        return /^628\d{7,11}$/.test(normalized) ? normalized : DEFAULT_WHATSAPP_SENDER;
      })(),
      fonnteToken: String(env.FONNTE_TOKEN || '').trim(),
      cloudToken: String(env.WHATSAPP_CLOUD_TOKEN || '').trim(),
      cloudPhoneNumberId: String(env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || '').trim(),
      cloudApiVersion: String(env.WHATSAPP_CLOUD_API_VERSION || 'v21.0').trim(),
      templatePrefix: String(env.WHATSAPP_TEMPLATE_PREFIX || 'cnx_').trim()
    }
  };
};
