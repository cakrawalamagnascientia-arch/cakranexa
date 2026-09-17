import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock, MonitorSmartphone, ShieldAlert } from 'lucide-react';
import type { AccessState } from '../../hooks/useAccessSession';
import { useFormatters } from '../../i18n/hooks';
import { goToContact, goToDigitalCheckout, goToLogin, goToMembership } from '../../services/digitalNavigation';

const ENDED_REASONS = ['takeover', 'reopened', 'expired', 'device_released', 'revoked', 'closed'] as const;
type EndedReason = typeof ENDED_REASONS[number];
const ERROR_CODES = ['network', 'rate_limited', 'product_not_found'] as const;
type KnownErrorCode = typeof ERROR_CODES[number];

const primaryButton = 'rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-gold-600 disabled:opacity-60 cursor-pointer';

const GateCard: React.FC<{ dark: boolean; icon: React.ReactNode; title: string; children?: React.ReactNode; id?: string }> = ({ dark, icon, title, children, id }) => (
  <div className="flex h-full items-center justify-center overflow-y-auto p-4">
    <div
      id={id}
      className={`w-full max-w-md rounded-2xl border p-6 text-left shadow-sm ${dark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}
    >
      <div className="text-gold-700">{icon}</div>
      <h2 className="mt-3 text-lg font-bold">{title}</h2>
      {children}
    </div>
  </div>
);

interface AccessGateProps {
  state: AccessState;
  productId: string;
  dark?: boolean;
  onTakeover: () => void;
  onRetry: () => void;
  onReleaseDevice: (deviceId: string) => Promise<string | null>;
  onExit: () => void;
}

/** Tampilan akses selain "aktif": masuk, ditolak (beli / keanggotaan / hubungi), batas perangkat, konflik, sesi berakhir. */
export const AccessGate: React.FC<AccessGateProps> = ({ state, productId, dark = false, onTakeover, onRetry, onReleaseDevice, onExit }) => {
  const { t } = useTranslation('digital');
  const { date } = useFormatters();
  const [releasing, setReleasing] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const muted = dark ? 'text-slate-300' : 'text-slate-600';
  const secondaryButton = `rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${dark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-50'}`;
  const backButton = (
    <button type="button" onClick={onExit} className={secondaryButton}>{t('access.backToLibrary')}</button>
  );
  const actions = (children: React.ReactNode) => <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{children}</div>;

  switch (state.status) {
    case 'idle':
    case 'starting':
    case 'active':
      return (
        <div className="flex h-full items-center justify-center gap-2 text-sm opacity-80" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          {t('access.starting')}
        </div>
      );

    case 'login':
      return (
        <GateCard id="access-login" dark={dark} icon={<Lock className="h-6 w-6" />} title={t('access.loginTitle')}>
          <p className={`mt-1 text-sm ${muted}`}>{t('access.loginDescription')}</p>
          {actions(
            <>
              <button type="button" onClick={() => goToLogin()} className={primaryButton}>{t('account.loginCta')}</button>
              <button type="button" onClick={() => goToLogin(undefined, 'register')} className={secondaryButton}>{t('account.registerCta')}</button>
            </>
          )}
        </GateCard>
      );

    case 'denied': {
      const { code, product } = state.denial;
      return (
        <GateCard id="access-denied" dark={dark} icon={<Lock className="h-6 w-6" />} title={t(`access.denied.${code}.title`)}>
          <p className={`mt-1 text-sm ${muted}`}>{t(`access.denied.${code}.description`)}</p>
          {actions(
            <>
              {code !== 'suspended' && product?.purchasable && (
                <button type="button" id="btn-access-buy" onClick={() => goToDigitalCheckout([productId])} className={primaryButton}>{t('access.buy')}</button>
              )}
              {code !== 'suspended' && (
                <button type="button" id="btn-access-membership" onClick={goToMembership} className={secondaryButton}>{t('access.viewMembership')}</button>
              )}
              {code === 'suspended' && (
                <button type="button" onClick={goToContact} className={primaryButton}>{t('access.contactUs')}</button>
              )}
              {backButton}
            </>
          )}
        </GateCard>
      );
    }

    case 'device_limit': {
      const { overview } = state;
      const cooldownText = overview.releaseAvailableAt ? t('access.deviceLimit.cooldown', { date: date(new Date(overview.releaseAvailableAt)) }) : null;
      const release = async (deviceId: string) => {
        setReleasing(deviceId);
        setReleaseError(null);
        const error = await onReleaseDevice(deviceId);
        setReleasing(null);
        if (error) setReleaseError(error);
      };
      return (
        <GateCard id="access-device-limit" dark={dark} icon={<MonitorSmartphone className="h-6 w-6" />} title={t('access.deviceLimit.title')}>
          <p className={`mt-1 text-sm ${muted}`}>{t('access.deviceLimit.description', { max: overview.maxDevices })}</p>
          <ul className={`mt-4 divide-y rounded-lg border text-sm ${dark ? 'divide-slate-800 border-slate-800' : 'divide-slate-100 border-slate-200'}`}>
            {overview.devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold [overflow-wrap:anywhere]">
                    {device.label}
                    {device.isCurrent && <span className="ml-2 text-xs font-normal text-gold-700">{t('access.deviceLimit.current')}</span>}
                  </p>
                  <p className={`text-xs ${muted}`}>{t('access.deviceLimit.lastSeen', { date: date(new Date(device.lastSeen)) })}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void release(device.id)}
                  disabled={Boolean(overview.releaseAvailableAt) || releasing !== null}
                  className={`${secondaryButton} shrink-0 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {releasing === device.id ? t('access.deviceLimit.releasing') : t('access.deviceLimit.release')}
                </button>
              </li>
            ))}
          </ul>
          <p className={`mt-3 text-xs ${muted}`}>{cooldownText ?? t('access.deviceLimit.cooldownNote', { days: overview.cooldownDays })}</p>
          {releaseError && (
            <p role="alert" className="mt-2 text-xs text-rose-600">
              {releaseError === 'release_cooldown' ? t('access.deviceLimit.cooldownNote', { days: overview.cooldownDays }) : t('access.error.generic')}
            </p>
          )}
          {actions(backButton)}
        </GateCard>
      );
    }

    case 'conflict':
      return (
        <GateCard id="access-conflict" dark={dark} icon={<MonitorSmartphone className="h-6 w-6" />} title={t('access.conflict.title')}>
          <p className={`mt-1 text-sm ${muted}`}>
            {t('access.conflict.description', { device: state.deviceLabel || t('access.conflict.unknownDevice') })}
          </p>
          {actions(
            <>
              <button type="button" id="btn-access-takeover" onClick={onTakeover} className={primaryButton}>{t('access.conflict.takeover')}</button>
              <button type="button" onClick={onExit} className={secondaryButton}>{t('access.conflict.cancel')}</button>
            </>
          )}
        </GateCard>
      );

    case 'ended': {
      const reason = ENDED_REASONS.includes(state.reason as EndedReason) ? (state.reason as EndedReason) : null;
      return (
        <GateCard id="access-ended" dark={dark} icon={<ShieldAlert className="h-6 w-6" />} title={t('access.ended.title')}>
          <p className={`mt-1 text-sm ${muted}`}>{reason ? t(`access.ended.${reason}`) : t('access.ended.default')}</p>
          {actions(
            <>
              {reason !== 'revoked' && (
                <button type="button" id="btn-access-resume" onClick={onTakeover} className={primaryButton}>{t('access.ended.resume')}</button>
              )}
              {reason === 'revoked' && (
                <button type="button" onClick={onRetry} className={primaryButton}>{t('access.error.retry')}</button>
              )}
              {backButton}
            </>
          )}
        </GateCard>
      );
    }

    case 'error':
    default: {
      const code = state.status === 'error' && ERROR_CODES.includes(state.code as KnownErrorCode) ? (state.code as KnownErrorCode) : null;
      return (
        <GateCard id="access-error" dark={dark} icon={<ShieldAlert className="h-6 w-6" />} title={t('access.error.title')}>
          <p className={`mt-1 text-sm ${muted}`}>{code ? t(`access.error.${code}`) : t('access.error.generic')}</p>
          {actions(
            <>
              <button type="button" onClick={onRetry} className={primaryButton}>{t('access.error.retry')}</button>
              {backButton}
            </>
          )}
        </GateCard>
      );
    }
  }
};

interface LegalNoticeDialogProps {
  name: string;
  email: string;
  dark?: boolean;
  onAccept: () => Promise<void>;
  onCancel: () => void;
}

/** Ketentuan penggunaan yang wajib disetujui sebelum konten pertama kali ditampilkan (sekali per produk). */
export const LegalNoticeDialog: React.FC<LegalNoticeDialogProps> = ({ name, email, dark = false, onAccept, onCancel }) => {
  const { t } = useTranslation('digital');
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const accept = async () => {
    setWorking(true);
    setFailed(false);
    try {
      await onAccept();
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  };
  return (
    <GateCard id="access-legal-notice" dark={dark} icon={<ShieldAlert className="h-6 w-6" />} title={t('access.legal.title')}>
      <p className={`mt-2 text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{t('access.legal.body', { name, email })}</p>
      {failed && <p role="alert" className="mt-2 text-xs text-rose-600">{t('access.legal.failed')}</p>}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button type="button" id="btn-legal-accept" onClick={() => void accept()} disabled={working} className={primaryButton}>
          {working ? t('access.legal.working') : t('access.legal.accept')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-lg border px-4 py-2.5 text-sm font-semibold cursor-pointer ${dark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-50'}`}
        >
          {t('access.legal.cancel')}
        </button>
      </div>
    </GateCard>
  );
};
