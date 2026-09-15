-- Tambahkan mata uang rekening dan rekening Mandiri USD untuk pembayaran internasional.
-- Jalankan di Supabase SQL Editor setelah tabel public.admin_bank_accounts tersedia.

ALTER TABLE public.admin_bank_accounts
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'IDR'
  CHECK (currency IN ('IDR', 'USD'));

INSERT INTO public.admin_bank_accounts
  (id, bank_name, bank_code, account_number, account_holder, branch, currency, is_active, is_default)
VALUES
  ('bank-mandiri-usd', 'Bank Mandiri', 'MANDIRI', '167-00-1171867-2', 'PT CAKRAWALA MAGNA SCIENTIA', '', 'USD', TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET
  bank_name = EXCLUDED.bank_name,
  bank_code = EXCLUDED.bank_code,
  account_number = EXCLUDED.account_number,
  account_holder = EXCLUDED.account_holder,
  currency = EXCLUDED.currency,
  is_active = EXCLUDED.is_active;
