import { describe, expect, it } from 'vitest';
import { parseChapters } from '../chapters';

describe('parser bab', () => {
  it('membaca CSV audiobook dengan header dan berbagai format waktu', () => {
    const csv = 'waktu,judul\n00:00:00,Pendahuluan\n12:30,"Bab 1, Konsep"\n3725;Bab 2\nrusak';
    const result = parseChapters(csv, 'audiobook', { durationSeconds: 7200 });
    expect(result.chapters).toEqual([
      { chapterNumber: 1, title: 'Pendahuluan', startSeconds: 0, startPage: null },
      { chapterNumber: 2, title: 'Bab 1, Konsep', startSeconds: 750, startPage: null },
      { chapterNumber: 3, title: 'Bab 2', startSeconds: 3725, startPage: null }
    ]);
    expect(result.skipped).toBe(2);
  });

  it('membaca file CUE', () => {
    const cue = 'FILE "buku.mp3" MP3\n  TRACK 01 AUDIO\n    TITLE "Pembuka"\n    INDEX 01 00:00:00\n  TRACK 02 AUDIO\n    TITLE "Bab Satu"\n    INDEX 01 05:10:37\n';
    const result = parseChapters(cue, 'audiobook');
    expect(result.chapters.map((c) => [c.title, c.startSeconds])).toEqual([['Pembuka', 0], ['Bab Satu', 310]]);
  });

  it('e-book memakai nomor halaman, mengurutkan, dan menolak halaman di luar buku', () => {
    const result = parseChapters('halaman\tjudul\n45\tBab 3\n1\tDaftar Isi\n12\tBab 1\n999\tLampiran', 'ebook', { pageCount: 300 });
    expect(result.chapters.map((c) => [c.chapterNumber, c.startPage, c.title])).toEqual([
      [1, 1, 'Daftar Isi'],
      [2, 12, 'Bab 1'],
      [3, 45, 'Bab 3']
    ]);
    expect(result.errors.join(' ')).toMatch(/999/);
  });
});
