import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  List,
  Maximize2,
  Moon,
  PanelRight,
  Search,
  StickyNote,
  Sun,
  Trash2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useMemberSession } from '../../services/memberSession';
import { useAccessSession, type AccessState } from '../../hooks/useAccessSession';
import { DigitalApiError } from '../../services/digitalApi';
import {
  acceptLegalNotice,
  createReaderNote,
  deleteReaderNote,
  fetchReaderPage,
  getReaderMeta,
  listReaderNotes,
  saveReaderProgress,
  searchReader,
  sendReadingEvents,
  updateReaderNote,
  type NoteColor,
  type NoteRect,
  type ReaderMeta,
  type ReaderNote,
  type ReaderSearchResult
} from '../../services/readerApi';
import { AccessGate, LegalNoticeDialog } from './AccessGate';
import { PageViewer, rectStyle, type PageViewerLabels } from './PageViewer';
import { readReaderPrefs, useImmersivePage, useMediaQuery, writeReaderPrefs, type ReaderPrefs } from './immersive';

const NOTE_COLORS: NoteColor[] = ['yellow', 'green', 'blue', 'pink'];
const HIGHLIGHT_CLASS: Record<NoteColor, string> = {
  yellow: 'bg-yellow-300/50',
  green: 'bg-green-300/50',
  blue: 'bg-sky-300/50',
  pink: 'bg-pink-300/50'
};
const SWATCH_CLASS: Record<NoteColor, string> = {
  yellow: 'bg-yellow-300',
  green: 'bg-green-300',
  blue: 'bg-sky-300',
  pink: 'bg-pink-300'
};
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const EVENT_FLUSH_MS = 30_000;
const MIN_DWELL_MS = 2000;
const MAX_DWELL_MS = 5 * 60_000;
type SidebarTab = 'contents' | 'search' | 'notes';

interface NoteDialogProps {
  title: string;
  initialColor: NoteColor;
  initialText: string;
  dark: boolean;
  error: boolean;
  onSave: (color: NoteColor, text: string) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

const NoteDialog: React.FC<NoteDialogProps> = ({ title, initialColor, initialText, dark, error, onSave, onDelete, onCancel }) => {
  const { t } = useTranslation('digital');
  const [color, setColor] = useState(initialColor);
  const [text, setText] = useState(initialText);
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full max-w-sm rounded-2xl p-4 shadow-xl ${dark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}`}>
        <h2 className="text-sm font-bold">{title}</h2>
        <div className="mt-3 flex gap-3" role="radiogroup" aria-label={t('reader.color')}>
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={t(`reader.colors.${c}`)}
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full cursor-pointer ${SWATCH_CLASS[c]} ${color === c ? 'ring-2 ring-gold-500 ring-offset-2' : ''}`}
            />
          ))}
        </div>
        <label className="mt-3 block text-xs font-semibold">
          {t('reader.noteText')}
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={t('reader.notePlaceholder')}
            style={{ userSelect: 'text' }}
            className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-sm font-normal ${dark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-white'}`}
          />
        </label>
        {error && <p role="alert" className="mt-2 text-xs text-rose-500">{t('reader.noteError')}</p>}
        <div className="mt-4 flex items-center justify-between gap-2">
          {onDelete ? (
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:underline cursor-pointer">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('reader.deleteNote')}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-semibold hover:underline cursor-pointer">{t('reader.cancel')}</button>
            <button type="button" onClick={() => onSave(color, text)} className="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-gold-600 cursor-pointer">
              {t('reader.saveNote')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ReaderViewProps {
  productId: string;
  onExit: () => void;
}

/**
 * /library/read/<id-produk>: reader e-book terlindungi. Halaman ber-watermark dari server digambar ke canvas;
 * sesi tunggal dengan heartbeat; progres, sorotan/catatan, pencarian, dan verified reading (reading_events).
 */
export const ReaderView: React.FC<ReaderViewProps> = ({ productId, onExit }) => {
  const { t } = useTranslation('digital');
  const member = useMemberSession();
  useImmersivePage();
  const access = useAccessSession(productId, member.isLoggedIn);
  const { reportError } = access;
  const token = access.state.status === 'active' ? access.state.session.sessionToken : null;
  const gateState: AccessState = !member.isLoading && !member.isLoggedIn ? { status: 'login' } : access.state;

  const [meta, setMeta] = useState<ReaderMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [prefs, setPrefs] = useState<ReaderPrefs>(readReaderPrefs);
  const [sidebar, setSidebar] = useState<SidebarTab | null>(null);
  const [highlightMode, setHighlightMode] = useState(false);
  const [notes, setNotes] = useState<ReaderNote[]>([]);
  const [draft, setDraft] = useState<{ page: number; rect: NoteRect } | null>(null);
  const [editing, setEditing] = useState<ReaderNote | null>(null);
  const [noteError, setNoteError] = useState(false);
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [results, setResults] = useState<ReaderSearchResult[] | null>(null);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'min' | 'error'>('idle');
  const wide = useMediaQuery('(min-width: 1024px)');
  const initialPageSet = useRef(false);

  const pageCount = meta?.product.pageCount ?? 0;
  const twoPage = prefs.twoPage && wide;
  const step = twoPage ? 2 : 1;
  const reading = Boolean(token && meta && legalAccepted);

  useEffect(() => writeReaderPrefs(prefs), [prefs]);
  useEffect(() => setPageInput(String(page)), [page]);

  // Meta + catatan setiap kali sesi (token) baru aktif.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    setMetaError(null);
    getReaderMeta(productId, token)
      .then((next) => {
        if (cancelled) return;
        setMeta(next);
        setLegalAccepted(next.legalNoticeAccepted);
        if (!initialPageSet.current) {
          initialPageSet.current = true;
          setPage(Math.min(Math.max(1, next.progress?.page ?? 1), next.product.pageCount));
        }
      })
      .catch((err) => {
        if (!cancelled && !reportError(err)) setMetaError(err instanceof DigitalApiError ? err.code : 'unknown');
      });
    listReaderNotes(productId, token)
      .then((res) => {
        if (!cancelled) setNotes(res.notes);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [productId, token, reportError]);

  const goTo = useCallback((target: number) => {
    if (!pageCount) return;
    let next = Math.min(Math.max(1, Math.round(target)), pageCount);
    if (twoPage && next % 2 === 0) next -= 1;
    setPage(next);
  }, [pageCount, twoPage]);

  useEffect(() => {
    if (twoPage) setPage((p) => (p % 2 === 0 ? p - 1 : p));
  }, [twoPage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        goTo(page + step);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goTo(page - step);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, page, step]);

  // Progres (debounce).
  useEffect(() => {
    if (!token || !reading) return undefined;
    const timer = window.setTimeout(() => {
      saveReaderProgress(productId, token, page).catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [productId, token, reading, page]);

  // Verified reading: lama halaman terlihat (tab aktif), dikirim berkala; server memvalidasi ulang.
  const dwell = useRef<{ page: number; since: number | null; queue: Array<{ page: number; dwellMs: number }> }>({ page: 1, since: null, queue: [] });
  const closeSegment = useCallback(() => {
    const current = dwell.current;
    if (current.since !== null) {
      const ms = Date.now() - current.since;
      if (ms >= MIN_DWELL_MS) current.queue.push({ page: current.page, dwellMs: Math.min(ms, MAX_DWELL_MS) });
      current.since = null;
    }
  }, []);
  const openSegment = useCallback((p: number) => {
    dwell.current.page = p;
    dwell.current.since = document.visibilityState === 'visible' ? Date.now() : null;
  }, []);
  const flushEvents = useCallback(() => {
    closeSegment();
    const batch = dwell.current.queue.splice(0, 60);
    openSegment(dwell.current.page);
    if (token && batch.length > 0) sendReadingEvents(productId, token, batch).catch(() => undefined);
  }, [closeSegment, openSegment, productId, token]);

  useEffect(() => {
    if (!reading) return;
    closeSegment();
    openSegment(page);
  }, [reading, page, closeSegment, openSegment]);

  useEffect(() => {
    if (!reading) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') openSegment(dwell.current.page);
      else closeSegment();
    };
    const timer = window.setInterval(flushEvents, EVENT_FLUSH_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      flushEvents();
    };
  }, [reading, flushEvents, openSegment, closeSegment]);

  const loadPage = useCallback((p: number) => fetchReaderPage(productId, p, token ?? ''), [productId, token]);
  const onSelectRect = useCallback((p: number, rect: NoteRect) => {
    setNoteError(false);
    setDraft({ page: p, rect });
  }, []);

  const viewerLabels = useMemo<PageViewerLabels>(() => ({
    pageAlt: (p) => t('reader.pageAlt', { page: p }),
    loading: t('reader.pageLoading'),
    error: t('reader.pageError'),
    retry: t('reader.retryPage'),
    slowDown: t('reader.slowDown')
  }), [t]);

  const renderOverlay = useCallback((p: number) => notes
    .filter((note) => note.page === p)
    .map((note) => note.rects.map((rect, index) => (
      <button
        key={`${note.id}-${index}`}
        type="button"
        onClick={() => {
          setNoteError(false);
          setEditing(note);
        }}
        title={note.text ?? undefined}
        aria-label={t('reader.editNote')}
        className={`absolute rounded-sm mix-blend-multiply cursor-pointer ${HIGHLIGHT_CLASS[note.color]}`}
        style={rectStyle(rect)}
      />
    ))), [notes, t]);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt)),
    [notes]
  );

  const acceptNotice = async () => {
    try {
      await acceptLegalNotice(productId);
      setLegalAccepted(true);
    } catch (err) {
      if (!reportError(err)) throw err;
    }
  };

  const saveDraft = async (color: NoteColor, text: string) => {
    if (!token || !draft) return;
    try {
      const { note } = await createReaderNote(productId, token, { page: draft.page, rects: [draft.rect], color, text: text.trim() || null });
      setNotes((prev) => [...prev, note]);
      setDraft(null);
    } catch (err) {
      if (!reportError(err)) setNoteError(true);
    }
  };

  const saveEdit = async (note: ReaderNote, color: NoteColor, text: string) => {
    if (!token) return;
    try {
      const { note: updated } = await updateReaderNote(productId, token, note.id, { color, text: text.trim() || null });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setEditing(null);
    } catch (err) {
      if (!reportError(err)) setNoteError(true);
    }
  };

  const removeNote = async (note: ReaderNote) => {
    if (!token) return;
    try {
      await deleteReaderNote(productId, token, note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      setEditing(null);
    } catch (err) {
      if (!reportError(err)) setNoteError(true);
    }
  };

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setSearchState('min');
      return;
    }
    if (!token) return;
    setSearchState('loading');
    try {
      const res = await searchReader(productId, token, q);
      setResults(res.results);
      setSearchedQuery(q);
      setSearchState('idle');
    } catch (err) {
      if (!reportError(err)) setSearchState('error');
    }
  };

  const jump = (target: number) => {
    goTo(target);
    if (!wide) setSidebar(null);
  };

  const setZoom = (direction: -1 | 1) => {
    const index = ZOOM_STEPS.findIndex((z) => z >= prefs.zoom - 0.001);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (index < 0 ? 2 : index) + direction))];
    setPrefs((p) => ({ ...p, zoom: next }));
  };

  const dark = prefs.dark;
  const barClass = dark ? 'border-slate-800 bg-slate-900' : 'border-slate-300 bg-white';
  const iconButton = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${dark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`;
  const pressed = dark ? 'bg-slate-700' : 'bg-slate-200';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';

  let content: React.ReactNode;
  if (gateState.status !== 'active') {
    content = (
      <AccessGate
        state={gateState}
        productId={productId}
        dark={dark}
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
          {metaError === 'not_ready' ? t('reader.notReady') : metaError === 'wrong_format' ? t('reader.wrongFormat') : t('access.error.generic')}
        </p>
        <button type="button" onClick={onExit} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-bold text-slate-950 cursor-pointer">{t('access.backToLibrary')}</button>
      </div>
    );
  } else if (!meta) {
    content = <div className="flex h-full items-center justify-center text-sm opacity-80" role="status">{t('reader.loading')}</div>;
  } else if (!legalAccepted) {
    content = <LegalNoticeDialog name={meta.watermark.name} email={meta.watermark.email} dark={dark} onAccept={acceptNotice} onCancel={onExit} />;
  } else {
    content = (
      <PageViewer
        pageCount={pageCount}
        page={page}
        loadPage={loadPage}
        zoom={prefs.zoom}
        twoPage={twoPage}
        dark={dark}
        cornerMark={`${meta.watermark.name} · ${meta.watermark.email}`}
        renderOverlay={renderOverlay}
        selectMode={highlightMode}
        onSelectRect={onSelectRect}
        onPageError={reportError}
        labels={viewerLabels}
      />
    );
  }

  const tabIcon: Record<SidebarTab, React.ReactNode> = {
    contents: <List className="h-4 w-4" aria-hidden="true" />,
    search: <Search className="h-4 w-4" aria-hidden="true" />,
    notes: <StickyNote className="h-4 w-4" aria-hidden="true" />
  };

  return (
    <div
      id="reader-root"
      className={`fixed inset-0 z-[70] flex flex-col ${dark ? 'bg-slate-950 text-slate-100' : 'bg-slate-200 text-slate-900'}`}
      onContextMenu={(event) => event.preventDefault()}
      style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
    >
      <header className={`flex items-center gap-1 border-b px-2 py-1.5 sm:gap-2 sm:px-3 ${barClass}`}>
        <button type="button" id="btn-reader-exit" onClick={onExit} className={iconButton} aria-label={t('reader.back')} title={t('reader.back')}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{meta?.title || t('reader.loading')}</p>
          {meta?.author && <p className={`hidden truncate text-[11px] sm:block ${muted}`}>{meta.author}</p>}
        </div>
        {reading && (
          <>
            <button type="button" id="btn-reader-prev" onClick={() => goTo(page - step)} disabled={page <= 1} className={iconButton} aria-label={t('reader.prev')} title={t('reader.prev')}>
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-1">
              <input
                id="reader-page-input"
                type="text"
                inputMode="numeric"
                aria-label={t('reader.pageInput')}
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value.replace(/\D/g, '').slice(0, 5))}
                onBlur={() => goTo(Number(pageInput) || page)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                }}
                style={{ userSelect: 'text' }}
                className={`w-11 rounded-md border px-1 py-1 text-center text-xs ${dark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-white'}`}
              />
              <span className={`text-xs ${muted}`}>/ {pageCount}</span>
            </div>
            <button type="button" id="btn-reader-next" onClick={() => goTo(page + step)} disabled={page + step > pageCount} className={iconButton} aria-label={t('reader.next')} title={t('reader.next')}>
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="hidden items-center gap-0.5 sm:flex">
              <button type="button" onClick={() => setZoom(-1)} disabled={prefs.zoom <= ZOOM_STEPS[0]} className={iconButton} aria-label={t('reader.zoomOut')} title={t('reader.zoomOut')}>
                <ZoomOut className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setPrefs((p) => ({ ...p, zoom: 1 }))} className={iconButton} aria-label={t('reader.fitWidth')} title={t('reader.fitWidth')}>
                <Maximize2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setZoom(1)} disabled={prefs.zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} className={iconButton} aria-label={t('reader.zoomIn')} title={t('reader.zoomIn')}>
                <ZoomIn className="h-4 w-4" />
              </button>
              {wide && (
                <button
                  type="button"
                  onClick={() => setPrefs((p) => ({ ...p, twoPage: !p.twoPage }))}
                  aria-pressed={prefs.twoPage}
                  className={`${iconButton} ${prefs.twoPage ? pressed : ''}`}
                  aria-label={t('reader.twoPage')}
                  title={t('reader.twoPage')}
                >
                  <BookOpen className="h-4 w-4" />
                </button>
              )}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setPrefs((p) => ({ ...p, dark: !p.dark }))}
          aria-pressed={dark}
          className={iconButton}
          aria-label={t('reader.darkMode')}
          title={t('reader.darkMode')}
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        {reading && (
          <>
            <button
              type="button"
              id="btn-reader-highlight"
              onClick={() => setHighlightMode((v) => !v)}
              aria-pressed={highlightMode}
              className={`${iconButton} ${highlightMode ? pressed : ''}`}
              aria-label={t('reader.highlightMode')}
              title={t('reader.highlightMode')}
            >
              <Highlighter className="h-4 w-4" />
            </button>
            <button
              type="button"
              id="btn-reader-sidebar"
              onClick={() => setSidebar((s) => (s ? null : 'contents'))}
              aria-pressed={sidebar !== null}
              className={`${iconButton} ${sidebar ? pressed : ''}`}
              aria-label={t('reader.sidebar')}
              title={t('reader.sidebar')}
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1">{content}</main>

        {sidebar && reading && meta && (
          <aside
            id="reader-sidebar"
            aria-label={t('reader.sidebar')}
            className={`absolute inset-y-0 right-0 z-20 flex w-80 max-w-[85vw] flex-col border-l shadow-xl lg:static lg:shadow-none ${barClass}`}
          >
            <div className={`flex items-center gap-1 border-b px-2 py-2 ${dark ? 'border-slate-800' : 'border-slate-200'}`}>
              {(['contents', 'search', 'notes'] as SidebarTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  id={`reader-tab-${tab}`}
                  onClick={() => setSidebar(tab)}
                  aria-pressed={sidebar === tab}
                  className={`inline-flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold cursor-pointer ${sidebar === tab ? pressed : ''}`}
                >
                  {tabIcon[tab]}
                  <span className="truncate">{t(`reader.tabs.${tab}`)}</span>
                </button>
              ))}
              <button type="button" onClick={() => setSidebar(null)} className={iconButton} aria-label={t('reader.closeSidebar')} title={t('reader.closeSidebar')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
              {sidebar === 'contents' && (
                meta.chapters.length === 0 ? (
                  <p className={muted}>{t('reader.noChapters')}</p>
                ) : (
                  <ul className="space-y-1">
                    {meta.chapters.map((chapter) => (
                      <li key={chapter.number}>
                        <button
                          type="button"
                          onClick={() => jump(chapter.page)}
                          className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left cursor-pointer ${dark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
                        >
                          <span className="min-w-0 [overflow-wrap:anywhere]">{chapter.title}</span>
                          <span className={`shrink-0 text-xs ${muted}`}>{t('reader.chapterPage', { page: chapter.page })}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {sidebar === 'search' && (
                <div>
                  <form onSubmit={(event) => void runSearch(event)} className="flex gap-2">
                    <input
                      id="reader-search-input"
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      maxLength={100}
                      placeholder={t('reader.searchPlaceholder')}
                      aria-label={t('reader.searchPlaceholder')}
                      style={{ userSelect: 'text' }}
                      className={`min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm ${dark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-white'}`}
                    />
                    <button type="submit" className="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer">{t('reader.searchSubmit')}</button>
                  </form>
                  <div className="mt-3" aria-live="polite">
                    {searchState === 'loading' && <p className={muted}>{t('reader.searching')}</p>}
                    {searchState === 'min' && <p className={muted}>{t('reader.searchMin')}</p>}
                    {searchState === 'error' && <p className="text-rose-500">{t('reader.searchError')}</p>}
                    {searchState === 'idle' && results && results.length === 0 && <p className={muted}>{t('reader.searchEmpty', { query: searchedQuery })}</p>}
                    {searchState === 'idle' && results && results.length > 0 && (
                      <ul className="space-y-2">
                        {results.map((result, index) => (
                          <li key={`${result.page}-${index}`}>
                            <button
                              type="button"
                              onClick={() => jump(result.page)}
                              className={`w-full rounded-lg px-2 py-1.5 text-left cursor-pointer ${dark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
                            >
                              <span className="block text-xs font-semibold text-gold-700">{t('reader.searchResultPage', { page: result.page })}</span>
                              <span className={`block text-xs [overflow-wrap:anywhere] ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{result.snippet}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {sidebar === 'notes' && (
                sortedNotes.length === 0 ? (
                  <p className={muted}>{t('reader.notesEmpty')}</p>
                ) : (
                  <ul className="space-y-2">
                    {sortedNotes.map((note) => (
                      <li key={note.id} className="flex items-start gap-2">
                        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${SWATCH_CLASS[note.color]}`} aria-hidden="true" />
                        <button
                          type="button"
                          onClick={() => jump(note.page)}
                          className={`min-w-0 flex-1 rounded-lg px-1.5 py-1 text-left cursor-pointer ${dark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
                        >
                          <span className="block text-xs font-semibold">{t('reader.notePage', { page: note.page })}</span>
                          {note.text && <span className={`block text-xs [overflow-wrap:anywhere] ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{note.text}</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNoteError(false);
                            setEditing(note);
                          }}
                          className={`${iconButton} h-7 w-7`}
                          aria-label={t('reader.editNote')}
                          title={t('reader.editNote')}
                        >
                          <StickyNote className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </aside>
        )}

        {highlightMode && reading && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs text-white">
            {t('reader.highlightHint')}
          </div>
        )}
      </div>

      {draft && (
        <NoteDialog
          title={t('reader.newNote')}
          initialColor="yellow"
          initialText=""
          dark={dark}
          error={noteError}
          onSave={(color, text) => void saveDraft(color, text)}
          onCancel={() => setDraft(null)}
        />
      )}
      {editing && (
        <NoteDialog
          key={editing.id}
          title={t('reader.editNote')}
          initialColor={editing.color}
          initialText={editing.text ?? ''}
          dark={dark}
          error={noteError}
          onSave={(color, text) => void saveEdit(editing, color, text)}
          onDelete={() => void removeNote(editing)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
};
