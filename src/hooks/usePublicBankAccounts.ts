import { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import type { AdminBankAccount } from '../types';

/**
 * Rekening perusahaan dari server (GET /api/bank-accounts) untuk transfer manual di checkout buku cetak.
 * null = belum dimuat atau server tidak terjangkau; pemanggil memakai rekening bawaan (resolveCheckoutBankAccounts).
 * Satu permintaan dipakai bersama semua komponen; hasil yang berhasil disimpan 60 detik.
 */
const CACHE_MS = 60_000;
let cached: { at: number; accounts: AdminBankAccount[] } | null = null;
let inflight: Promise<AdminBankAccount[] | null> | null = null;

const loadPublicBankAccounts = (): Promise<AdminBankAccount[] | null> => {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.accounts);
  if (!inflight) {
    inflight = apiClient.getPublicBankAccounts()
      .then((accounts) => {
        if (accounts) cached = { at: Date.now(), accounts };
        return accounts;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

export const usePublicBankAccounts = (enabled = true): AdminBankAccount[] | null => {
  const [accounts, setAccounts] = useState<AdminBankAccount[] | null>(() => cached?.accounts ?? null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadPublicBankAccounts().then((next) => {
      if (active && next) setAccounts(next);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return accounts;
};
