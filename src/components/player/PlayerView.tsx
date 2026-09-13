import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Headphones } from 'lucide-react';
import { useMemberSession } from '../../services/memberSession';
import { useAccessSession, type AccessState } from '../../hooks/useAccessSession';
import { DigitalApiError } from '../../services/digitalApi';
import { apiUrl } from '../../services/apiClient';
import { acceptLegalNotice } from '../../services/readerApi';
import {
  getPlayerMeta,
  refreshPlayerStream,
  savePlayerProgress,
  sendListeningEvents,
  type PlayerMeta,
  type PlayerStream
} from '../../services/playerApi';
import { resolveImageUrl } from '../../utils/imageUtils';
import { AccessGate, LegalNoticeDialog } from '../reader/AccessGate';
import { useImmersivePage } from '../reader/immersive';
import { AudioPlayer, type ListenInterval } from './AudioPlayer';

/** Token media diperbarui 10 menit sebelum kedaluwarsa (berlaku 2 jam). */
const REFRESH_BEFORE_MS = 10 * 60_000;

interface PlayerViewProps {
  productId: string;
  onExit: () => void;
}

/**
 * /library/listen/<id-produk>: pemutar audiobook terlindungi. Sesi tunggal + heartbeat (sama dengan reader),
 * playlist HLS bertoken yang diperbarui otomatis, progres per detik, dan verified listening.
 */
export const PlayerView: React.FC<PlayerViewProps> = ({ productId, onExit }) => {
  const { t } = useTranslation('digital');
  const member = useMemberSession();
  useImmersivePage();
  const access = useAccessSession(productId, member.isLoggedIn);
  const { reportError } = access;
  const token = access.state.status === 'active' ? access.state.session.sessionToken : null;
  const gateState: AccessState = !member.isLoading && !member.isLoggedIn ? { status: 'login' } : access.state;

  const [meta, setMeta] = useState<PlayerMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [stream, setStream] = useState<PlayerStream | null>(null);
  const [streamFailed, setStreamFailed] = useState(false);
  const initialPosition = useRef<number | null>(null);
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    setMetaError(null);
    getPlayerMeta(productId, token)
      .then((next) => {
        if (cancelled) return;
        if (initialPosition.current === null) initialPosition.current = next.progress?.position ?? 0;
        setMeta(next);
        setStream(next.stream);
        setStreamFailed(false);
        setLegalAccepted(next.legalNoticeAccepted);
      })
      .catch((err) => {
        if (!cancelled && !reportError(err)) setMetaError(err instanceof DigitalApiError ? err.code : 'unknown');
      });
    return () => {
      cancelled = true;
    };
  }, [productId, token, reportError]);

  const refreshStream = useCallback(async () => {
    if (!token) return;
    lastRefresh.current = Date.now();
    try {
      setStream(await refreshPlayerStream(productId, token));
      setStreamFailed(false);
    } catch (err) {
      if (!reportError(err)) setStreamFailed(true);
    }
  }, [productId, token, reportError]);

  // Perbarui token media sebelum kedaluwarsa (pemutaran berlanjut dari posisi yang sama).
  useEffect(() => {
    if (!stream) return undefined;
    const delay = Math.max(30_000, Date.parse(stream.expiresAt) - Date.now() - REFRESH_BEFORE_MS);
    const timer = window.setTimeout(() => void refreshStream(), delay);
    return () => window.clearTimeout(timer);
  }, [stream, refreshStream]);

  // Sumber ditolak: coba perbarui token sekali; bila sesi sudah berakhir, /stream memunculkan layar akses.
  const onSourceError = useCallback(() => {
    if (Date.now() - lastRefresh.current < 20_000) {
      setStreamFailed(true);
      return;
    }
    void refreshStream();
  }, [refreshStream]);

  const onPositionSave = useCallback((seconds: number) => {
    if (token) savePlayerProgress(productId, token, Math.round(seconds)).catch(() => undefined);
  }, [productId, token]);

  const onListenInterval = useCallback((interval: ListenInterval) => {
    if (token) sendListeningEvents(productId, token, [interval]).catch(() => undefined);
  }, [productId, token]);

  const acceptNotice = async () => {
    try {
      await acceptLegalNotice(productId);
      setLegalAccepted(true);
    } catch (err) {
      if (!reportError(err)) throw err;
    }
  };

  let content: React.ReactNode;
  if (gateState.status !== 'active') {
    content = (
      <AccessGate
        state={gateState}
        productId={productId}
        dark
        onTakeover={() => void access.takeover()}
        onRetry={() => void access.start()}
        onReleaseDevice={access.releaseDevice}
        onExit={onExit}
      />
    );
  } else if (metaError) {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-sm">
        <p role="alert">
          {metaError === 'not_ready' ? t('player.notReady') : metaError === 'wrong_format' ? t('player.wrongFormat') : t('access.error.generic')}
        </p>
        <button type="button" onClick={onExit} className="rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-bold text-slate-950 cursor-pointer">{t('access.backToLibrary')}</button>
      </div>
    );
  } else if (!meta) {
    content = <div className="flex h-full items-center justify-center text-sm opacity-80" role="status">{t('player.loading')}</div>;
  } else if (!legalAccepted) {
    content = <LegalNoticeDialog name={meta.watermark.name} email={meta.watermark.email} dark onAccept={acceptNotice} onCancel={onExit} />;
  } else {
    const cover = meta.coverUrl ? resolveImageUrl(meta.coverUrl, 'book', meta.product.bookId) : '';
    content = (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:text-left">
            {cover ? (
              <img src={cover} alt="" draggable={false} className="h-48 w-36 shrink-0 rounded-lg object-cover shadow-2xl" />
            ) : (
              <div className="flex h-48 w-36 shrink-0 items-center justify-center rounded-lg bg-slate-800"><Headphones className="h-10 w-10 text-[#DFBF64]" /></div>
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#DFBF64]">Audiobook</p>
              <h1 className="mt-1 text-xl font-bold [overflow-wrap:anywhere] sm:text-2xl">{meta.title}</h1>
              <p className="text-sm text-slate-300">{meta.author}</p>
              <p className="mt-2 text-[11px] text-slate-500">{t('player.licensedTo', { name: meta.watermark.name, email: meta.watermark.email })}</p>
            </div>
          </div>
          {streamFailed ? (
            <div role="alert" className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
              <p>{t('player.streamError')}</p>
              <button type="button" onClick={() => void refreshStream()} className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 cursor-pointer">
                {t('player.retry')}
              </button>
            </div>
          ) : stream && (
            <AudioPlayer
              source={{ kind: 'hls', url: apiUrl(stream.playlistUrl) }}
              title={meta.title}
              subtitle={meta.author}
              coverUrl={cover || undefined}
              chapters={meta.chapters}
              duration={meta.product.durationSeconds}
              initialPosition={initialPosition.current ?? 0}
              keyboard
              audioId="player-audio"
              onPositionSave={onPositionSave}
              onListenInterval={onListenInterval}
              onSourceError={onSourceError}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      id="player-root"
      className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-slate-100"
      onContextMenu={(event) => event.preventDefault()}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <header className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-2 py-1.5 sm:px-3">
        <button
          type="button"
          id="btn-player-exit"
          onClick={onExit}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-800 cursor-pointer"
          aria-label={t('player.back')}
          title={t('player.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{meta?.title || t('player.loading')}</p>
      </header>
      <main className="min-h-0 flex-1">{content}</main>
    </div>
  );
};
