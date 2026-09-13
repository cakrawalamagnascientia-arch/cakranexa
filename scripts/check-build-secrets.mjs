#!/usr/bin/env node
/**
 * Memindai hasil build frontend (dist/index.html + dist/assets) untuk rahasia server, nama bucket privat, dan path
 * penyimpanan aset digital. Jalankan setelah `npm run build`: `npm run check:bundle`. Keluar dengan kode 1 bila ada temuan.
 *
 * Catatan: anon key Supabase (VITE_SUPABASE_ANON_KEY) memang boleh ada di bundle; hanya JWT dengan role service_role
 * yang dianggap bocor.
 */
import fs from 'fs';
import path from 'path';

const dist = path.resolve('dist');
const bucket = process.env.DIGITAL_ASSETS_BUCKET || 'digital-assets';
const files = [path.join(dist, 'index.html'), ...fs.readdirSync(path.join(dist, 'assets')).filter((f) => /\.(js|css|html|json)$/.test(f)).map((f) => path.join(dist, 'assets', f))];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CHECKS = [
  ['Midtrans server key', /(?:SB-)?Mid-server-[A-Za-z0-9_-]{8,}/g],
  ['Resend API key', /\bre_[A-Za-z0-9]{20,}\b/g],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['Nama bucket privat', new RegExp(escapeRegExp(bucket), 'g')],
  ['Path aset privat', /(?:ebooks|audiobooks)\/[A-Za-z0-9_-]+\/(?:source\.|pages\/|hls\/)|\benc\.key\b|\bindex\.m3u8\b/g],
  ['Nilai env rahasia', /(?:SUPABASE_JWT_SECRET|ACCESS_TOKEN_SECRET|CRON_SECRET|MIDTRANS_SERVER_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["'][^"']{8,}/g]
];

const findings = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const [label, pattern] of CHECKS) {
    for (const match of content.matchAll(pattern)) {
      findings.push(`${label}: ${path.relative(dist, file)} … ${content.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40).replace(/\s+/g, ' ')}`);
    }
  }
  // JWT: dekode payload, tandai hanya role service_role.
  for (const match of content.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') findings.push(`JWT service_role: ${path.relative(dist, file)}`);
    } catch {
      // bukan JWT
    }
  }
}

console.log(`Memindai ${files.length} file di dist/ (bucket privat: "${bucket}").`);
if (findings.length > 0) {
  console.error(`\n${findings.length} temuan:\n- ${findings.join('\n- ')}`);
  process.exit(1);
}
console.log('Bersih: tidak ada rahasia server, nama bucket privat, atau path aset privat di bundle frontend.');
