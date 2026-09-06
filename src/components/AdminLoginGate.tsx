import React, { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Loader2, AlertTriangle, ArrowLeft, ServerOff } from 'lucide-react';
import { apiClient, ApiError } from '../services/apiClient';
import { getAdminToken, setAdminToken, clearAdminToken } from '../services/adminAuth';

interface AdminLoginGateProps {
  children: React.ReactNode;
  onBackHome: () => void;
}

/**
 * Gerbang autentikasi Portal Admin.
 * - Password diverifikasi oleh server (POST /api/admin/login, env ADMIN_PASSWORD).
 * - Token sesi (12 jam) disimpan di sessionStorage & disertakan otomatis oleh apiClient.
 * - Jika backend tidak terjangkau, akses ditolak (tidak ada bypass di production).
 *   Di mode dev (vite) tanpa backend, tersedia mode "Preview Lokal" read-only-ish dengan peringatan.
 */
export const AdminLoginGate: React.FC<AdminLoginGateProps> = ({ children, onBackHome }) => {
  const [status, setStatus] = useState<'checking' | 'login' | 'authenticated' | 'preview'>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const isDev = Boolean((import.meta as any).env?.DEV);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const health = await apiClient.health();
      if (!mounted) return;
      setBackendReachable(Boolean(health));
      if (getAdminToken()) {
        const ok = await apiClient.adminVerify();
        if (!mounted) return;
        if (ok) {
          setStatus('authenticated');
          return;
        }
      }
      setStatus('login');
    })();

    const onAuthChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.authenticated === false) setStatus('login');
    };
    window.addEventListener('cakranexa_admin_auth_changed', onAuthChanged);
    return () => {
      mounted = false;
      window.removeEventListener('cakranexa_admin_auth_changed', onAuthChanged);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('Masukkan password admin.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { token, expiresAt } = await apiClient.adminLogin(password);
      setAdminToken(token, expiresAt);
      setPassword('');
      setStatus('authenticated');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setBackendReachable(false);
        setError('Server backend tidak dapat dihubungi. Pastikan API berjalan (VITE_API_BASE_URL) lalu coba lagi.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await apiClient.adminLogout();
    clearAdminToken();
    setStatus('login');
  };

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F172A] text-slate-300">
        <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37] mr-3" />
        <span className="text-sm font-medium">Memverifikasi sesi admin…</span>
      </div>
    );
  }

  if (status === 'authenticated' || status === 'preview') {
    return (
      <div className="relative">
        {status === 'preview' && (
          <div className="bg-amber-500 text-[#0F172A] text-xs font-bold text-center py-1.5 px-4">
            MODE PREVIEW LOKAL (DEV) — Backend tidak terhubung. Perubahan hanya tersimpan di browser ini dan tidak
            tersinkron ke database.
          </div>
        )}
        <button
          onClick={handleLogout}
          className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/90 text-slate-200 text-xs font-semibold border border-slate-700 hover:border-[#D4AF37] hover:text-[#D4AF37] shadow-xl"
          title="Keluar dari Portal Admin"
        >
          <Lock className="w-3.5 h-3.5" />
          Keluar Admin
        </button>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <button
          onClick={onBackHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-[#D4AF37] mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Beranda
        </button>

        <div className="bg-[#1E293B] border border-slate-700 rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">Portal Admin CakraNexa</h1>
              <p className="text-slate-400 text-xs">PT Cakrawala Magna Scientia — akses terbatas</p>
            </div>
          </div>

          {backendReachable === false && (
            <div className="mb-4 flex items-start gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <ServerOff className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Backend API tidak terjangkau. Login memerlukan server Express aktif dengan variabel{' '}
                <code className="font-mono">ADMIN_PASSWORD</code>.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password Admin
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-[#0F172A] border border-slate-600 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/30 text-white px-3.5 py-2.5 text-sm outline-none"
                placeholder="••••••••••"
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#DFBF64] to-[#C5A059] text-[#0F172A] font-bold text-sm py-2.5 hover:brightness-110 disabled:opacity-60 transition-all"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Masuk ke Dashboard
            </button>
          </form>

          {isDev && backendReachable === false && (
            <button
              type="button"
              onClick={() => setStatus('preview')}
              className="mt-4 w-full text-[11px] text-slate-400 hover:text-amber-300 underline underline-offset-2"
            >
              Lanjutkan dalam mode Preview Lokal (hanya tersedia saat development)
            </button>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-500 mt-6">
          Sesi berlaku 12 jam dan berakhir saat tab ditutup. Aktivitas login dibatasi 10 percobaan / 15 menit.
        </p>
      </div>
    </div>
  );
};
