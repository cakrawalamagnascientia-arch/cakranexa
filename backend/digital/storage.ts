import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Penyimpanan aset PRIVAT (file master, halaman render, HLS). Hanya server yang memakainya;
 * tidak ada URL penyimpanan yang dikirim ke browser.
 */
export interface AssetStorage {
  readonly kind: 'supabase' | 'filesystem';
  upload(objectPath: string, body: Buffer | Readable, contentType: string): Promise<void>;
  download(objectPath: string): Promise<Buffer>;
  downloadToFile(objectPath: string, filePath: string): Promise<void>;
  remove(objectPaths: string[]): Promise<void>;
  /** Nama file langsung di bawah prefix (tanpa rekursi). */
  list(prefix: string): Promise<string[]>;
}

export class AssetNotFoundError extends Error {}

/** Lokasi aset dalam bucket privat. */
export const assetPaths = {
  ebookSource: (productId: string) => `ebooks/${productId}/source.pdf`,
  ebookPagesDir: (productId: string) => `ebooks/${productId}/pages`,
  ebookPage: (productId: string, page: number) => `ebooks/${productId}/pages/${page}.png`,
  audioSource: (productId: string, extension = 'mp3') => `audiobooks/${productId}/source.${extension}`,
  audioHlsDir: (productId: string) => `audiobooks/${productId}/hls`,
  audioPlaylist: (productId: string) => `audiobooks/${productId}/hls/index.m3u8`,
  audioSegment: (productId: string, segment: number) => `audiobooks/${productId}/hls/seg_${segment}.ts`,
  audioKey: (productId: string) => `audiobooks/${productId}/hls/enc.key`
};

const safeObjectPath = (objectPath: string) => {
  if (!/^[a-zA-Z0-9/_.\-]+$/.test(objectPath) || objectPath.includes('..') || objectPath.startsWith('/')) {
    throw new Error(`Path aset tidak valid: ${objectPath}`);
  }
  return objectPath;
};

/** Supabase Storage (bucket privat, service role). */
export const createSupabaseAssetStorage = (client: SupabaseClient, bucket: string): AssetStorage => {
  const api = () => client.storage.from(bucket);
  return {
    kind: 'supabase',
    async upload(objectPath, body, contentType) {
      const { error } = await api().upload(safeObjectPath(objectPath), body as any, {
        contentType,
        upsert: true,
        cacheControl: 'no-store',
        ...(body instanceof Readable ? { duplex: 'half' } : {})
      } as any);
      if (error) throw new Error(`Unggah aset gagal (${objectPath}): ${error.message}`);
    },
    async download(objectPath) {
      const { data, error } = await api().download(safeObjectPath(objectPath));
      if (error || !data) {
        const status = (error as { statusCode?: string | number } | null)?.statusCode;
        if (String(status) === '404' || /not found/i.test(error?.message || '')) throw new AssetNotFoundError(objectPath);
        throw new Error(`Unduh aset gagal (${objectPath}): ${error?.message}`);
      }
      return Buffer.from(await data.arrayBuffer());
    },
    async downloadToFile(objectPath, filePath) {
      // URL bertanda tangan berumur pendek HANYA dipakai server untuk streaming file besar ke disk sementara.
      const { data, error } = await api().createSignedUrl(safeObjectPath(objectPath), 120);
      if (error || !data?.signedUrl) throw new AssetNotFoundError(objectPath);
      const response = await fetch(data.signedUrl);
      if (!response.ok || !response.body) throw new Error(`Unduh aset gagal (${objectPath}): HTTP ${response.status}`);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(filePath));
    },
    async remove(objectPaths) {
      for (let i = 0; i < objectPaths.length; i += 900) {
        const batch = objectPaths.slice(i, i + 900).map(safeObjectPath);
        const { error } = await api().remove(batch);
        if (error) throw new Error(`Hapus aset gagal: ${error.message}`);
      }
    },
    async list(prefix) {
      const names: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await api().list(safeObjectPath(prefix), { limit: 1000, offset });
        if (error) throw new Error(`Daftar aset gagal (${prefix}): ${error.message}`);
        names.push(...(data || []).filter((item) => item.id).map((item) => item.name));
        if (!data || data.length < 1000) break;
      }
      return names;
    }
  };
};

/** Penyimpanan folder lokal — hanya untuk tes/dev lokal tanpa Supabase (DIGITAL_LOCAL_DEV=1). */
export const createFilesystemAssetStorage = (rootDir: string): AssetStorage => {
  const resolve = (objectPath: string) => path.join(rootDir, ...safeObjectPath(objectPath).split('/'));
  return {
    kind: 'filesystem',
    async upload(objectPath, body) {
      const target = resolve(objectPath);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      if (Buffer.isBuffer(body)) await fsp.writeFile(target, body);
      else await pipeline(body, fs.createWriteStream(target));
    },
    async download(objectPath) {
      try {
        return await fsp.readFile(resolve(objectPath));
      } catch {
        throw new AssetNotFoundError(objectPath);
      }
    },
    async downloadToFile(objectPath, filePath) {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      try {
        await fsp.copyFile(resolve(objectPath), filePath);
      } catch {
        throw new AssetNotFoundError(objectPath);
      }
    },
    async remove(objectPaths) {
      await Promise.all(objectPaths.map((p) => fsp.rm(resolve(p), { force: true })));
    },
    async list(prefix) {
      try {
        const entries = await fsp.readdir(resolve(prefix), { withFileTypes: true });
        return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
      } catch {
        return [];
      }
    }
  };
};
