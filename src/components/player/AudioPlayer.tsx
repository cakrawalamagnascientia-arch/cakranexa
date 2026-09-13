import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Timer, Volume2, VolumeX } from 'lucide-react';

/**
 * Pemutar audio untuk audiobook berbayar (HLS AES-128 lewat hls.js, fallback HLS native Safari) dan sampel
 * (file MP3 publik). Kontrol sendiri tanpa atribut `controls` sehingga tidak ada tombol unduh bawaan browser
 * (friksi, bukan keamanan: perlindungan ada di server — token per sesi & segmen terenkripsi).
 */

export type AudioSource = { kind: 'hls'; url: string } | { kind: 'file'; url: string };

export interface AudioChapter {
  number: number;
  title: string;
  start: number;
}

export interface ListenInterval {
  from: number;
  to: number;
  wallMs: number;
}

interface AudioPlayerProps {
  source: AudioSource;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  chapters?: AudioChapter[];
  /** Durasi cadangan sebelum metadata media termuat. */
  duration?: number | null;
  initialPosition?: number;
  compact?: boolean;
  keyboard?: boolean;
  audioId?: string;
  onPositionSave?: (seconds: number) => void;
  onListenInterval?: (interval: ListenInterval) => void;
  /** Sumber ditolak server (mis. token kedaluwarsa atau sesi berakhir); status null = tidak diketahui (Safari). */
  onSourceError?: (info: { status: number | null }) => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP_MINUTES = [15, 30, 45, 60];
const REWIND_SECONDS = 15;
const FORWARD_SECONDS = 30;
const MIN_INTERVAL_MS = 5000;

export const formatTime = (value: number): string => {
  const total = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  source,
  title,
  subtitle,
  coverUrl,
  chapters = [],
  duration: fallbackDuration,
  initialPosition = 0,
  compact = false,
  keyboard = false,
  audioId,
  onPositionSave,
  onListenInterval,
  onSourceError
}) => {
  const { t } = useTranslation('digital');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialPosition);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<'stream' | 'unsupported' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [sleep, setSleep] = useState<'off' | 'chapter' | number>('off');
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const [sleepChapterEnd, setSleepChapterEnd] = useState<number | null>(null);

  const callbacks = useRef({ onPositionSave, onListenInterval, onSourceError });
  callbacks.current = { onPositionSave, onListenInterval, onSourceError };
  const startedRef = useRef(false);
  const resumeRef = useRef<{ time: number; play: boolean } | null>(null);
  const intervalRef = useRef<{ from: number; wall: number } | null>(null);
  const lastTimeRef = useRef(initialPosition);
  const positionStateAt = useRef(0);

  const duration = mediaDuration || fallbackDuration || 0;

  // --- Interval dengar (verified listening): dibuka saat memutar, ditutup saat jeda/seek/flush.
  const closeInterval = useCallback(() => {
    const open = intervalRef.current;
    intervalRef.current = null;
    if (!open) return;
    const to = lastTimeRef.current;
    const wallMs = Date.now() - open.wall;
    if (to > open.from && wallMs >= MIN_INTERVAL_MS) callbacks.current.onListenInterval?.({ from: open.from, to, wallMs });
  }, []);
  const openInterval = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) intervalRef.current = { from: audio.currentTime, wall: Date.now() };
  }, []);

  // --- Sumber media: HLS (hls.js / native) atau file biasa. Dipasang ulang saat URL berganti (token diperbarui).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    setError(null);
    setBuffering(true);

    const applyResume = () => {
      const resume = resumeRef.current ?? (!startedRef.current && initialPosition > 0 ? { time: initialPosition, play: false } : null);
      startedRef.current = true;
      resumeRef.current = null;
      if (resume) {
        if (resume.time > 0) audio.currentTime = resume.time;
        if (resume.play) void audio.play().catch(() => undefined);
      }
    };
    const onMediaError = () => {
      if (cancelled) return;
      if (source.kind === 'hls' && !hls) callbacks.current.onSourceError?.({ status: null });
      else if (source.kind === 'file') setError('stream');
    };
    audio.addEventListener('loadedmetadata', applyResume, { once: true });
    audio.addEventListener('error', onMediaError);

    if (source.kind === 'file') {
      audio.src = source.url;
    } else {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (cancelled) return;
          if (Hls.isSupported()) {
            const instance = new Hls({ maxBufferLength: 30, enableWorker: true });
            hls = instance;
            instance.on(Hls.Events.ERROR, (_event, data) => {
              if (!data.fatal) return;
              const status = typeof data.response?.code === 'number' ? data.response.code : null;
              if (status !== null && status >= 400 && status < 500) {
                callbacks.current.onSourceError?.({ status });
              } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                instance.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                instance.recoverMediaError();
              } else {
                setError('stream');
              }
            });
            instance.loadSource(source.url);
            instance.attachMedia(audio);
          } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
            audio.src = source.url;
          } else {
            setError('unsupported');
          }
        })
        .catch(() => {
          if (!cancelled) setError('stream');
        });
    }

    return () => {
      cancelled = true;
      audio.removeEventListener('loadedmetadata', applyResume);
      audio.removeEventListener('error', onMediaError);
      // Sumber berikutnya (token baru) melanjutkan dari posisi yang sama.
      resumeRef.current = { time: audio.currentTime, play: !audio.paused };
      audio.pause();
      hls?.destroy();
      audio.removeAttribute('src');
      audio.load();
    };
    // initialPosition hanya dipakai sekali saat pertama dimuat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.kind, source.url, reloadKey]);

  // --- Event elemen audio.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onTime = () => {
      if (!audio.seeking) lastTimeRef.current = audio.currentTime;
      setCurrentTime(audio.currentTime);
      if ('mediaSession' in navigator && Date.now() - positionStateAt.current > 5000 && Number.isFinite(audio.duration) && audio.duration > 0) {
        positionStateAt.current = Date.now();
        try {
          navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) });
        } catch {
          // abaikan
        }
      }
    };
    const onDuration = () => {
      if (Number.isFinite(audio.duration)) setMediaDuration(audio.duration);
    };
    const onPlay = () => {
      setPlaying(true);
      openInterval();
    };
    const onPause = () => {
      setPlaying(false);
      closeInterval();
      if (audio.currentTime > 0) callbacks.current.onPositionSave?.(audio.currentTime);
    };
    const onWaiting = () => setBuffering(true);
    const onReady = () => setBuffering(false);
    const onSeeking = () => closeInterval();
    const onSeeked = () => {
      lastTimeRef.current = audio.currentTime;
      openInterval();
    };
    const onRate = () => setRate(audio.playbackRate);
    const onVolume = () => setMuted(audio.muted);
    const listeners: Array<[string, () => void]> = [
      ['timeupdate', onTime], ['durationchange', onDuration], ['loadedmetadata', onDuration], ['play', onPlay], ['pause', onPause],
      ['ended', onPause], ['waiting', onWaiting], ['playing', onReady], ['canplay', onReady], ['seeking', onSeeking],
      ['seeked', onSeeked], ['ratechange', onRate], ['volumechange', onVolume]
    ];
    listeners.forEach(([name, handler]) => audio.addEventListener(name, handler));
    return () => listeners.forEach(([name, handler]) => audio.removeEventListener(name, handler));
  }, [openInterval, closeInterval]);

  // --- Simpan posisi tiap 15 dtk dan kirim interval dengar tiap 30 dtk selama memutar.
  useEffect(() => {
    if (!playing) return undefined;
    let ticks = 0;
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      ticks += 1;
      callbacks.current.onPositionSave?.(audio.currentTime);
      if (ticks % 2 === 0) {
        closeInterval();
        openInterval();
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [playing, openInterval, closeInterval]);

  // Tutup interval terbuka saat komponen dilepas.
  useEffect(() => () => closeInterval(), [closeInterval]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    audio.currentTime = Math.min(Math.max(0, seconds), Math.max(0, max - 0.25));
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const skip = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (audio) seekTo(audio.currentTime + delta);
  }, [seekTo]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, []);

  const chapterIndexAt = useCallback((seconds: number) => {
    let index = -1;
    chapters.forEach((chapter, i) => {
      if (seconds + 0.5 >= chapter.start) index = i;
    });
    return index;
  }, [chapters]);

  const jumpChapter = useCallback((direction: -1 | 1) => {
    const audio = audioRef.current;
    if (!audio || chapters.length === 0) return;
    const index = Math.max(0, chapterIndexAt(audio.currentTime));
    if (direction < 0 && audio.currentTime - chapters[index].start > 3) {
      seekTo(chapters[index].start);
      return;
    }
    const target = Math.min(chapters.length - 1, Math.max(0, index + direction));
    seekTo(chapters[target].start);
  }, [chapters, chapterIndexAt, seekTo]);

  // --- Timer tidur.
  useEffect(() => {
    if (typeof sleep !== 'number') {
      setSleepAt(null);
      return undefined;
    }
    const ms = sleep * 60_000;
    setSleepAt(Date.now() + ms);
    const timer = window.setTimeout(() => {
      audioRef.current?.pause();
      setSleep('off');
    }, ms);
    return () => window.clearTimeout(timer);
  }, [sleep]);

  useEffect(() => {
    if (sleep !== 'chapter') {
      setSleepChapterEnd(null);
      return;
    }
    const audio = audioRef.current;
    const index = chapterIndexAt(audio?.currentTime ?? 0);
    setSleepChapterEnd(index >= 0 && index + 1 < chapters.length ? chapters[index + 1].start : duration || null);
    // Batas bab dihitung sekali saat timer dipilih.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleep]);

  useEffect(() => {
    if (sleep === 'chapter' && sleepChapterEnd !== null && currentTime >= sleepChapterEnd - 0.3) {
      audioRef.current?.pause();
      setSleep('off');
    }
  }, [sleep, sleepChapterEnd, currentTime]);

  // --- Media Session (layar kunci / kontrol media sistem).
  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined;
    const session = navigator.mediaSession;
    try {
      session.metadata = new MediaMetadata({
        title,
        artist: subtitle ?? '',
        album: 'CakraNexa',
        artwork: coverUrl ? [{ src: new URL(coverUrl, window.location.href).href, sizes: '512x512' }] : []
      });
    } catch {
      // abaikan
    }
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ['play', () => void audioRef.current?.play()],
      ['pause', () => audioRef.current?.pause()],
      ['seekbackward', (details) => skip(-(details.seekOffset || REWIND_SECONDS))],
      ['seekforward', (details) => skip(details.seekOffset || FORWARD_SECONDS)],
      ['seekto', (details) => {
        if (details.seekTime !== undefined) seekTo(details.seekTime);
      }],
      ['previoustrack', chapters.length > 1 ? () => jumpChapter(-1) : null],
      ['nexttrack', chapters.length > 1 ? () => jumpChapter(1) : null]
    ];
    handlers.forEach(([action, handler]) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // aksi tidak didukung browser ini
      }
    });
    return () => {
      handlers.forEach(([action]) => {
        try {
          session.setActionHandler(action, null);
        } catch {
          // abaikan
        }
      });
      session.metadata = null;
    };
  }, [title, subtitle, coverUrl, chapters, skip, seekTo, jumpChapter]);

  // --- Pintasan keyboard (hanya pemutar layar penuh).
  useEffect(() => {
    if (!keyboard) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable)) return;
      if (event.key === ' ' || event.key === 'k') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        skip(-REWIND_SECONDS);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        skip(FORWARD_SECONDS);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, togglePlay, skip]);

  const commitSeek = () => {
    if (seekDraft !== null) seekTo(seekDraft);
    setSeekDraft(null);
  };

  const shownTime = seekDraft ?? currentTime;
  const currentChapter = chapterIndexAt(currentTime);
  const iconButton = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer';
  const selectClass = 'rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100';
  const sleepRemaining = sleepAt ? Math.max(0, (sleepAt - Date.now()) / 1000) : null;

  return (
    <div
      className={`text-white ${compact ? '' : 'rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6'}`}
      onContextMenu={(event) => event.preventDefault()}
    >
      <audio ref={audioRef} id={audioId} preload="metadata" className="hidden" />

      {error ? (
        <div role="alert" className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">
          <p>{error === 'unsupported' ? t('player.unsupported') : t('player.streamError')}</p>
          {error === 'stream' && (
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 cursor-pointer">
              {t('player.retry')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(duration))}
              step={1}
              value={Math.min(Math.floor(shownTime), Math.max(1, Math.floor(duration)))}
              onChange={(event) => setSeekDraft(Number(event.target.value))}
              onPointerUp={commitSeek}
              onKeyUp={commitSeek}
              onBlur={commitSeek}
              aria-label={t('player.seek')}
              aria-valuetext={`${formatTime(shownTime)} / ${formatTime(duration)}`}
              className="w-full cursor-pointer accent-[#D4AF37]"
            />
            <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400">
              <span>{formatTime(shownTime)}</span>
              <span>{duration > 0 ? `-${formatTime(duration - shownTime)}` : '--:--'}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-1 sm:gap-3">
            {chapters.length > 1 && (
              <button type="button" onClick={() => jumpChapter(-1)} className={iconButton} aria-label={t('player.prevChapter')} title={t('player.prevChapter')}>
                <SkipBack className="h-5 w-5" />
              </button>
            )}
            <button type="button" onClick={() => skip(-REWIND_SECONDS)} className={iconButton} aria-label={t('player.rewind')} title={t('player.rewind')}>
              <RotateCcw className="h-5 w-5" />
            </button>
            <button
              type="button"
              id={audioId ? `${audioId}-toggle` : undefined}
              onClick={togglePlay}
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-slate-950 shadow-lg transition-colors hover:bg-[#c5a059] cursor-pointer"
              aria-label={playing ? t('player.pause') : t('player.play')}
              title={playing ? t('player.pause') : t('player.play')}
            >
              {buffering && playing ? <Loader2 className="h-6 w-6 animate-spin" /> : playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
            </button>
            <button type="button" onClick={() => skip(FORWARD_SECONDS)} className={iconButton} aria-label={t('player.forward')} title={t('player.forward')}>
              <RotateCw className="h-5 w-5" />
            </button>
            {chapters.length > 1 && (
              <button type="button" onClick={() => jumpChapter(1)} className={iconButton} aria-label={t('player.nextChapter')} title={t('player.nextChapter')}>
                <SkipForward className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-slate-300">
              {t('player.speed')}
              <select
                value={rate}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (audioRef.current) audioRef.current.playbackRate = next;
                  setRate(next);
                }}
                className={selectClass}
              >
                {SPEEDS.map((speed) => <option key={speed} value={speed}>{t('player.speedValue', { rate: speed })}</option>)}
              </select>
            </label>
            {!compact && (
              <label className="flex items-center gap-1.5 text-slate-300">
                <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                {t('player.sleep')}
                <select
                  value={String(sleep)}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSleep(value === 'off' || value === 'chapter' ? value : Number(value));
                  }}
                  className={selectClass}
                >
                  <option value="off">{t('player.sleepOff')}</option>
                  {SLEEP_MINUTES.map((minutes) => <option key={minutes} value={minutes}>{t('player.sleepMinutes', { minutes })}</option>)}
                  {chapters.length > 0 && <option value="chapter">{t('player.sleepChapter')}</option>}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => {
                if (audioRef.current) audioRef.current.muted = !audioRef.current.muted;
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 cursor-pointer"
              aria-label={muted ? t('player.unmute') : t('player.mute')}
              title={muted ? t('player.unmute') : t('player.mute')}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
          {sleepRemaining !== null && playing && (
            <p className="mt-2 text-center text-[11px] text-slate-400">{t('player.sleepRemaining', { time: formatTime(sleepRemaining) })}</p>
          )}

          {!compact && (
            <div className="mt-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#DFBF64]">{t('player.chapters')}</h2>
              {chapters.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">{t('player.noChapters')}</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/5 rounded-lg border border-white/10">
                  {chapters.map((chapter, index) => (
                    <li key={chapter.number}>
                      <button
                        type="button"
                        onClick={() => seekTo(chapter.start)}
                        aria-current={index === currentChapter ? 'true' : undefined}
                        className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition-colors cursor-pointer ${index === currentChapter ? 'bg-[#D4AF37]/15 text-[#DFBF64]' : 'text-slate-200 hover:bg-white/5'}`}
                      >
                        <span className="min-w-0 [overflow-wrap:anywhere]">{chapter.title}</span>
                        <span className="shrink-0 font-mono text-[11px] text-slate-400">{formatTime(chapter.start)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
