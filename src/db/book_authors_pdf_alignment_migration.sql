-- Selaraskan atribusi penulis buku dengan kolom Author pada
-- public/images/books/Judul buku Cakranexa.pdf.
-- Migration ini hanya memperbarui books.author; tidak membuat profil author baru.

UPDATE books SET author = 'Henry Dianto P. Sinaga; Yuli Teguh Hidayat'
WHERE slug = 'pajak-pertambangan-di-indonesia-dari-rente-mineral-ke-kesejahteraan-publik';

UPDATE books SET author = 'Liza Khoironi; Sigit Haryoko'
WHERE slug = 'jejak-audit-pajak-pertambahan-nilai-ppn-teknologi-invoicing-dan-pencegahan-fraud-di-indonesia';

UPDATE books SET author = 'Sigit Haryoko; Naufal Akbarsyah Gunawan'
WHERE slug = 'treaty-shopping-dan-anti-abuse-hukum-kebijakan-dan-penegakan-hukum';

UPDATE books SET author = 'Wahyu Widodo'
WHERE slug = 'actus-reus-dalam-tindak-pidana-perpajakan-teori-delik-unsur-objektif-dan-perbandingan-internasional';

UPDATE books SET author = 'Yuli Teguh Hidayat; Henry Dianto P. Sinaga'
WHERE slug = 'rekayasa-keuangan-untuk-siklus-publik-yang-volatil-di-indonesia';

UPDATE books SET author = 'Sigit Haryoko; Liza Khoironi'
WHERE slug = 'bukti-dan-pembuktian-dalam-administrasi-perpajakan-di-indonesia';

UPDATE books SET author = 'Bonarsius Sipayung'
WHERE slug IN (
  'reformulasi-subjek-pajak-pertambahan-nilai-ppn-di-era-digitalisasi-di-indonesia',
  'reformulasi-objek-pajak-pertambahan-nilai-ppn-di-era-digitalisasi-di-indonesia',
  'reformulasi-mekanisme-pajak-pertambahan-nilai-ppn-dalam-penanganan-tantangan-digitalisasi-di-indonesia'
);

UPDATE books SET author = 'Henry Dianto P. Sinaga & Andi Banua Adams'
WHERE slug = 'prinsip-prinsip-transfer-pricing-konsep-dan-aplikasi-di-indonesia';

UPDATE books SET author = 'Wahyu Widodo'
WHERE slug = 'alternative-dispute-resolution-dalam-pidana-pajak-di-indonesia';

UPDATE books SET author = 'Henry Dianto P. Sinaga & Edy Edwin P. Ginting'
WHERE slug = 'pidana-badan-dan-pertanggungjawabannya-di-bidang-perpajakan-di-indonesia';

UPDATE books SET author = 'Bonarsius Sipayung, Henry Dianto P. Sinaga, & Anton Hartanto'
WHERE slug = 'hukum-pidana-di-bidang-perpajakan-di-indonesia';

UPDATE books SET author = 'Henry Dianto P. Sinaga'
WHERE slug = 'peranan-hukum-dalam-penanganan-tantangan-pajak-e-commerce-di-indonesia';

UPDATE books SET author = 'ANDI BANUA ADAMS & JOKO PURNOMO RAHARJO'
WHERE slug = 'pajak-merger-dan-akuisisi-m-dan-a-di-indonesia-prinsip-dan-konsep';

UPDATE books SET author = 'Yudha Pramana'
WHERE slug = 'akuntansi-pajak-teori-dan-praktik-di-indonesia';

UPDATE books SET author = 'Yudha Pramana & Joko Purnomo Raharjo'
WHERE slug = 'prinsip-dan-konsep-audit-dalam-akuntansi-dan-pelaksanaan-kewajiban-perpajakan-di-indonesia';