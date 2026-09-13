import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Viewer halaman berbasis canvas, dipakai reader berbayar (gambar ber-watermark dari API bertoken) dan
 * halaman sampel (URL publik). Gambar digambar ke <canvas> — tidak ada <img src> yang bisa dibuka/diunduh
 * langsung. Ini friksi, bukan keamanan: perlindungan sebenarnya ada di backend.
 */

export interface ViewerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Blob (reader berbayar) atau URL publik (sampel). */
export type PageSource = Blob | string;

export interface PageViewerLabels {
  pageAlt: (page: number) => string;
  loading: string;
  error: string;
  retry: string;
  slowDown: string;
}

interface DecodedPage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

const decodePage = async (input: PageSource): Promise<DecodedPage> => {
  if (typeof input !== 'string' && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(input);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // mis. SVG: jatuh ke elemen gambar
    }
  }
  const objectUrl = typeof input === 'string' ? null : URL.createObjectURL(input);
  const img = new Image();
  img.decoding = 'async';
  img.src = objectUrl ?? (input as string);
  try {
    await img.decode();
  } catch (err) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw err;
  }
  return {
    source: img,
    width: img.naturalWidth || 1000,
    height: img.naturalHeight || 1414,
    release: () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };
};

/** Cache halaman ter-decode (LRU kecil) + prefetch. Halaman yang dikeluarkan dilepas dari memori. */
export class PageCache {
  private readonly entries = new Map<number, Promise<DecodedPage>>();

  constructor(private readonly load: (page: number) => Promise<PageSource>, private readonly max = 8) {}

  get(page: number): Promise<DecodedPage> {
    const hit = this.entries.get(page);
    if (hit) {
      this.entries.delete(page);
      this.entries.set(page, hit);
      return hit;
    }
    const pending = this.load(page).then(decodePage);
    this.entries.set(page, pending);
    pending.catch(() => {
      if (this.entries.get(page) === pending) this.entries.delete(page);
    });
    this.evict();
    return pending;
  }

  prefetch(page: number): void {
    if (!this.entries.has(page)) this.get(page).catch(() => undefined);
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.then((d) => d.release()).catch(() => undefined);
    this.entries.clear();
  }

  private evict(): void {
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value as number;
      const entry = this.entries.get(oldest)!;
      this.entries.delete(oldest);
      entry.then((d) => d.release()).catch(() => undefined);
    }
  }
}

const isRateLimited = (err: unknown) => typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 429;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Posisi persen untuk kotak relatif halaman (sorotan). */
export const rectStyle = (r: ViewerRect): React.CSSProperties => ({
  left: `${r.x * 100}%`,
  top: `${r.y * 100}%`,
  width: `${r.w * 100}%`,
  height: `${r.h * 100}%`
});

interface PageCanvasProps {
  page: number;
  cache: PageCache;
  width: number;
  dark: boolean;
  cornerMark?: string;
  overlay?: React.ReactNode;
  selectMode: boolean;
  onSelectRect?: (page: number, rect: ViewerRect) => void;
  onError?: (error: unknown, page: number) => boolean;
  labels: PageViewerLabels;
}

const PageCanvas: React.FC<PageCanvasProps> = ({ page, cache, width, dark, cornerMark, overlay, selectMode, onSelectRect, onError, labels }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.414);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'slow'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<ViewerRect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    setStatus('loading');
    cache.get(page).then((decoded) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const nextRatio = decoded.height / decoded.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(width * nextRatio * dpr));
      const context = canvas.getContext('2d');
      if (context) {
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        try {
          context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
        } catch {
          // gambar sudah dilepas dari cache; akan dimuat ulang saat dibutuhkan
        }
      }
      setRatio(nextRatio);
      setStatus('ready');
    }).catch((err) => {
      if (cancelled) return;
      if (onErrorRef.current?.(err, page)) return;
      if (isRateLimited(err)) {
        setStatus('slow');
        retryTimer = window.setTimeout(() => setAttempt((a) => a + 1), 4000);
      } else {
        setStatus('error');
      }
    });
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [page, cache, width, attempt]);

  const toRelative = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: clamp01((event.clientX - box.left) / box.width), y: clamp01((event.clientY - box.top) / box.height) };
  };

  const height = Math.round(width * ratio);
  return (
    <div className="relative shrink-0 bg-white shadow-md" style={{ width, height }} data-page={page}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={labels.pageAlt(page)}
        className="block h-full w-full"
        style={dark ? { filter: 'invert(0.92) hue-rotate(180deg)' } : undefined}
        onContextMenu={(event) => event.preventDefault()}
      />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/85 px-4 text-center text-xs text-slate-600">
          {status === 'loading' && <span role="status">{labels.loading}</span>}
          {status === 'slow' && <span role="status">{labels.slowDown}</span>}
          {status === 'error' && (
            <>
              <span role="alert">{labels.error}</span>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                {labels.retry}
              </button>
            </>
          )}
        </div>
      )}
      {status === 'ready' && overlay && <div className="absolute inset-0">{overlay}</div>}
      {status === 'ready' && selectMode && (
        <div
          className="absolute inset-0 cursor-crosshair"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = toRelative(event);
            startRef.current = point;
            setDraft({ ...point, w: 0, h: 0 });
          }}
          onPointerMove={(event) => {
            const origin = startRef.current;
            if (!origin) return;
            const point = toRelative(event);
            setDraft({ x: Math.min(origin.x, point.x), y: Math.min(origin.y, point.y), w: Math.abs(point.x - origin.x), h: Math.abs(point.y - origin.y) });
          }}
          onPointerUp={() => {
            const selected = draft;
            startRef.current = null;
            setDraft(null);
            if (selected && selected.w > 0.01 && selected.h > 0.005) onSelectRect?.(page, selected);
          }}
          onPointerCancel={() => {
            startRef.current = null;
            setDraft(null);
          }}
        >
          {draft && <div className="absolute border border-sky-500 bg-sky-400/25" style={rectStyle(draft)} />}
        </div>
      )}
      {cornerMark && (
        <span className="pointer-events-none absolute bottom-1 right-2 max-w-[90%] truncate text-[9px] text-slate-500/70">{cornerMark}</span>
      )}
    </div>
  );
};

export interface PageViewerProps {
  pageCount: number;
  /** Halaman aktif (halaman kiri pada tampilan dua halaman). */
  page: number;
  loadPage: (page: number) => Promise<PageSource>;
  zoom?: number;
  twoPage?: boolean;
  dark?: boolean;
  cornerMark?: string;
  renderOverlay?: (page: number) => React.ReactNode;
  selectMode?: boolean;
  onSelectRect?: (page: number, rect: ViewerRect) => void;
  /** Kembalikan true bila error sudah ditangani (mis. sesi berakhir). */
  onPageError?: (error: unknown, page: number) => boolean;
  maxPageWidth?: number;
  labels: PageViewerLabels;
}

export const PageViewer: React.FC<PageViewerProps> = ({
  pageCount,
  page,
  loadPage,
  zoom = 1,
  twoPage = false,
  dark = false,
  cornerMark,
  renderOverlay,
  selectMode = false,
  onSelectRect,
  onPageError,
  maxPageWidth = 900,
  labels
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const cache = useMemo(() => new PageCache(loadPage), [loadPage]);
  useEffect(() => () => cache.dispose(), [cache]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const update = () => setContainerWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pages = twoPage && page + 1 <= pageCount ? [page, page + 1] : [page];

  // Prefetch dua tampilan berikutnya dan satu halaman sebelumnya.
  useEffect(() => {
    const span = pages.length;
    for (let p = page + span; p < page + span * 3 && p <= pageCount; p++) cache.prefetch(p);
    if (page > 1) cache.prefetch(page - 1);
  }, [page, pageCount, cache, pages.length]);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const gap = 16;
  const available = Math.max(200, containerWidth - 32);
  const fitWidth = pages.length === 2 ? Math.min((available - gap) / 2, maxPageWidth * 0.8) : Math.min(available, maxPageWidth);
  const width = Math.round(fitWidth * zoom);

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto">
      {containerWidth > 0 && (
        <div className="mx-auto flex w-max gap-4 p-4">
          {pages.map((p) => (
            <PageCanvas
              key={p}
              page={p}
              cache={cache}
              width={width}
              dark={dark}
              cornerMark={cornerMark}
              overlay={renderOverlay?.(p)}
              selectMode={selectMode}
              onSelectRect={onSelectRect}
              onError={onPageError}
              labels={labels}
            />
          ))}
        </div>
      )}
    </div>
  );
};
