-- Replace seeded placeholder accounts with the verified company account.
UPDATE public.admin_bank_accounts
SET bank_name = 'Bank Mandiri',
    bank_code = 'MANDIRI',
    account_number = '167-00-1164499-3',
    account_holder = 'PT CAKRAWALA MAGNA SCIENTIA',
    branch = '',
    is_active = true,
    is_default = true
WHERE id = 'bank-mandiri-giro';

DELETE FROM public.admin_bank_accounts
WHERE id IN ('bank-bca-bisnis', 'bank-bni-giro');

UPDATE public.payment_settings
SET qris_nmid = ''
WHERE id = 'primary_settings';