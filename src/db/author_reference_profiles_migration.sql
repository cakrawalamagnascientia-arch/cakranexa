-- Selaraskan metadata enam profil author dengan referensi biografi.
-- Jalankan di Supabase SQL Editor setelah authors_schema.sql.
-- Migration ini tidak membuat author baru dan tidak menghapus relasi buku.

UPDATE authors
SET
  name = 'Bonarsius Sipayung',
  academic_titles = NULL,
  photo_url = NULL,
  email = NULL,
  updated_at = NOW()
WHERE LOWER(name) LIKE '%bonarsius%';

UPDATE authors
SET
  name = 'Dr. Edy Gunawan',
  academic_titles = 'S.E., Ak., S.H., M.Ak., M.H., M.Kn., BKP., CLA., Mediator., CertDa., CIISA',
  photo_url = NULL,
  scopus_id = NULL,
  orcid_id = NULL,
  email = NULL,
  updated_at = NOW()
WHERE LOWER(name) LIKE '%edy gunawan%';

UPDATE authors
SET
  name = 'Henry Dianto P. Sinaga',
  academic_titles = NULL,
  photo_url = NULL,
  scopus_id = '57213170349',
  orcid_id = '0000-0002-4533-6283',
  email = NULL,
  updated_at = NOW()
WHERE LOWER(name) LIKE '%henry dianto%';

UPDATE authors
SET
  name = 'Joko Purnomo Raharjo',
  academic_titles = NULL,
  photo_url = NULL,
  scopus_id = '57855623900',
  orcid_id = '0000-0003-0761-9327',
  email = 'jokopurnomo.jpr@gmail.com',
  updated_at = NOW()
WHERE LOWER(name) LIKE '%joko purnomo%';

UPDATE authors
SET
  name = 'Dr. Wahyu Widodo, Ak., CA., S.H., M.Si.',
  academic_titles = NULL,
  photo_url = NULL,
  scopus_id = NULL,
  orcid_id = NULL,
  email = NULL,
  updated_at = NOW()
WHERE LOWER(name) LIKE '%wahyu widodo%';

UPDATE authors
SET
  name = 'Yudha Pramana',
  academic_titles = NULL,
  photo_url = NULL,
  scopus_id = NULL,
  orcid_id = NULL,
  email = NULL,
  updated_at = NOW()
WHERE LOWER(name) LIKE '%yudha pramana%';
