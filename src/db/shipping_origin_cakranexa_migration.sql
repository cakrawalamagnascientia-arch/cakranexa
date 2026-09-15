-- Tetapkan lokasi gudang CakraNexa sebagai asal RajaOngkir.
-- Hasil pencarian Komerce untuk kode pos 17134: ID 6521 (BINTARA, BEKASI BARAT).
-- Jalankan di Supabase SQL Editor setelah src/db/print_checkout_migration.sql.

UPDATE public.print_checkout_settings
SET origin_id = 6521,
    origin_label = 'Jl. Bintara Raya 9A Nomor 27 RT 005 RW 005, Bekasi Barat, Kota Bekasi, Jawa Barat 17134 (BINTARA, BEKASI BARAT)',
    updated_at = NOW()
WHERE id = 1;
