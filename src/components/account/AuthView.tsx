import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, KeyRound, LogIn, UserPlus } from 'lucide-react';
import {
  requestPasswordReset,
  signInWithPassword,
  signUpWithPassword,
  updatePassword,
  useMemberSession,
  type AuthErrorCode
} from '../../services/memberSession';
import { useAppLanguage } from '../../i18n/hooks';
import { withLanguagePrefix } from '../../utils/router';

export type AuthMode = 'login' | 'register' | 'reset' | 'update-password';

interface AuthViewProps {
  mode: AuthMode;
  /** Query mentah URL (tanpa '?'), mis. "next=%2Flibrary". */
  query: string;
  onChangeMode: (mode: AuthMode) => void;
  /** Pindah ke path internal (mis. nilai `next`). */
  onNavigatePath: (path: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Hanya path internal yang boleh menjadi tujuan setelah login (cegah open redirect). */
export const safeNextPath = (value: string | null | undefined, fallback: string): string =>
  value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : fallback;

/** Halaman /account/login, /register, /reset, /update-password (Supabase Auth, email + kata sandi). */
export const AuthView: React.FC<AuthViewProps> = ({ mode, query, onChangeMode, onNavigatePath }) => {
  const { t } = useTranslation('digital');
  const language = useAppLanguage();
  const member = useMemberSession();
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const nextPath = safeNextPath(params.get('next'), withLanguagePrefix('/library', language));
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<AuthErrorCode | null>(null);
  const [notice, setNotice] = useState<string | null>(params.get('confirmed') === '1' ? t('account.confirmed') : null);
  const [working, setWorking] = useState(false);

  // Sudah masuk: halaman login/daftar langsung meneruskan ke tujuan.
  useEffect(() => {
    if (member.isLoggedIn && (mode === 'login' || mode === 'register')) onNavigatePath(nextPath);
  }, [member.isLoggedIn, mode, nextPath, onNavigatePath]);

  useEffect(() => {
    setFieldError(null);
    setAuthError(null);
  }, [mode]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectFor = (path: string) => `${origin}${withLanguagePrefix(path, language)}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    setAuthError(null);
    if (mode === 'register' && fullName.trim().length < 2) return setFieldError(t('account.errors.fullName'));
    if (mode !== 'update-password' && !EMAIL_RE.test(email.trim())) return setFieldError(t('account.errors.email'));
    if ((mode === 'login' || mode === 'register' || mode === 'update-password') && password.length < (mode === 'login' ? 1 : 8)) {
      return setFieldError(t('account.errors.password'));
    }
    setWorking(true);
    try {
      if (mode === 'login') {
        const error = await signInWithPassword(email.trim(), password);
        if (error) setAuthError(error);
      } else if (mode === 'register') {
        const result = await signUpWithPassword({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          language,
          redirectTo: `${redirectFor('/account/login')}?confirmed=1`
        });
        if (result.error) setAuthError(result.error);
        else if (result.needsConfirmation) setNotice(t('account.registered', { email: email.trim() }));
      } else if (mode === 'reset') {
        const error = await requestPasswordReset(email.trim(), redirectFor('/account/update-password'));
        if (error && error !== 'unknown') setAuthError(error);
        else setNotice(t('account.resetSent', { email: email.trim() }));
      } else {
        const error = await updatePassword(password);
        if (error) setAuthError(error);
        else {
          setNotice(t('account.passwordUpdated'));
          setPassword('');
        }
      }
    } finally {
      setWorking(false);
    }
  };

  const titles: Record<AuthMode, { title: string; subtitle: string; submit: string; icon: React.ReactNode }> = {
    login: { title: t('account.loginTitle'), subtitle: t('account.loginSubtitle'), submit: t('account.submitLogin'), icon: <LogIn className="h-5 w-5" /> },
    register: { title: t('account.registerTitle'), subtitle: t('account.registerSubtitle'), submit: t('account.submitRegister'), icon: <UserPlus className="h-5 w-5" /> },
    reset: { title: t('account.resetTitle'), subtitle: t('account.resetSubtitle'), submit: t('account.submitReset'), icon: <KeyRound className="h-5 w-5" /> },
    'update-password': { title: t('account.updateTitle'), subtitle: t('account.updateSubtitle'), submit: t('account.submitUpdate'), icon: <KeyRound className="h-5 w-5" /> }
  };
  const view = titles[mode];
  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20';
  const labelClass = 'block text-xs font-semibold text-slate-700';
  const showForm = !(notice && (mode === 'register' || mode === 'reset'));
  const needsRecoverySession = mode === 'update-password' && !member.isLoading && !member.isLoggedIn && !notice;

  return (
    <div id={`account-${mode}`} className="max-w-md mx-auto px-4 sm:px-6 py-10 md:py-16 text-left">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2 text-gold-700">{view.icon}</div>
        <h1 className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">{view.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{view.subtitle}</p>

        {!member.isAvailable && (
          <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('account.unavailable')}</p>
        )}

        {notice && (
          <p role="status" className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 [overflow-wrap:anywhere]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </p>
        )}

        {needsRecoverySession ? (
          <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('account.needRecoverySession')}</p>
        ) : showForm && member.isAvailable && (
          <form noValidate onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="account-full-name" className={labelClass}>{t('account.fullName')}</label>
                <input id="account-full-name" type="text" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
                <p className="mt-1 text-[11px] text-slate-500">{t('account.fullNameHint')}</p>
              </div>
            )}
            {mode !== 'update-password' && (
              <div>
                <label htmlFor="account-email" className={labelClass}>{t('account.email')}</label>
                <input id="account-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </div>
            )}
            {mode !== 'reset' && (
              <div>
                <label htmlFor="account-password" className={labelClass}>{mode === 'update-password' ? t('account.newPassword') : t('account.password')}</label>
                <input
                  id="account-password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
                {mode !== 'login' && <p className="mt-1 text-[11px] text-slate-500">{t('account.passwordHint')}</p>}
              </div>
            )}

            {(fieldError || authError) && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
                {fieldError || t(`account.errors.${authError!}`)}
              </p>
            )}

            <button
              type="submit"
              id="account-submit"
              disabled={working}
              className="w-full rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-gold-600 disabled:cursor-wait disabled:opacity-70 cursor-pointer"
            >
              {working ? t('account.working') : view.submit}
            </button>
          </form>
        )}

        <div className="mt-6 flex flex-col gap-2 border-t border-slate-100 pt-4 text-xs">
          {mode === 'login' && (
            <>
              <button type="button" id="account-to-register" onClick={() => onChangeMode('register')} className="text-left font-semibold text-gold-700 hover:underline cursor-pointer">{t('account.toRegister')}</button>
              <button type="button" id="account-to-reset" onClick={() => onChangeMode('reset')} className="text-left text-slate-600 hover:underline cursor-pointer">{t('account.forgot')}</button>
            </>
          )}
          {mode === 'register' && (
            <button type="button" id="account-to-login" onClick={() => onChangeMode('login')} className="text-left font-semibold text-gold-700 hover:underline cursor-pointer">{t('account.toLogin')}</button>
          )}
          {(mode === 'reset' || mode === 'update-password') && (
            <button type="button" onClick={() => onChangeMode('login')} className="text-left font-semibold text-gold-700 hover:underline cursor-pointer">{t('account.backToLogin')}</button>
          )}
        </div>
      </div>
    </div>
  );
};
