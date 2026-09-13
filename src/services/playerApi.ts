import { jsonBody, memberRequest } from './digitalApi';

/** Klien API player audiobook (langkah 6). Permintaan meta/progres membawa access token + X-Session-Token. */
export interface PlayerStream {
  /** Path relatif API (…/playlist.m3u8?t=…); dijadikan URL absolut dengan apiUrl(). */
  playlistUrl: string;
  expiresAt: string;
}

export interface PlayerChapter {
  number: number;
  title: string;
  start: number;
}

export interface PlayerMeta {
  product: { id: string; bookId: string; durationSeconds: number };
  title: string;
  author: string;
  coverUrl: string;
  chapters: PlayerChapter[];
  progress: { position: number; percent: number } | null;
  legalNoticeAccepted: boolean;
  watermark: { name: string; email: string; entitlementId: string };
  stream: PlayerStream;
}

export interface ListeningInterval {
  from: number;
  to: number;
  wallMs: number;
}

const base = (productId: string) => `/api/player/${encodeURIComponent(productId)}`;

export const getPlayerMeta = (productId: string, sessionToken: string) =>
  memberRequest<PlayerMeta>(`${base(productId)}/meta`, { sessionToken });

export const refreshPlayerStream = (productId: string, sessionToken: string) =>
  memberRequest<PlayerStream>(`${base(productId)}/stream`, { sessionToken });

export const savePlayerProgress = (productId: string, sessionToken: string, position: number) =>
  memberRequest<{ position: number; percent: number }>(`${base(productId)}/progress`, { method: 'PUT', sessionToken, body: jsonBody({ position }) });

export const sendListeningEvents = (productId: string, sessionToken: string, events: ListeningInterval[]) =>
  memberRequest<{ accepted: number; rejected: number }>(`${base(productId)}/events`, { method: 'POST', sessionToken, body: jsonBody({ events }) });
