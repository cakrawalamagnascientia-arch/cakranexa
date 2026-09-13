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
}

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
      .filter((email) => EMAIL_RE.test(email))))
  };
};
