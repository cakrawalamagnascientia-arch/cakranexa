/**
 * Sesi anggota (pembaca). Fase 1 belum punya akun pelanggan — login yang ada hanya untuk admin.
 * Semua pemanggil (menu "Pustaka Saya", halaman /library) sudah memakai hook ini, sehingga fase 2
 * cukup mengganti isinya.
 *
 * TODO: phase-2 — ganti dengan sesi anggota sungguhan (mis. Supabase Auth) saat keanggotaan
 * dan pembelian digital dibangun.
 */
export interface MemberSession {
  isLoggedIn: boolean;
  displayName: string | null;
}

const GUEST_SESSION: MemberSession = { isLoggedIn: false, displayName: null };

export const useMemberSession = (): MemberSession => GUEST_SESSION;
