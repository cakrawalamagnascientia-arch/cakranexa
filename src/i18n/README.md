# Multi-bahasa (i18n) CakraNexa

Bahasa: **Indonesia (`id`, default)**, **English (`en`)**, **Mandarin sederhana (`zh`, zh-CN)**.
Library: i18next + react-i18next. Konfigurasi: `src/i18n/index.ts`.

## Struktur

```
src/i18n/
  index.ts        konfigurasi, SUPPORTED_LANGUAGES, changeAppLanguage()
  i18next.d.ts    tipe kunci (diambil dari locales/id) — kunci salah ketik gagal saat compile
  hooks.ts        useAppLanguage, useFormatters, useCategoryLabel, useCmsText
  format.ts       formatCurrency / formatNumber / formatDate (bisa dipakai di luar React)
  labels.ts       peta kategori buku -> kunci terjemahan
  cms.ts          localizeCmsDefault (konten CMS satu bahasa)
  glossary.md     istilah baku yang sudah disetujui
  locales/<lang>/<namespace>.json
```

Namespace: `common` (navbar, footer, tombol umum), `home`, `catalog`, `book`, `author`, `blog`, `cart`,
`checkout`, `auth`, `admin`, `errors`, `seo`, `publishing`, `training`, `about`, `career`, `journal`, `contact`.

## Menambah bahasa baru (mis. `ja`)

1. Tambahkan `'ja'` ke `SUPPORTED_LANGUAGES` dan `HTML_LANG` di `index.ts`.
2. Salin folder `locales/en` menjadi `locales/ja`, lalu terjemahkan nilainya.
3. Jalankan `npm run i18n:check` sampai 0 masalah. Chunk `locale-ja` dibuat otomatis oleh `vite.config.ts`.

## Konvensi kode

- Pilih namespace di hook, lalu tulis kunci tanpa prefiks:
  `const { t } = useTranslation('catalog'); t('filter.category')`.
- Namespace kedua memakai prefiks: `useTranslation(['catalog', 'common'])` lalu `t('common:cart')`.
- Di luar komponen: `i18n.t('errors:network')` (import `i18n` dari `src/i18n`).
- Kunci deskriptif dan bertingkat: `cart.empty.title`, `checkout.form.phonePlaceholder`.
- Interpolasi: `"found": "{{count}} buku ditemukan"` → `t('found', { count })`.
- Jamak: `id`/`zh` hanya punya `_other`; `en` punya `_one` dan `_other`
  (contoh `"books_one": "{{count}} book"`, `"books_other": "{{count}} books"`).
- Teks dengan elemen di dalamnya: `<Trans t={t} i18nKey="showing" components={{ strong: <strong /> }} />`
  dengan nilai `"Menampilkan <strong>{{count}}</strong> buku"`.
- Harga/angka/tanggal: `const { currency, date } = useFormatters();` — jangan `toLocaleString('id-ID')`.
- Label kategori: `const categoryLabel = useCategoryLabel();` — nilai kategori (`'Perpajakan'`) tetap dipakai
  untuk filter, URL, dan data.
- Konten CMS (`siteContent.*`): `cmsText(nilaiCms, nilaiBawaanId, t('...'))` lewat `useCmsText()`.
- Jangan diterjemahkan: CakraNexa, PT Cakrawala Magna Scientia, PT Scientia Integritas Utama, nama penulis,
  ISBN, SINTA, QRIS, Virtual Account, nama kurir.
- Terjemahan Bahasa Indonesia = teks asli. Dashboard admin tetap Bahasa Indonesia.
