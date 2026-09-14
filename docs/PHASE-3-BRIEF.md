Ini FASE 3 dari pembangunan produk digital CakraNexa (Vite + React + TypeScript SPA, Express, Supabase, Midtrans, react-i18next, Vercel + Render). Fase 1 (halaman /membership, /institutions, /library, tabel digital_products dengan shelf_entry_date) dan fase 2 (entitlements, user_devices, access_sessions, reader/player terproteksi, pembelian satuan) sudah selesai dan di-merge. Fase ini membuat keanggotaan berbayar berfungsi: pendaftaran, penagihan, perpanjangan, dan pemberian akses Digital Reading Shelf melalui sistem entitlement yang sudah ada.

PAKET (sumber: dokumen strategi keanggotaan perusahaan — angka ini final, jangan diubah)
- Free Circle: Rp0. Akun, newsletter, sampel bab, wishlist. Tidak ada akses rak digital.
- Reader Circle: Rp39.000/bulan, Rp390.000/tahun. Founding Member tahun pertama Rp299.000/tahun, kuota 1.000 anggota pertama. Akses digital: sampel + 1 "Digital Member Pick" per bulan dari backlist (jika flag ENABLE_READER_DIGITAL_PICK=true). max_devices 1.
- Professional & Academic Society: Rp99.000/bulan, Rp990.000/tahun. Founding Rp790.000/tahun, kuota 500. Akses digital: seluruh Digital Reading Shelf (e-book + audiobook). max_devices 2.
- Author Guild: Rp149.000/bulan, Rp1.490.000/tahun. Founding Rp1.190.000/tahun, kuota 250. Akses digital: seluruh Digital Reading Shelf jika flag ENABLE_AUTHOR_GUILD_SHELF=true, jika false hanya sampel + karya sendiri (entitlement source='author' sudah ada dari fase 2). max_devices 2.
- Institution & Library Network: DI LUAR LINGKUP (fase 4). /institutions tetap form penawaran.
- Harga tahunan = 10× bulanan; tahunan adalah pilihan default di halaman. Harga Founding hanya tahun pertama; perpanjangan ke harga reguler dengan pemberitahuan jelas.

DIGITAL READING SHELF & FRONTLIST POLICY
- Produk digital masuk rak jika: is_active, processing_status='ready', shelf_entry_date IS NOT NULL dan <= hari ini. Produk dengan shelf_entry_date di masa depan tampil sebagai "Masuk rak digital: [tanggal]" (sudah ada dari fase 1) dan hanya bisa dibeli satuan.
- Anggota yang membeli satuan sebuah judul frontlist tetap memiliki entitlement 'purchase' seumur hidup, terpisah dari keanggotaan.
- Manfaat non-digital keanggotaan (wallet, poin, Member Pick cetak, pengiriman gratis, webinar, book club) DI LUAR LINGKUP fase ini, kecuali diskon buku cetak (lihat Langkah 7) yang bersifat opsional lewat flag.

LANGKAH 0 — AUDIT (JANGAN UBAH KODE DULU)
1. Pelajari fase 2: tabel entitlements (kolom source, source_ref, ends_at, max_devices), middleware requireEntitlement, cara max_devices dihitung per user, halaman /library, webhook Midtrans, dan tabel orders.
2. Pelajari src/data/membership.ts dari fase 1 (daftar manfaat statis) dan komponen halaman /membership.
3. Cek akun Midtrans: apakah Subscriptions API (card token / GoPay tokenization) sudah aktif; apakah Snap sudah dipakai. Laporkan apa yang bisa auto-debit dan apa yang tidak.
4. Laporkan temuan dan rencana. TUNGGU persetujuan saya.

LANGKAH 1 — DATABASE
Migration SQL (jangan jalankan otomatis):
- Tabel plans: id, code ('free','reader','professional','author'), name_id, name_en, price_monthly int, price_yearly int, founding_price_yearly int null, founding_cap int null, founding_count int default 0, max_devices int, shelf_access enum('none','pick','full'), sort_order, is_active. Isi seed sesuai angka di atas; halaman /membership membaca dari sini, bukan lagi dari file statis (pindahkan teks manfaat ke tabel plan_benefits: plan_id, benefit_key, sort_order; teks manfaatnya tetap di i18n digital.json dengan key).
- Tabel subscriptions: id, user_id, plan_id, billing_cycle enum('monthly','yearly'), status enum('pending','active','past_due','grace','canceled','expired'), is_founding bool, price_locked int (harga yang disepakati, untuk Founding), current_period_start, current_period_end, cancel_at_period_end bool, canceled_at null, payment_method enum('card','gopay','va','qris','other'), midtrans_subscription_id text null (jika auto-debit), midtrans_token text null (disimpan terenkripsi atau hanya referensi token Midtrans, tidak pernah PAN), created_at, updated_at. Index (user_id, status). Satu user maksimal satu subscription non-expired.
- Tabel subscription_invoices: id, subscription_id, period_start, period_end, amount, status enum('draft','issued','paid','failed','void'), midtrans_order_id text UNIQUE, midtrans_snap_token null, issued_at, paid_at, due_at, attempt int, created_at.
- Tabel subscription_events: id, subscription_id, type ('created','activated','renewed','payment_failed','reminder_sent','grace_started','expired','canceled','upgraded','downgraded','founding_notice'), meta jsonb, created_at.
- Tabel digital_member_picks (Reader Circle): id, subscription_id, digital_product_id, period_start, period_end, entitlement_id. UNIQUE(subscription_id, period_start).
- Perluasan entitlements (satu-satunya perubahan skema fase 2 yang diizinkan): tambah kolom scope enum('product','shelf') default 'product', dan buat digital_product_id NULLABLE untuk scope='shelf'. Alasan: keanggotaan Professional memberi satu entitlement 'shelf' per periode, bukan 23+ baris per anggota yang harus dibuat ulang setiap kali katalog bertambah. Perbarui requireEntitlement: akses sah jika ada entitlement aktif scope='product' untuk produk itu, ATAU entitlement aktif scope='shelf' DAN produk memenuhi syarat rak (aturan di atas). Tulis fungsi SQL/RPC is_product_on_shelf(product_id, date) agar aturannya satu tempat.
- RLS: user membaca subscriptions, subscription_invoices, digital_member_picks miliknya; plans dan plan_benefits publik; subscription_events service role.

LANGKAH 2 — PENDAFTARAN & PEMBAYARAN PERTAMA
- POST /api/membership/subscribe: wajib login; body {plan_code, billing_cycle, payment_method, idempotency_key, accept_terms:true}. Tolak jika user sudah punya subscription aktif/grace (arahkan ke upgrade). Tentukan harga: jika billing_cycle yearly dan founding_count < founding_cap → is_founding=true, price_locked=founding_price_yearly, founding_count++ (dalam transaksi, cegah race). Buat subscription status 'pending' + invoice pertama + order Midtrans.
- Metode card/gopay (jika Midtrans Subscriptions tersedia): buat transaksi pertama dengan tokenisasi, lalu buat Midtrans subscription untuk siklus berikutnya; simpan midtrans_subscription_id. Metode va/qris: transaksi Snap sekali bayar; siklus berikutnya lewat perpanjangan manual (Langkah 3).
- Webhook Midtrans (perluas handler fase 2, bedakan lewat prefix order_id, mis. SUB-...): settlement → invoice paid, subscription active, current_period_* diisi, buat entitlement source='membership', source_ref=subscription_id, scope sesuai plan (full → 'shelf'; pick → tidak membuat entitlement sampai anggota memilih Pick; none → tidak ada), starts_at=period_start, ends_at=period_end + masa tenggang 5 hari, max_devices dari plan. ON CONFLICT (source, source_ref, scope, digital_product_id, starts_at) DO NOTHING. Webhook ganda tidak boleh menggandakan.
- Halaman /membership: toggle Bulanan/Tahunan (default tahunan), badge "Founding Member — tersisa N kursi" jika kuota masih ada, pilihan metode bayar dengan penjelasan jujur: "Kartu/GoPay: perpanjangan otomatis. Virtual Account/QRIS: kami kirim tagihan setiap periode, Anda bayar manual." Checkbox ketentuan keanggotaan (buat halaman /membership/terms, draft untuk saya review) dan ketentuan lisensi digital fase 2.
- Setelah bayar: redirect ke /library dengan onboarding singkat (3 langkah: rak digital, perangkat, cara perpanjangan).

LANGKAH 3 — PERPANJANGAN, PENGINGAT, MASA TENGGANG
Job harian (Render cron atau scheduler di server; jelaskan pilihan, jangan bergantung pada request user):
- Auto-debit (card/gopay): Midtrans menagih pada current_period_end; webhook sukses → invoice baru paid, periode maju, entitlement baru untuk periode baru (yang lama dibiarkan berakhir). Gagal → status past_due, coba ulang H+1 dan H+3, kirim email "pembayaran gagal".
- Manual (va/qris): H-7 buat invoice 'issued' + Snap link; kirim email dan (jika tersedia integrasi) WhatsApp pada H-7, H-3, H-1, H0. Belum bayar pada H0 → status 'grace' 5 hari, akses tetap terbuka (ends_at entitlement sudah mencakup 5 hari). Hari ke-6 → 'expired', entitlement berakhir alami, kirim email "akses dikunci, progres dan catatan tersimpan 12 bulan, perpanjang untuk membuka kembali". Pembayaran setelah expired → subscription baru dengan harga reguler (bukan Founding), progres/catatan lama otomatis tersambung karena keyed by user_id.
- Founding Member: 30 hari sebelum ulang tahun pertama kirim email pemberitahuan harga reguler yang akan berlaku (subscription_events 'founding_notice'); saat perpanjangan, price_locked diganti harga reguler.
- Semua pengiriman pengingat dicatat di subscription_events agar tidak dikirim dua kali.

LANGKAH 4 — UPGRADE, DOWNGRADE, PEMBATALAN
- Upgrade (reader → professional/author, professional → author): berlaku seketika; hitung kredit prorata sisa periode lama, tagih selisih via Snap; setelah bayar: entitlement lama revoked (reason 'upgraded'), entitlement baru dibuat, max_devices diperbarui, periode baru dimulai hari ini. Founding tidak ikut pindah (harga plan baru reguler) kecuali plan tujuan masih punya kuota Founding dan siklus yearly.
- Downgrade: dijadwalkan pada current_period_end; subscription_events 'downgraded'; saat periode berganti, plan baru berlaku. Jika perangkat aktif melebihi max_devices baru, saat sesi berikutnya frontend meminta melepas perangkat.
- Pembatalan: dari dalam akun, satu klik + konfirmasi, tanpa harus menghubungi admin (cancel_at_period_end=true; auto-debit Midtrans dinonaktifkan). Akses tetap sampai akhir periode. Tampilkan tanggal akhir akses dengan jelas. Sediakan "batalkan pembatalan" sebelum periode berakhir.
- Bulanan → tahunan: berlaku seketika dengan prorata; tahunan → bulanan: pada akhir periode.

LANGKAH 5 — DIGITAL MEMBER PICK (Reader Circle, jika flag aktif)
- Di /library, anggota Reader memilih 1 judul dari daftar produk yang memenuhi syarat rak (backlist) untuk periode berjalan. Sekali dipilih dikunci sampai current_period_end. Membuat entitlement scope='product', source='membership', ends_at=period_end+5 hari. Periode berikutnya boleh pilih judul lain (atau sama). Kuota yang tidak dipakai hangus; tidak akumulatif.

LANGKAH 6 — PUSTAKA SAYA & HALAMAN AKUN
- /library untuk anggota: tab "Rak Digital" (semua judul on-shelf untuk Professional/Author; Pick untuk Reader) dan tab "Milik Saya" (entitlement purchase). Judul frontlist tampil di bagian "Segera masuk rak" dengan tanggal dan tombol beli satuan.
- /account/membership: paket, siklus, status, periode, metode bayar, riwayat invoice (unduh bukti), tombol upgrade/downgrade/batalkan, ganti metode bayar (untuk card/gopay lewat Midtrans), status Founding dan tanggal berakhirnya harga Founding.
- Empty state /library untuk Free Circle: sampel + CTA ke /membership; setelah pembelian buku cetak sukses, tampilkan satu tawaran keanggotaan (mekanisme konversi Free Circle), tidak lebih dari sekali per 30 hari per user.

LANGKAH 7 — DISKON BUKU CETAK ANGGOTA (opsional, flag ENABLE_MEMBER_PRINT_DISCOUNT)
- Jika aktif: Reader 10%, Professional 15%, Author 15% pada harga buku cetak grup di keranjang, diterapkan sebagai "harga member" (langkah pertama urutan diskon), tidak bertumpuk dengan promo lain kecuali diatur admin. Tampilkan harga coret + "Harga member" di kartu dan keranjang. Ini satu-satunya perubahan ke alur cetak; jika flag mati, tidak ada perubahan.

LANGKAH 8 — ADMIN
- Tab "Keanggotaan": daftar subscription (filter plan/status/founding), detail per anggota (invoice, events, entitlement, perangkat), aksi: perpanjang manual (mis. pembayaran offline), beri masa tenggang tambahan, batalkan, ubah plan, tandai founding. Edit plans (harga, kuota Founding, flag) tanpa deploy. Ringkasan: anggota aktif per plan, baru bulan ini, batal, past_due/grace, pendapatan keanggotaan bulan ini, porsi tahunan, churn bulanan sederhana (canceled+expired / aktif awal bulan), sisa kuota Founding.
- Ekspor CSV subscription dan invoice untuk akuntansi.

LANGKAH 9 — I18N, EMAIL, SEO
- Semua teks ke digital.json (id & en); npm run i18n:check = 0 key hilang.
- Template email (id & en): selamat datang, invoice/pengingat H-7/H-3/H-1/H0, pembayaran gagal, masa tenggang, akses dikunci, upgrade/downgrade, pembatalan, pemberitahuan harga Founding, Pick dikunci.
- /membership dan /membership/terms indexable dengan meta dari seo.json; /account/* dan /library/* noindex.

LANGKAH 10 — VERIFIKASI
Tes otomatis + manual:
1. Subscribe yearly saat founding_count = cap-1 oleh dua user bersamaan → hanya satu Founding. 2. Webhook settlement ganda → satu invoice paid, satu entitlement. 3. Professional bisa membuka produk on-shelf, TIDAK bisa membuka produk dengan shelf_entry_date besok, dan tetap bisa membeli satuan. 4. Reader tanpa Pick → 403 no_entitlement; setelah Pick → bisa; ganti Pick di periode sama → ditolak. 5. Lewati waktu (mock tanggal): H-7 invoice terbit & pengingat tercatat sekali; H0 → grace, akses masih bisa; H+6 → expired, reader menolak, progres masih ada; bayar lagi → aktif, progres tersambung. 6. Upgrade prorata: entitlement lama revoked, baru aktif, max_devices berubah. 7. Cancel → akses sampai period_end, tidak ada tagihan berikutnya; Midtrans subscription dinonaktifkan. 8. Auto-debit gagal → past_due, retry, email. 9. Founding notice terkirim 30 hari sebelum ulang tahun dan harga perpanjangan reguler. 10. Flag ENABLE_MEMBER_PRINT_DISCOUNT mati → tidak ada perubahan pada checkout cetak (bandingkan snapshot).
- npm run build, lint, tes hijau. Uji alur end-to-end di Midtrans sandbox untuk card, GoPay, VA, dan QRIS.
- Jangan commit/push sampai saya review. Laporkan: file diubah, migration SQL, env baru (Midtrans Subscriptions, cron), template email, keputusan yang perlu saya ambil, dan hal yang belum bisa otomatis (mis. WhatsApp jika belum ada integrasi).

ATURAN
- Kerjakan per langkah, laporkan sebelum lanjut.
- Satu-satunya perubahan skema fase 2 yang diizinkan adalah kolom scope dan digital_product_id nullable di entitlements.
- Jangan menyimpan data kartu; hanya token/ID Midtrans.
- Jangan ubah alur cetak selain Langkah 7 di balik flag.
- Jangan menghapus data; jangan menjalankan migration otomatis.
- Angka harga, kuota Founding, dan aturan tenggang mengikuti nilai di prompt ini; jika kode lama berbeda, laporkan, jangan diam-diam mengubah.