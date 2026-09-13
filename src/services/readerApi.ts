import { jsonBody, memberBlob, memberRequest } from './digitalApi';

/** Klien API reader e-book (langkah 5). Semua permintaan membawa access token Supabase + X-Session-Token. */
export type NoteColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface NoteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ReaderNote {
  id: string;
  page: number;
  rects: NoteRect[];
  color: NoteColor;
  text: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReaderMeta {
  product: { id: string; bookId: string; pageCount: number };
  title: string;
  author: string;
  chapters: Array<{ number: number; title: string; page: number }>;
  progress: { page: number; percent: number } | null;
  legalNoticeAccepted: boolean;
  watermark: { name: string; email: string; entitlementId: string };
}

export interface ReaderSearchResult {
  page: number;
  snippet: string;
}

const base = (productId: string) => `/api/reader/${encodeURIComponent(productId)}`;

export const getReaderMeta = (productId: string, sessionToken: string) =>
  memberRequest<ReaderMeta>(`${base(productId)}/meta`, { sessionToken });

/** Halaman ber-watermark (WebP) dimuat ke memori, tidak ke cache browser, dan tidak pernah menjadi URL yang bisa dibuka ulang. */
export const fetchReaderPage = (productId: string, page: number, sessionToken: string) =>
  memberBlob(`${base(productId)}/pages/${page}`, { sessionToken });

export const searchReader = (productId: string, sessionToken: string, query: string) =>
  memberRequest<{ results: ReaderSearchResult[] }>(`${base(productId)}/search?q=${encodeURIComponent(query)}`, { sessionToken });

export const listReaderNotes = (productId: string, sessionToken: string) =>
  memberRequest<{ notes: ReaderNote[] }>(`${base(productId)}/notes`, { sessionToken });

export const createReaderNote = (
  productId: string,
  sessionToken: string,
  input: { page: number; rects: NoteRect[]; color: NoteColor; text: string | null }
) => memberRequest<{ note: ReaderNote }>(`${base(productId)}/notes`, { method: 'POST', sessionToken, body: jsonBody(input) });

export const updateReaderNote = (productId: string, sessionToken: string, noteId: string, patch: { color?: NoteColor; text?: string | null }) =>
  memberRequest<{ note: ReaderNote }>(`${base(productId)}/notes/${encodeURIComponent(noteId)}`, { method: 'PATCH', sessionToken, body: jsonBody(patch) });

export const deleteReaderNote = (productId: string, sessionToken: string, noteId: string) =>
  memberRequest<void>(`${base(productId)}/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE', sessionToken });

export const saveReaderProgress = (productId: string, sessionToken: string, page: number) =>
  memberRequest<{ page: number; percent: number }>(`${base(productId)}/progress`, { method: 'PUT', sessionToken, body: jsonBody({ page }) });

export const sendReadingEvents = (productId: string, sessionToken: string, events: Array<{ page: number; dwellMs: number }>) =>
  memberRequest<{ accepted: number; rejected: number }>(`${base(productId)}/events`, { method: 'POST', sessionToken, body: jsonBody({ events }) });

/** Persetujuan ketentuan penggunaan (reader & player), sekali per produk. */
export const acceptLegalNotice = (productId: string) =>
  memberRequest<{ acceptedAt: string }>(`/api/access/${encodeURIComponent(productId)}/legal-notice`, { method: 'POST' });
