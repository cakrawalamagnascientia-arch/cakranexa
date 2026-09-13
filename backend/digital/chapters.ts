import type { ChapterRecord, DigitalFormat } from './types';

/**
 * Parser daftar bab yang diunggah admin.
 *  - Audiobook: CSV/TSV "waktu,judul" (hh:mm:ss, mm:ss, atau detik) atau file CUE (TRACK/TITLE/INDEX 01 mm:ss:ff).
 *  - E-book: CSV/TSV "halaman,judul".
 * Baris yang tidak bisa dibaca (mis. header) dilewati dan dilaporkan.
 */
export interface ChapterParseResult {
  chapters: ChapterRecord[];
  skipped: number;
  errors: string[];
}

const MAX_CHAPTERS = 500;

const parseTime = (value: string): number | null => {
  const text = value.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));
  const parts = text.split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const numbers = parts.map(Number);
  const [h, m, s] = numbers.length === 3 ? numbers : [0, numbers[0], numbers[1]];
  if (m >= 60 || s >= 60) return null;
  return Math.round(h * 3600 + m * 60 + s);
};

const splitLine = (line: string): [string, string] | null => {
  const match = line.match(/^\s*("?)([^",;\t]+)\1\s*[,;\t]\s*(.+?)\s*$/);
  if (!match) return null;
  return [match[2], match[3].replace(/^"(.*)"$/, '$1').trim()];
};

const parseCue = (text: string): Array<{ start: number; title: string }> => {
  const entries: Array<{ start: number; title: string }> = [];
  let current: { title: string; start: number | null } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^TRACK\s+\d+/i.test(line)) {
      if (current && current.start !== null) entries.push({ start: current.start, title: current.title });
      current = { title: '', start: null };
    } else if (current && /^TITLE\s+/i.test(line)) {
      current.title = line.replace(/^TITLE\s+/i, '').replace(/^"(.*)"$/, '$1').trim();
    } else if (current && /^INDEX\s+01\s+/i.test(line)) {
      const m = line.match(/(\d+):(\d+):(\d+)/);
      if (m) current.start = Number(m[1]) * 60 + Number(m[2]) + Math.round(Number(m[3]) / 75);
    }
  }
  if (current && current.start !== null) entries.push({ start: current.start, title: current.title });
  return entries;
};

export const parseChapters = (
  text: string,
  format: DigitalFormat,
  limits: { pageCount?: number | null; durationSeconds?: number | null } = {}
): ChapterParseResult => {
  const errors: string[] = [];
  let skipped = 0;
  let entries: Array<{ start: number; title: string }> = [];

  if (format === 'audiobook' && /^\s*TRACK\s+\d+/im.test(text)) {
    entries = parseCue(text);
  } else {
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim() || raw.trim().startsWith('#')) continue;
      const parts = splitLine(raw);
      const start = parts ? (format === 'audiobook' ? parseTime(parts[0]) : (/^\d+$/.test(parts[0].trim()) ? Number(parts[0]) : null)) : null;
      if (!parts || start === null || !parts[1]) {
        skipped += 1;
        continue;
      }
      entries.push({ start, title: parts[1] });
    }
  }

  entries = entries
    .map((e) => ({ start: e.start, title: e.title.slice(0, 300) }))
    .filter((e) => {
      if (!e.title) {
        errors.push('Judul bab kosong dilewati.');
        return false;
      }
      if (format === 'ebook' && (e.start < 1 || (limits.pageCount && e.start > limits.pageCount))) {
        errors.push(`Halaman ${e.start} di luar rentang buku.`);
        return false;
      }
      if (format === 'audiobook' && limits.durationSeconds && e.start >= limits.durationSeconds) {
        errors.push(`Waktu ${e.start} detik melebihi durasi audiobook.`);
        return false;
      }
      return true;
    })
    .sort((a, b) => a.start - b.start);

  if (entries.length > MAX_CHAPTERS) {
    errors.push(`Maksimal ${MAX_CHAPTERS} bab; sisanya diabaikan.`);
    entries = entries.slice(0, MAX_CHAPTERS);
  }

  return {
    chapters: entries.map((e, index) => ({
      chapterNumber: index + 1,
      title: e.title,
      startSeconds: format === 'audiobook' ? e.start : null,
      startPage: format === 'ebook' ? e.start : null
    })),
    skipped,
    errors
  };
};
