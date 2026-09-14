Ini FASE 5 dari pembangunan produk digital CakraNexa (Vite + React + TypeScript SPA, Express, Supabase, Midtrans, react-i18next, Vercel + Render). Fase 1–4 selesai: digital_products, entitlements (scope product/shelf, source purchase/membership/institution/admin_grant/author), reading_events (unit, unit_start, unit_end, dwell_ms, session_id, institution_id), subscriptions + subscription_invoices, institutions + institution_contracts + institution_invoices + institution_eba_ledger, dan alur pesanan buku cetak yang sudah berjalan sebelum proyek digital.

Fase ini membangun perhitungan royalti penulis untuk semua kanal, laporan/statement, pembayaran, dan dashboard penulis. Sumber aturan: dokumen strategi royalti perusahaan (struktur royalti Bab 7, formula Bab 8, transparansi & pembayaran Bab 9). Angka di bawah final; jika kode lama atau data kontrak berbeda, laporkan, jangan ubah diam-diam.

PRINSIP
- Royalti dihitung dari PENERIMAAN BERSIH, bukan laba bersih. Penerimaan bersih = uang yang benar-benar diterima penerbit dikurangi HANYA: diskon penjualan yang benar-benar diberikan, komisi distributor/toko/marketplace, pengembalian dan refund, pajak tidak langsung yang dipungut dari pembeli (PPN), biaya pemrosesan pembayaran eksternal (fee Midtrans). TIDAK dikurangi gaji, sewa, pemasaran internal, overhead.
- Setiap angka yang muncul di statement penulis harus bisa ditelusuri ke baris transaksi atau reading_event sumbernya (jejak audit).
- Perhitungan dilakukan oleh job terjadwal yang idempoten; menjalankan ulang periode yang sama menghasilkan angka identik dan tidak menggandakan.
- Periode sudah tertutup tidak boleh berubah; koreksi dilakukan lewat baris penyesuaian di periode berikutnya.

STRUKTUR ROYALTI (per kanal)
A. Buku cetak, kanal langsung (situs, toko sendiri, acara, anggota, preorder langsung, social commerce perusahaan): 20% penerimaan bersih, dengan jaminan minimum setara 10% harga jual eceran (HJE) per eksemplar.
B. Buku cetak, toko/distributor/marketplace: bertingkat dari HJE berdasarkan penjualan bersih kumulatif per judul: 1–2.000 eks 10%; 2.001–5.000 12,5%; 5.001–10.000 15%; 10.001–20.000 17,5%; >20.000 20%. Kenaikan hanya untuk unit dalam lapisan itu (tidak retroaktif) kecuali kontrak menentukan lain.
C. Member Pick dan preorder langsung: 20% penerimaan bersih sejak eksemplar pertama; dapat 22,5% bila melampaui target (parameter per kontrak).
D. E-book satuan: kanal langsung 35% penerimaan bersih; platform pihak ketiga 25%; bundel 25–30% dari porsi yang dialokasikan ke buku (default 30% kanal langsung, dialokasikan proporsional harga satuan).
E. Audiobook: 25% penerimaan bersih (setelah biaya platform eksternal, sebelum overhead). Parameter per kontrak dapat lebih tinggi jika penulis membiayai narator.
F. Keanggotaan konsumen (Reader, Professional, Author Guild): Author Royalty Pool = 20% dari Net Content Revenue (NCR). NCR = pendapatan keanggotaan periode itu dikurangi refund, PPN, fee gateway, dan ALOKASI BENEFIT NONKONTEN (persentase konfigurabel per plan, default: Reader 60% nonkonten, Professional 40%, Author 70% — konfirmasi dengan saya). Pool dibagi per judul: 60% berdasarkan verified reading/penyelesaian, 20% interaksi bermutu, 20% pembelian/EBA yang dipicu dari keanggotaan.
G. Keanggotaan institusi: pool 25% dari NCR institusional (alokasi nonkonten institusi default 30%, konfigurabel), dibagi dengan rumus yang sama; penukaran EBA menjadi lisensi permanen atau cetak memakai royalti penjualan normal (D/E/A).
H. Bulk order dan penjualan khusus (berdasarkan diskon ke pembeli): ≤20% → tarif normal; 20–35% → 15–20% penerimaan bersih; 35–50% → 10–15%; >50% → 5–10% atau persetujuan khusus. Salinan penulis dengan diskon besar dapat nol royalti bila kontrak menyatakan.
I. Hak turunan (dicatat manual oleh admin, bukan dari transaksi otomatis): terjemahan 60–70%, cetak ulang lisensi 60%, audio pihak ketiga 60%, film/TV 75–85%, merchandising 50–60%, course/corporate licensing 50–60% dari penerimaan bersih lisensi.
Semua persentase di atas adalah DEFAULT; tabel kontrak per judul/penulis dapat menimpanya.

LANGKAH 0 — AUDIT (JANGAN UBAH KODE DULU)
1. Pelajari tabel orders/order_items cetak: apakah ada kolom kanal, diskon, ongkir, PPN, fee gateway, retur/refund, dan status. Jika tidak ada kanal (mis. semua pesanan situs), laporkan: fase ini hanya bisa menghitung kanal langsung otomatis, sedangkan toko/distributor perlu input manual.
2. Pelajari reading_events (fase 2), subscription_invoices (fase 3), institution_invoices & eba_ledger (fase 4), dan hubungan buku ↔ penulis (tabel authors, book_authors; apakah ada porsi kepemilikan untuk buku multi-penulis).
3. Cek apakah ada data kontrak penulis di sistem. Jika belum, fase ini membuat tabelnya dan admin mengisinya.
4. Laporkan temuan dan rencana. TUNGGU persetujuan saya.

LANGKAH 1 — DATABASE
Migration SQL (jangan jalankan otomatis):
- author_contracts: id, author_id, book_id null (null = berlaku semua buku penulis), status, effective_from, effective_to null, share_pct (porsi penulis untuk buku multi-penulis, total per buku harus 100), dan override per kanal: print_direct_pct, print_direct_min_hje_pct, print_store_tiers jsonb, member_pick_pct, member_pick_target, member_pick_bonus_pct, ebook_direct_pct, ebook_third_party_pct, audiobook_pct, bundle_pct, bulk_tiers jsonb, derivative jsonb, author_copy_royalty bool; tax: npwp, tax_scheme enum('pph23_15','pph23_npn_6','none') (PPh 23 15% bruto; atau 6% efektif bagi WP OP yang memenuhi syarat NPPN sesuai PER-1/PJ/2023 — kelayakan diperiksa admin per penulis), bank_name, bank_account_masked (hanya 4 digit terakhir; nomor lengkap TIDAK disimpan di database aplikasi — simpan di sistem keuangan), payment_frequency enum('quarterly','semiannual'), min_payout int (default Rp500.000, konfigurabel), notes, created_at.
- royalty_periods: id, period_start, period_end, status enum('open','calculating','review','closed','paid'), closed_at, closed_by, notes.
- royalty_config: key, value jsonb (default persentase, alokasi nonkonten per plan, bobot pool 60/20/20, definisi interaksi bermutu, min_payout).
- sales_ledger (normalisasi semua transaksi yang berhak royalti): id, period_id, source_type enum('print_order','digital_order','bundle','bulk','manual_store','manual_derivative','eba_redemption','adjustment'), source_ref, book_id, digital_product_id null, channel enum('direct','member','store','marketplace','third_party_digital','institution','derivative'), quantity, gross_amount, discount_amount, commission_amount, refund_amount, tax_amount, gateway_fee, net_receipt (dihitung), hje_at_sale, customer_discount_pct, occurred_at, is_test bool, created_at. UNIQUE(source_type, source_ref, book_id).
- content_revenue (pendapatan keanggotaan per periode): id, period_id, revenue_type enum('membership_consumer','membership_institution'), plan_code null, institution_id null, gross_amount, refund_amount, tax_amount, gateway_fee, noncontent_alloc_pct, ncr (dihitung), pool_pct, pool_amount (dihitung).
- reading_metrics (agregat per judul per periode): period_id, digital_product_id, book_id, revenue_type, verified_units (halaman atau menit tervalidasi), completions (pembaca yang mencapai ≥80% judul), unique_readers, interaction_score (catatan/highlight/pencarian/bab diselesaikan, dengan batas per pengguna), purchase_trigger_amount (pembelian satuan atau EBA oleh pengguna yang membaca judul itu lewat keanggotaan dalam 30 hari), fraud_excluded_units.
- royalty_lines: id, period_id, author_id, book_id, digital_product_id null, contract_id, channel, basis enum('net_receipt','hje','pool_reading','pool_interaction','pool_purchase','derivative','adjustment'), base_amount, rate_pct, quantity, amount (dihitung), calc_trace jsonb (rumus dan angka masukan), created_at. Ini baris yang bisa diaudit.
- royalty_statements: id, period_id, author_id, gross_royalty, adjustments, tax_withheld, net_payable, carried_forward (jika < min_payout), status enum('draft','issued','approved','paid'), pdf_path (bucket privat), issued_at, approved_at, paid_at, payment_ref, tax_proof_path null. UNIQUE(period_id, author_id).
- royalty_payments: id, statement_id, amount, paid_at, method, reference, proof_path.
- RLS: penulis hanya melihat statement, royalty_lines, reading_metrics, dan sales_ledger agregat untuk bukunya sendiri; admin/finance service role. Penulis tidak melihat data pembaca individu.

LANGKAH 2 — PENGISIAN SALES LEDGER (job harian, idempoten)
- Cetak: setiap order cetak berstatus settled/delivered (bukan is_test, bukan dibatalkan) → satu baris per book_id dengan channel 'direct' atau 'member' (jika pembeli anggota aktif saat transaksi), discount = diskon nyata (harga member, voucher, wallet), tax = PPN jika dipungut, gateway_fee = fee Midtrans aktual dari data transaksi (jika tidak tersedia, pakai tarif konfigurabel per metode bayar dan tandai 'estimated' di trace). Ongkos kirim BUKAN bagian penerimaan buku (dikeluarkan dari gross). Refund/retur yang terjadi kemudian → baris negatif di periode saat terjadi.
- Digital satuan: digital_orders settled → channel 'direct', bundel dialokasikan proporsional harga satuan → source_type 'bundle'.
- EBA redemption (fase 4): lisensi permanen/cetak → channel 'institution' dengan rate penjualan normal D/E/A.
- Manual: form admin untuk penjualan toko/distributor/marketplace (impor CSV: tanggal, judul/ISBN, qty, HJE, rabat %, retur) dan hak turunan (manual_derivative). Setiap impor dicatat siapa dan kapan.
- Perbaikan retroaktif dilarang untuk periode closed → otomatis jadi 'adjustment' di periode open.

LANGKAH 3 — VERIFIED READING & METRIK POOL (job harian, agregasi ke reading_metrics)
- Verified unit: reading_events dari sesi sah, dwell 3 detik–10 menit per halaman (e-book) atau menit didengar dengan kecepatan ≤2× (audiobook). Batas per pengguna per judul per hari: maksimal 1× page_count halaman atau 1,5× durasi menit; kelebihan dibuang dan dihitung di fraud_excluded_units.
- Deteksi manipulatif (dikecualikan seluruhnya untuk hari itu): >3 halaman/detik berkelanjutan, pola dwell identik berulang, sesi dari akun yang di-suspend fase 2, unduhan/klik tanpa dwell.
- Completion: pengguna mencapai ≥80% halaman/menit unik dalam 90 hari.
- Interaction score per judul: catatan/highlight (maks 20 per pengguna per judul), pencarian dengan klik hasil (maks 10), bab diselesaikan; bobot konfigurabel di royalty_config. Nilai per pengguna dinormalkan agar satu pengguna hiperaktif tidak mendominasi.
- Purchase trigger: pembelian satuan judul X atau penukaran EBA judul X oleh pengguna yang dalam 30 hari sebelumnya membaca X lewat entitlement membership/institution.
- Pisahkan metrik per revenue_type (konsumen vs institusi) karena pool-nya berbeda.

LANGKAH 4 — PERHITUNGAN ROYALTI (dijalankan saat admin menutup periode; dapat dijalankan ulang selama status 'review')
- Kanal cetak langsung/member: amount = max(net_receipt × 20%, hje × 10%) × share_pct.
- Kanal toko: hitung kumulatif penjualan bersih judul sejak terbit (dari ledger semua periode) untuk menentukan lapisan; unit di setiap lapisan × HJE × rate lapisan × share_pct.
- Member Pick/preorder langsung: 20% net (22,5% bila target tercapai dalam periode).
- E-book/audiobook/bundel/EBA: rate per kanal × net_receipt × share_pct.
- Bulk: rate menurut customer_discount_pct sesuai tabel H (ambil titik tengah rentang sebagai default; konfigurabel).
- Pool konsumen: pool_amount = NCR × 20%. Bagi: 60% ∝ verified_units per judul (dinormalkan terhadap page_count/durasi agar buku tebal tidak otomatis menang — gunakan proporsi "judul-setara dibaca" = verified_units / ukuran judul), 20% ∝ interaction_score, 20% ∝ purchase_trigger_amount. Judul tanpa metrik = 0. Hasil per judul × share_pct per penulis. Pool institusi sama dengan 25%.
- Hak turunan: manual, rate dari kontrak.
- Setiap baris menyimpan calc_trace lengkap. Total per penulis → royalty_statements: gross, penyesuaian, pajak (PPh 23: 15% bruto, atau 6% jika tax_scheme NPPN; 'none' jika ada alasan yang dicatat), net_payable; jika net < min_payout → carried_forward ke periode berikutnya.
- Laporan rekonsiliasi untuk admin: total pool = jumlah semua royalty_lines pool (selisih pembulatan ≤ Rp100), total ledger vs total pendapatan sistem, daftar judul tanpa kontrak (royalti tertahan sampai kontrak diisi).

LANGKAH 5 — STATEMENT, PERSETUJUAN, PEMBAYARAN
- Alur: open → calculating → review (admin memeriksa rekonsiliasi, bisa hitung ulang) → closed (angka dikunci, statement PDF dibuat per penulis dan dikirim email) → paid (admin mencatat pembayaran + unggah bukti transfer dan bukti potong PPh 23; tidak ada integrasi transfer otomatis di fase ini).
- Statement PDF (id, opsional en): identitas, periode, tabel per judul × kanal (qty, HJE, penerimaan bersih, rate, royalti), bagian keanggotaan (verified reading judul, completions, porsi pool), penyesuaian, pajak, net, carried forward, penjelasan definisi penerimaan bersih (teks klausul dari dokumen royalti), catatan hak audit terbatas.
- Frekuensi: default semiannual; quarterly untuk penulis prioritas (flag di kontrak). Periode dibuat admin (bulanan agregasi, statement per frekuensi).

LANGKAH 6 — DASHBOARD PENULIS (/author/dashboard, hanya user dengan role author yang terhubung ke authors.user_id)
- Ringkasan: royalti berjalan (estimasi periode open, diberi label "estimasi, belum final"), statement terakhir, saldo carried forward, tanggal pembayaran berikutnya.
- Per judul (per ISBN/format): penjualan cetak per kanal (qty, penerimaan bersih), e-book/audiobook satuan, retur, verified reading & completions bulanan, posisi judul dalam pool (persen), pembeli institusi (jumlah institusi, tanpa nama pengguna).
- Statement: daftar, unduh PDF, bukti potong pajak, riwayat pembayaran.
- Profil pembayaran: lihat NPWP tersamar, 4 digit rekening, skema pajak; perubahan diminta lewat form ke admin (bukan edit langsung).
- Permintaan audit terbatas: tombol "Ajukan penelusuran" untuk satu periode → tugas admin, dijawab dengan ekspor royalty_lines + calc_trace judul penulis itu.
- Semua angka menampilkan tooltip "cara hitung" dari calc_trace.

LANGKAH 7 — ADMIN / FINANCE
- Tab "Royalti": periode (buat, hitung, review, tutup, bayar), rekonsiliasi, daftar statement, filter penulis/judul/kanal, ekspor CSV (ledger, lines, statements) untuk akuntansi, konfigurasi royalty_config dengan riwayat perubahan (siapa, kapan, nilai lama/baru), impor penjualan toko, input hak turunan, kontrak penulis (form + validasi share_pct = 100 per buku).
- Peran: 'finance' dapat semua; 'editor' hanya lihat. Setiap aksi tutup/bayar dicatat.
- Peringatan otomatis: judul tanpa kontrak, penulis tanpa NPWP/skema pajak, kontrak kedaluwarsa, periode open >45 hari setelah period_end.

LANGKAH 8 — I18N, EMAIL, KEAMANAN
- digital.json + namespace baru royalty.json (id & en); i18n:check 0 key hilang.
- Email: statement terbit, pembayaran dilakukan, permintaan perubahan profil diproses, pengingat admin periode belum ditutup.
- Data pajak/rekening: enkripsi kolom sensitif jika disimpan (pgcrypto) atau simpan di luar sistem; log akses admin ke data itu.
- /author/* noindex.

LANGKAH 9 — VERIFIKASI
Tes otomatis dengan data sintetis:
1. Cetak langsung Rp150.000, terima Rp135.000 → royalti Rp27.000; terima Rp110.000 (member) → Rp22.000; jaminan minimum 10% HJE aktif jika net × 20% < Rp15.000. 2. Toko: 2.500 eks kumulatif → 2.000 × 10% + 500 × 12,5% dari HJE. 3. E-book langsung Rp99.000 net → Rp34.650; audiobook Rp79.000 net → Rp19.750; bundel dialokasikan proporsional. 4. Buku dua penulis 60/40 → jumlah lines = 100%. 5. Pool: NCR Rp10.000.000 → pool Rp2.000.000; 3 judul dengan verified 50/30/20 dan interaksi/pembelian tertentu → jumlah lines pool = Rp2.000.000 ± Rp100; judul tebal 600 halaman vs 200 halaman dengan pembaca sama tidak mendapat 3× porsi. 6. Reading manipulatif (300 halaman dalam 60 detik) dikecualikan. 7. Menjalankan ulang perhitungan periode 'review' dua kali → hasil identik, tidak ada baris ganda; periode 'closed' menolak perubahan; refund setelah closed → adjustment di periode open. 8. PPh 23 15% dan skema NPPN 6% dihitung benar; net < min_payout → carried forward dan ditambahkan di periode berikutnya. 9. Penulis A tidak bisa melihat lines penulis B (RLS). 10. Statement PDF memuat semua baris dan totalnya sama dengan royalty_statements.
- npm run build, lint, tes hijau.
- Jangan commit/push sampai saya review. Laporkan: file diubah, migration SQL, konfigurasi default yang saya harus konfirmasi (alokasi nonkonten per plan, bobot interaksi, min_payout, titik tengah tabel bulk), kolom data cetak yang tidak tersedia dan perlu input manual, dan template statement untuk direview bagian keuangan.

ATURAN
- Kerjakan per langkah, laporkan sebelum lanjut.
- Tidak ada perhitungan royalti yang mengubah data transaksi sumber; ledger dan lines adalah tabel turunan.
- Angka yang dilihat penulis harus sama persis dengan angka yang dilihat admin untuk periode yang sama.
- Jangan simpan nomor rekening lengkap, PAN kartu, atau data pajak dalam bentuk teks biasa.
- Jangan menghapus data; jangan menjalankan migration otomatis.
- Semua persentase mengikuti prompt ini dan dapat ditimpa per kontrak; jika kode lama atau data berbeda, laporkan.