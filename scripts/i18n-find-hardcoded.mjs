// npm run i18n:find — mencari teks UI Bahasa Indonesia yang masih hardcoded di src/ (heuristik).
// Dashboard admin sengaja tetap Bahasa Indonesia, jadi file admin dikecualikan; begitu juga data & file terjemahan.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve('src');
const ADMIN_FILES = new Set([
  'AdminDashboard.tsx', 'CmsDashboardManager.tsx', 'ExecutiveAnalyticsDashboard.tsx', 'SeoSettingsTab.tsx',
  'SeoAnalysisTab.tsx', 'PaymentManagementTab.tsx', 'ShippingManagementTab.tsx', 'ShippingLabelModal.tsx', 'AdminLoginGate.tsx'
]);
const EXCLUDED_DIRS = [path.join(SRC, 'i18n'), path.join(SRC, 'data'), path.join(SRC, 'db')];
// shippingService/paymentService berisi nilai bawaan yang dapat diedit admin; diterjemahkan saat tampil (useCmsText).
const EXCLUDED_FILES = new Set(['siteContentService.ts', 'types.ts', 'analyticsData.ts', 'shippingService.ts', 'paymentService.ts']);

// Kata umum Bahasa Indonesia yang menandakan teks UI (bukan kunci/identifier).
const WORDS = [
  'yang', 'dan', 'untuk', 'dengan', 'dari', 'pada', 'atau', 'tidak', 'belum', 'sudah', 'akan', 'dapat', 'kami', 'anda',
  'buku', 'penulis', 'keranjang', 'beranda', 'simpan', 'hapus', 'tambah', 'lihat', 'semua', 'kembali', 'cari', 'pesanan',
  'pembayaran', 'kirim', 'harga', 'terbaru', 'kategori', 'layanan', 'hubungi', 'silakan', 'berhasil', 'gagal', 'memuat',
  'daftar', 'selengkapnya', 'naskah', 'penerbitan', 'pelatihan', 'karier', 'tentang', 'bayar', 'alamat', 'ongkir', 'tutup'
];
const WORD_RE = new RegExp(`(^|[^\\p{L}])(${WORDS.join('|')})(?=[^\\p{L}]|$)`, 'iu');
const IDENTIFIER_RE = /^[\w./:#?=&%-]+$/; // slug, path, kunci, class

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return EXCLUDED_DIRS.includes(full) ? [] : walk(full);
  if (!/\.(tsx?|jsx?)$/.test(entry.name) || ADMIN_FILES.has(entry.name) || EXCLUDED_FILES.has(entry.name)) return [];
  return [full];
});

const looksLikeUiText = (text) => {
  const value = text.trim();
  if (!value || !WORD_RE.test(value)) return false;
  if (!/\s/.test(value)) return /^\p{Lu}/u.test(value) && !IDENTIFIER_RE.test(value.replace(/^\p{Lu}/u, 'x')) ? true : /^\p{Lu}\p{Ll}+$/u.test(value);
  return true;
};

const findings = new Map();
for (const file of walk(SRC)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let inBlockComment = false;
  lines.forEach((raw, index) => {
    let line = raw;
    if (inBlockComment) {
      if (!line.includes('*/')) return;
      line = line.slice(line.indexOf('*/') + 2);
      inBlockComment = false;
    }
    line = line.replace(/\/\*.*?\*\//g, '').replace(/\{\s*\/\*.*?\*\/\s*\}/g, '');
    if (line.includes('/*')) { inBlockComment = true; line = line.slice(0, line.indexOf('/*')); }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('import ') || /console\.(log|warn|error|info)\(/.test(trimmed)) return;
    const code = line.replace(/\/\/.*$/, '');
    const candidates = [
      ...[...code.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]),
      ...[...code.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]),
      ...(/^[^<>{}=;()'"`]+$/.test(trimmed) && !/[:=]/.test(trimmed) ? [trimmed] : []) // teks JSX multi-baris (tanpa string berkutip)
    ];
    const hit = candidates.find(looksLikeUiText);
    if (hit) {
      const rel = path.relative(process.cwd(), file);
      if (!findings.has(rel)) findings.set(rel, []);
      findings.get(rel).push(`${index + 1}: ${hit.trim().slice(0, 90)}`);
    }
  });
}

let total = 0;
for (const [file, hits] of [...findings.entries()].sort((a, b) => b[1].length - a[1].length)) {
  total += hits.length;
  console.log(`\n${file} (${hits.length})`);
  hits.slice(0, Number(process.env.I18N_FIND_LIMIT || 15)).forEach((hit) => console.log(`  ${hit}`));
  if (hits.length > Number(process.env.I18N_FIND_LIMIT || 15)) console.log(`  … ${hits.length - Number(process.env.I18N_FIND_LIMIT || 15)} lagi`);
}
console.log(`\nTotal kandidat teks Indonesia hardcoded (di luar admin/data): ${total}`);
