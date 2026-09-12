// npm run i18n:check — membandingkan kunci terjemahan tiap bahasa dengan Bahasa Indonesia (acuan).
// Melaporkan kunci yang hilang/berlebih, nilai kosong, dan bentuk jamak yang kurang per bahasa.
import fs from 'fs';
import path from 'path';

const LOCALES_DIR = path.resolve('src/i18n/locales');
const BASE = 'id';
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const languages = fs.readdirSync(LOCALES_DIR).filter((dir) => fs.statSync(path.join(LOCALES_DIR, dir)).isDirectory());
const namespaces = fs.readdirSync(path.join(LOCALES_DIR, BASE)).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5));

const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([key, value]) =>
  value && typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]
);

const load = (lang, ns) => {
  const file = path.join(LOCALES_DIR, lang, `${ns}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return Object.fromEntries(flatten(JSON.parse(fs.readFileSync(file, 'utf8'))));
  } catch (err) {
    throw new Error(`${lang}/${ns}.json bukan JSON valid: ${err.message}`);
  }
};

// Kunci dasar (tanpa akhiran jamak) beserta bentuk jamak yang ada.
const baseKeys = (entries) => {
  const map = new Map();
  for (const key of Object.keys(entries)) {
    const match = key.match(PLURAL_SUFFIX);
    const base = match ? key.slice(0, -match[0].length) : key;
    if (!map.has(base)) map.set(base, new Set());
    if (match) map.get(base).add(match[1]);
  }
  return map;
};

let problems = 0;
const report = (message) => { problems += 1; console.log(`  - ${message}`); };

for (const lang of languages) {
  const pluralForms = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  console.log(`\n[${lang}]`);
  const before = problems;
  for (const ns of namespaces) {
    const base = load(BASE, ns);
    const target = load(lang, ns);
    if (!target) { report(`${ns}.json tidak ada`); continue; }
    const baseMap = baseKeys(base);
    const targetMap = baseKeys(target);
    for (const [key, forms] of baseMap) {
      if (!targetMap.has(key)) { report(`${ns}: kunci hilang "${key}"`); continue; }
      if (forms.size > 0) {
        const missingForms = pluralForms.filter((form) => !targetMap.get(key).has(form));
        if (missingForms.length) report(`${ns}: "${key}" kurang bentuk jamak ${missingForms.map((f) => `_${f}`).join(', ')}`);
      }
    }
    for (const key of targetMap.keys()) {
      if (!baseMap.has(key)) report(`${ns}: kunci berlebih "${key}" (tidak ada di ${BASE})`);
    }
    for (const [key, value] of Object.entries(target)) {
      if (typeof value !== 'string' || value.trim() === '') report(`${ns}: nilai kosong "${key}"`);
    }
  }
  if (problems === before) console.log('  OK');
}

console.log(problems === 0 ? '\nSemua bahasa lengkap: 0 masalah.' : `\n${problems} masalah ditemukan.`);
process.exit(problems === 0 ? 0 : 1);
