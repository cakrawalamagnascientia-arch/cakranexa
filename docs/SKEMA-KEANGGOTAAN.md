# Skema Keanggotaan CakraNexa: Analisis dan Keputusan

Tanggal: 13 September 2026. Status: skema diterapkan di data dan halaman publik (`/membership`, `/institutions`). Penagihan (langganan, invoice, Midtrans Subscriptions) adalah fase 3.

Angka di dokumen ini sama dengan [src/data/membership.ts](../src/data/membership.ts) dan dijaga oleh tes [src/data/__tests__/membership.test.ts](../src/data/__tests__/membership.test.ts). Ubah keduanya bersamaan.

---

## 1. Sumber dan aturan keputusan

| Kode | Dokumen | Peran |
|---|---|---|
| **A** | *RESUME CAKRAWALA*: arsitektur merek, "Strategi Paket Berlangganan Keanggotaan", dan analisis royalti (dari owner) | **Acuan utama** |
| **B** | *Skema E-Book & Audiobook dalam Keanggotaan v2* (pengembangan internal) | Lapisan implementasi produk digital |

Aturan yang dipakai:

1. Harga, kuota, manfaat, dan aturan ekonomi mengikuti **A**.
2. **B** dipakai untuk hal yang tidak diatur A: kebijakan penagihan, perangkat, frontlist saat peluncuran, dan penempatan produk digital di dalam paket.
3. Tambahan B yang ditandai *usulan*, atau yang tidak ada di A, **dibuat nonaktif** (`MEMBERSHIP_PROPOSALS`) sampai disetujui owner.
4. Bila A tidak konsisten di dalam dokumennya sendiri, dipilih versi yang lebih konservatif, lalu dilaporkan di bagian 7.

---

## 2. Hasil analisis

### 2.1 Yang sudah selaras (A = B)

- Struktur: Free Circle → Reader Circle → Professional & Academic Society → Author Guild → Institution & Library Network. Akses e-book dan audiobook adalah **manfaat di dalam paket** (Digital Reading Shelf), bukan produk terpisah.
- Harga reguler: Rp39.000 / Rp99.000 / Rp149.000 per bulan. Harga tahunan = 10 × bulanan.
- Harga Founding tahun pertama: Rp299.000 (1.000 anggota), Rp790.000 (500), Rp1.190.000 (250). Institusi mendapat diskon 15% untuk 30 institusi pertama.
- Frontlist: buku baru dijual dulu sebagai cetak dan e-book satuan selama 90–180 hari, lalu masuk rak. Sampel 10–15% tetap tersedia.
- Tidak ada akses PDF tanpa pengamanan.
- Tingkat institusi: 5, 20, dan 50 pengguna bersamaan, harga penuh Rp9,9 juta / Rp24,9 juta / Rp59,9 juta, penyesuaian harga menurut jumlah judul, dan acquisition wallet 40%.
- Royalti produk digital:
  - e-book kanal langsung: 35% penerimaan bersih;
  - platform pihak ketiga dan audiobook: 25%;
  - pool keanggotaan: 20% (konsumen) dan 25% (institusi), dibagi 60/20/20.

### 2.2 Koreksi terhadap dokumen B

| # | Temuan di B | Koreksi |
|---|---|---|
| B1 | Halaman 2 memuat baris `https://cakranexa.onrender.com/api/payment/midtrans-webhook`, sisa catatan kerja | Hapus dari dokumen sebelum dibagikan |
| B2 | Professional disebut "tepat di batas" 35% | Rp350.000 / Rp990.000 = **35,4%**, sedikit di atas batas. Pada harga Founding (Rp790.000) menjadi **44,3%** (bagian 4) |
| B3 | Acquisition wallet Founding dihitung dari harga sebelum diskon (Starter Rp1.584.000) | Wallet = 40% dari biaya **yang dibayar**: Starter Founding Rp3.366.000 → **Rp1.346.400**; Campus → Rp3.386.400; Network → Rp8.146.400 |
| B4 | Patron mendapat 3 perangkat dan sesi dengan penulis, tanpa tanda *usulan* | A hanya menyebut "layanan prioritas dan edisi khusus". Diperlakukan sebagai **usulan** |
| B5 | Author Guild mendapat akses "karya sendiri", tanpa tanda *usulan* | Tidak ada di A; diperlakukan sebagai **usulan** (bisa memakai sumber hak `author` dari fase 2) |
| B6 | Matriks pencarian teks dan catatan dibatasi per paket | Tidak ada di A. **Diputuskan tidak dibatasi per paket**: fitur tersebut tidak menambah biaya, fase 2 sudah memberikannya ke pembeli satuan, dan pembatasan hanya menambah kerumitan. Pembeda Professional tetap companion resources dan citation tools (manfaat A) |
| B7 | Reader Circle "Pencarian teks: Ya" | Tanpa usulan Digital Member Pick, Reader tidak punya judul keanggotaan untuk dibaca; baris ini baru relevan bila usulan disetujui |

### 2.3 Inkonsistensi di dalam dokumen A

| # | Inkonsistensi | Penanganan |
|---|---|---|
| A1 | Wallet Reader Rp25.000/bulan (nominal Rp300.000/tahun) melanggar batas biaya manfaat 35%: **76,9%** dari Rp390.000 dan **100,3%** dari harga Founding Rp299.000. Analisis royalti A sendiri menyebut Rp39.000 aman hanya bila penumpukan manfaat dibatasi; bila tidak, harga menjadi Rp49.000 / Rp490.000 | Harga Rp39.000 **dipertahankan** (angka utama A dan penawaran homepage). Syarat dari analisis royalti diterapkan (bagian 3.8). Keputusan akhir di tangan owner (bagian 7) |
| A2 | Professional Founding: wallet + annual credit = 44,3% dari Rp790.000 | Dilaporkan; dipantau di dashboard fase 3 |
| A3 | Hadiah tahunan Reader tanpa syarat di tabel 4.3, tetapi bersyarat pembelian minimum di analisis royalti | Ditulis **bersyarat pembelian minimum**; angka minimumnya menunggu owner |
| A4 | Free Circle "satu poin per transaksi" vs Magna Points 3% | Ditulis "poin untuk setiap transaksi yang memenuhi syarat"; tarifnya menunggu owner |
| A5 | Urutan tabel I (Reader, Author, Professional) berbeda dari urutan peluncuran (Reader, Professional, Author) | Urutan peluncuran yang dipakai |
| A6 | Nama imprint akademik: SCIENTIUM vs SCIENTARA ACADEMIC / Scientara Integrity; halaman `/scientara` | Di luar keanggotaan; perlu satu nama |
| A7 | Nama program: "Cakrawala Magna Society" (bab strategi) vs saran seluruh layanan memakai nama CakraNexa | Diterapkan: **Cakrawala Magna Society** sebagai nama program keanggotaan di platform CakraNexa. Menunggu konfirmasi owner |
| A8 | Aturan 9.2 "minimum belanja 5–6 × nilai voucher", tetapi contoh owner sendiri lebih rendah: Rp50.000 → Rp249.000 (4,98×) dan Rp75.000 → Rp350.000 (4,67×) | Pasangan angka owner dipakai apa adanya; owner dapat menaikkan minimum Author Guild ke ±Rp375.000–Rp450.000 bila ingin konsisten |

---

## 3. Skema final yang diterapkan

### 3.1 Paket individu

| Paket | Bulanan | Tahunan | Founding (tahun 1) | Akses digital keanggotaan | Perangkat | Diskon buku | Wallet |
|---|---|---|---|---|---|---|---|
| Free Circle | Gratis | – | – | Sampel 10–15% e-book, sampel 5 menit audio | – | – | – |
| Reader Circle | Rp39.000 | Rp390.000 | Rp299.000, 1.000 anggota | Digital sampler | – | 10% (preorder 15%, backlist hingga 20%) | Rp25.000/bulan, min. Rp149.000, berlaku 60 hari, maks. 2 aktif |
| **Professional & Academic Society** | Rp99.000 | Rp990.000 | Rp790.000, 500 anggota | **Digital Reading Shelf** (backlist + judul pilihan, termasuk audiobook) | 2 | 15% cetak | Rp50.000/triwulan, min. Rp249.000 + annual credit Rp150.000 (min. Rp399.000, anggota tahunan) |
| Author Guild | Rp149.000 | Rp1.490.000 | Rp1.190.000, 250 anggota | Digital sampler | – | 15% (karya sendiri hingga 35%, min. 20 eks.) | Rp75.000/triwulan, min. Rp350.000 |

Catatan tampilan:

- Paket tahunan menjadi pilihan default.
- Harga Founding tampil sebagai harga tahun pertama paket tahunan, dengan harga reguler dicoret dan keterangan perpanjangan. Matikan lewat `FOUNDING_MEMBER_PROGRAM.active` bila belum ingin diumumkan.

Daftar manfaat lengkap per paket mengikuti A bab III–VI dan tampil di kartu paket (5 manfaat teratas, lalu "Lihat semua"):

- Free Circle: 8 butir dari 10 poin A (akun + wishlist, serta newsletter + pemberitahuan preorder, masing-masing digabung).
- Reader Circle: 13 butir dari 15 baris A 4.3 (nilai, minimum belanja, dan masa berlaku wallet menjadi satu butir).
- Professional & Academic Society: 14 butir dari 15 baris A 6.3 (frontlist policy tampil sebagai bagian tersendiri, bukan manfaat).
- Author Guild: 16 butir, sama dengan A 5.3.

Author Guild juga memuat keterangan dari A 5.4: keanggotaan tidak menjamin naskah diterbitkan.

### 3.2 Usulan B yang dinonaktifkan (menunggu owner)

| Usulan | Flag | Efek bila diaktifkan |
|---|---|---|
| Reader Circle: 1 Digital Member Pick backlist per bulan, dikunci sebulan | `MEMBERSHIP_PROPOSALS.readerDigitalPick` | Manfaat dan baris matriks muncul; 1 perangkat |
| Author Guild: Digital Reading Shelf penuh | `MEMBERSHIP_PROPOSALS.authorGuildShelf` | Lencana rak, manfaat, dan 2 perangkat |
| Author Guild: akses karya sendiri | belum ada flag | Hak akses bersumber `author` (fase 2), diberikan admin |
| Patron: 3 perangkat, sesi penulis per kuartal | belum ada flag | Fase loyalitas |

### 3.3 Akses digital

- Hanya **Professional & Academic Society** dan institusi yang membuka Digital Reading Shelf. Paket lain mendapat sampel dan digital sampler.
- Judul yang **dibeli satuan** selalu dapat dibuka di 2 perangkat dengan semua fitur reader, apa pun paketnya.
- Satu sesi baca/dengar aktif per judul, dan satu kali pelepasan perangkat per 30 hari (sama dengan fase 2).
- Tidak ada unduhan offline saat peluncuran.

### 3.4 Frontlist saat peluncuran

- Periode eksklusif **90 hari** (batas bawah A) untuk judul yang terbit sebelum peluncuran.
- Ditambah daftar **judul pilihan** (3–5 judul) yang ditunjuk manajemen.
- Tanggal masuk rak diisi per judul di Admin → Produk Digital (`shelfEntryDate`) dan tampil di halaman produk ("Masuk rak digital: [tanggal]").
- Seluruh 23 judul katalog terbit tahun 2026. Dengan periode 180 hari, rak akan hampir kosong saat peluncuran; itu sebabnya dipakai 90 hari plus judul pilihan.
- Prioritas audiobook: judul naratif dan konseptual lebih dulu; judul yang padat tabel dan rumus ditunda.

### 3.5 Penjualan satuan

- Wajib tersedia sejak terbit (frontlist). Harga ditetapkan admin per judul. Usulan B (e-book ±60% harga cetak, audio Rp59.000–89.000, bundel −20%) hanya panduan.
- Harga anggota berlaku untuk e-book dan audiobook satuan, tetapi **tidak digabung dengan wallet**.

### 3.6 Institution & Library Network

| Tingkat | Pengguna bersamaan | Harga penuh/tahun | Harga berlaku sekarang (<50 judul = 40%) | Founding (−15%) | Acquisition wallet (40% dari yang dibayar) |
|---|---|---|---|---|---|
| Starter | 5 | Rp9.900.000 | Rp3.960.000 | Rp3.366.000 | Rp1.584.000 / Founding Rp1.346.400 |
| Campus | 20 | Rp24.900.000 | Rp9.960.000 | Rp8.466.000 | Rp3.984.000 / Founding Rp3.386.400 |
| Network | 50 | Rp59.900.000 | Rp23.960.000 | Rp20.366.000 | Rp9.584.000 / Founding Rp8.146.400 |
| Consortium/Enterprise | >50 | Penawaran khusus | – | – | Sesuai kontrak |

- Skala katalog: <50 judul = 40%; 50–99 = 60%; 100–149 = 80%; ≥150 = 100%. Kenaikan berlaku pada perpanjangan berikutnya dengan pemberitahuan. Harga penuh juga mensyaratkan metadata, reader, pengamanan, laporan, dan dukungan institusional.
- Manfaat per tingkat (A 7.4):
  - akun admin 1/3/10;
  - webinar 2/4/8 per tahun;
  - laporan triwulanan / bulanan / bulanan + analisis;
  - diskon cetak 20/25/30%;
  - bulk order minimal 25/50/100 buku;
  - reading list 2/6/12 per tahun;
  - adopsi mata kuliah: dasar / penuh / penuh + account manager.
- 15 manfaat berlaku di semua tingkat (A 7.3).
- **Halaman publik tetap tanpa harga**, sesuai brief fase 1: penawaran lewat formulir. Harga di atas disimpan di data untuk penyusunan penawaran. Selama katalog masih di bawah 50 judul, harga daftar akan menyesatkan bila dipublikasikan.

### 3.7 Kebijakan penagihan (B bab 9; dipakai fase 3)

- **Pembayaran:** kartu kredit dan GoPay diperpanjang otomatis via Midtrans. Virtual Account dan QRIS diperpanjang manual. Data kartu tidak disimpan; hanya token/ID Midtrans.
- **Pengingat:** H-7, H-3, H-1, dan H0.
- **Masa tenggang:** 5 hari dengan akses tetap terbuka. Setelah itu akses dikunci; progres dan catatan disimpan 12 bulan.
- **Pindah paket:** upgrade seketika dengan selisih prorata; downgrade mulai periode berikutnya.
- **Pembatalan:** dari halaman akun; akses tetap sampai akhir periode, tanpa tagihan berikutnya.
- **Founding:** harga tahun pertama saja. Pemberitahuan harga perpanjangan reguler dikirim 30 hari sebelum ulang tahun keanggotaan.

### 3.8 Aturan ekonomi

- Biaya tunai langsung seluruh manfaat maksimal **35%** dari pendapatan keanggotaan. Dipantau di dashboard fase 3.
- Wallet dan voucher mensyaratkan minimum belanja, disarankan 5–6 × nilainya. Pasangan angka owner dipakai apa adanya: Rp25.000 → Rp149.000 (5,96×), Rp50.000 → Rp249.000 (4,98×), Rp75.000 → Rp350.000 (4,67×). Lihat A8.
- Urutan potongan: harga anggota → **satu** wallet atau voucher → poin → subsidi ongkir.
- Syarat mempertahankan Reader di Rp39.000 (analisis royalti A bab 3):
  - satu wallet per transaksi;
  - wallet tidak digabung pada produk digital satuan;
  - subsidi ongkir maksimal **Rp15.000** per transaksi, dengan gratis ongkir mulai Rp199.000;
  - hadiah tahunan bersyarat pembelian minimum;
  - buku baru tanpa diskon besar.
- Saldo tidak dapat diuangkan. Tidak ada voucher tanpa minimum belanja.

### 3.9 Loyalitas (A bab XI)

- **Magna Points:** 3% (kampanye maksimal 5%), berlaku 12 bulan, tidak dapat diuangkan atau dipindahtangankan, diberikan setelah masa pengembalian, dan batal bila transaksi batal.
- **Status:** Member (bergabung) → Reader (Rp1 juta/tahun) → Curator (Rp3 juta) → Patron (Rp7,5 juta). Status berlaku untuk semua jenis keanggotaan.

### 3.10 Royalti produk digital (fase 5, sebagai referensi)

- E-book kanal langsung: 35% penerimaan bersih.
- E-book pihak ketiga dan audiobook: 25%.
- Bundel: 25–30% dari penerimaan yang dialokasikan ke buku.
- Pool keanggotaan: konsumen 20% dan institusi 25% dari Net Content Revenue, dibagi 60% verified reading, 20% interaksi bermutu, dan 20% pembelian/EBA.
- Tabel `reading_events` fase 2 sudah mencatat verified reading per judul per anggota (dwell wajar, kecepatan ≤2×, sesi sah). Itulah dasar porsi 60%.

---

## 4. Batas biaya manfaat 35%: hitungan nominal

Nominal = seluruh wallet dan annual credit terpakai. Belum termasuk poin, subsidi ongkir, voucher ulang tahun, dan hadiah tahunan.

| Paket | Dasar harga/tahun | Manfaat tunai nominal/tahun | Rasio |
|---|---|---|---|
| Reader, bulanan | Rp468.000 | Rp300.000 | 64,1% |
| Reader, tahunan | Rp390.000 | Rp300.000 | **76,9%** |
| Reader, Founding | Rp299.000 | Rp300.000 | **100,3%** |
| Professional, bulanan | Rp1.188.000 | Rp200.000 | 16,8% |
| Professional, tahunan | Rp990.000 | Rp350.000 | 35,4% |
| Professional, Founding | Rp790.000 | Rp350.000 | **44,3%** |
| Author, bulanan | Rp1.788.000 | Rp300.000 | 16,8% |
| Author, tahunan | Rp1.490.000 | Rp300.000 | 20,1% |
| Author, Founding | Rp1.190.000 | Rp300.000 | 25,2% |

Wallet hanya bisa dipakai dengan belanja minimum, sehingga biaya nyatanya bergantung pada tingkat pemakaian. Target KPI A untuk pemakaian wallet 55–75%. Pada pemakaian itu, Reader tahunan tetap berada di **42–58%**, di atas batas.

**Rekomendasi:**

- Pertahankan angka owner.
- Dashboard fase 3 menampilkan rasio biaya manfaat nyata per paket per bulan.
- Bila rasio Reader melebihi 35% selama 3 bulan berturut-turut, owner memilih: menaikkan harga ke Rp49.000/Rp490.000 (opsi dalam analisis royalti A), atau memperketat wallet (misalnya maksimal 1 wallet aktif).

---

## 5. Yang sudah diterapkan (belum di-commit)

- `src/data/membership.ts`: seluruh angka skema. Mencakup paket, Founding, akses digital, wallet, aturan ekonomi, kebijakan penagihan, loyalitas, tingkat institusi, skala katalog, helper harga institusi dan acquisition wallet, serta flag usulan.
- `src/components/digital/MembershipView.tsx`:
  - judul penawaran utama owner;
  - harga Founding;
  - manfaat lengkap per paket;
  - tabel akses e-book/audiobook per paket;
  - frontlist;
  - status loyalitas dan Magna Points;
  - FAQ kebijakan (Founding, pembayaran, masa tenggang, pindah paket, pembatalan, perangkat).
- `src/components/digital/InstitutionsView.tsx`: 4 tingkat (5/20/50/>50), manfaat per tingkat, manfaat semua tingkat, acquisition wallet 40%, dan catatan Founding institusi. Tanpa harga publik.
- `src/i18n/locales/{id,en,zh}/digital.json` dan `seo.json`: teks keanggotaan dan institusi dalam tiga bahasa.
- `src/data/__tests__/membership.test.ts` (+ `vitest.config.ts`): angka skema dan hitungan bagian 4 dan 3.6.

## 6. Menunggu fase 3 (penagihan)

Brief fase 3 Langkah 0–7 belum diterima. Kebutuhan teknis yang sudah terlihat dari skema ini:

- **Tabel dan data:**
  - `membership_plans`: disalin dari data di atas, dapat diubah admin tanpa deploy;
  - `subscriptions`, `subscription_invoices`, `subscription_events`;
  - penghitung kuota Founding yang atomik.
- **Pembayaran:** Midtrans Subscriptions untuk kartu dan GoPay; Snap untuk VA dan QRIS.
- **Hak akses:** baris `source = 'membership'`. Satu-satunya perubahan skema fase 2 yang diizinkan: kolom `scope` dan `digital_product_id` nullable pada `entitlements` (akses rak, bukan per produk).
- **Pekerjaan terjadwal:** pengingat H-7/H-3/H-1/H0, masa tenggang, penguncian akses, dan pemberitahuan Founding 30 hari.
- **Admin:** tab Keanggotaan dan ekspor CSV. **Frontend:** halaman `/membership/terms`.
- **Flag cetak:** `ENABLE_MEMBER_PRINT_DISCOUNT` untuk diskon cetak anggota; nonaktif = checkout cetak tidak berubah.

## 7. Keputusan terbuka untuk owner

1. **Nama program:** Cakrawala Magna Society (diterapkan) atau nama berbasis CakraNexa (mis. CakraNexa Circle).
2. **Harga Reader:** Rp39.000 dengan pembatasan penumpukan (diterapkan), atau Rp49.000/Rp490.000 (bagian 4).
3. **Usulan B:** Digital Member Pick Reader, rak penuh Author Guild, akses karya sendiri penulis, dan tambahan Patron (bagian 3.2).
4. **Frontlist peluncuran:** 90 hari (diterapkan sebagai kebijakan) dan daftar 3–5 judul pilihan.
5. **Syarat minimum hadiah tahunan Reader:** angka belum ada.
6. **Poin Free Circle:** tarifnya dibanding 3% Magna Points.
7. **Harga e-book dan audiobook satuan** per judul (usulan B ±60% harga cetak).
8. **Harga institusi di halaman publik:** tetap tanpa harga (diterapkan) atau tampilkan "mulai Rp9.900.000".
9. **Batas subsidi ongkir:** Rp15.000 (diterapkan, batas atas analisis A) atau Rp10.000.
10. **Nama imprint akademik:** Scientium atau Scientara.
11. **Harga Founding tampil sekarang** (diterapkan, sebagai halaman penjualan pra-peluncuran) atau baru saat pendaftaran dibuka.
