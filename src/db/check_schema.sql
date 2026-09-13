-- ============================================================================
-- PEMERIKSAAN SKEMA (hanya MEMBACA; aman dijalankan kapan saja di Supabase SQL Editor)
-- ============================================================================
-- Kolom "ada" = false berarti migration di kolom "migration" belum dijalankan (atau belum lengkap).
-- Jalankan migration yang belum lengkap sesuai urutan kolom "urutan". Panduan: docs/DEPLOY-SUPABASE.md.
-- Daftar ini sama dengan REQUIRED_SCHEMA di backend/startupChecks.ts (server Render menolak start bila ada yang false),
-- ditambah pemeriksaan bucket Storage.
-- ============================================================================
WITH required (urutan, migration, object, kind) AS (
    VALUES
        (1, 'schema.sql', 'books', 'table'),
        (1, 'schema.sql', 'orders', 'table'),
        (1, 'schema.sql', 'order_items', 'table'),
        (1, 'schema.sql', 'seo_settings', 'table'),
        (1, 'schema.sql', 'site_content', 'table'),
        (2, 'src/db/authors_schema.sql', 'authors', 'table'),
        (2, 'src/db/authors_schema.sql', 'book_authors', 'table'),
        (3, 'src/db/i18n_content_migration.sql', 'books.i18n', 'column'),
        (3, 'src/db/i18n_content_migration.sql', 'authors.i18n', 'column'),
        (3, 'src/db/i18n_content_migration.sql', 'orders.language', 'column'),
        (4, 'src/db/digital_products_migration.sql', 'digital_products', 'table'),
        (4, 'src/db/digital_products_migration.sql', 'institution_inquiries', 'table'),
        (4, 'src/db/digital_products_migration.sql', 'digital-samples', 'public_bucket'),
        (5, 'src/db/digital_phase2_migration.sql', 'digital_products.processing_status', 'column'),
        (5, 'src/db/digital_phase2_migration.sql', 'digital_products.storage_path', 'column'),
        (5, 'src/db/digital_phase2_migration.sql', 'digital_product_pages', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'digital_product_chapters', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'digital_orders', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'digital_orders.is_test', 'column'),
        (5, 'src/db/digital_phase2_migration.sql', 'digital_order_items', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'entitlements', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'user_devices', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'access_sessions', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'access_logs', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'reading_progress', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'reading_events', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'user_notes', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'access_anomalies', 'table'),
        (5, 'src/db/digital_phase2_migration.sql', 'digital-assets', 'private_bucket')
)
SELECT
    urutan,
    migration,
    object,
    CASE kind
        WHEN 'table' THEN to_regclass('public.' || object) IS NOT NULL
        WHEN 'column' THEN EXISTS (
            SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public'
               AND c.table_name = split_part(object, '.', 1)
               AND c.column_name = split_part(object, '.', 2))
        WHEN 'public_bucket' THEN EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = object AND b.public)
        WHEN 'private_bucket' THEN EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = object AND NOT b.public)
    END AS ada
FROM required
ORDER BY urutan, object;
