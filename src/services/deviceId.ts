/**
 * ID perangkat acak untuk batas perangkat (keputusan #11): dibuat sekali per browser dan disimpan di localStorage.
 * Bukan sidik jari browser. Menghapus data situs = terhitung perangkat baru (pengguna bisa melepas perangkat lama).
 * Server hanya menyimpan hash SHA-256-nya.
 */
const STORAGE_KEY = 'cakranexa_device_id';
const VALID_ID = /^[A-Za-z0-9_-]{16,128}$/;
let fallbackId: string | null = null;

const generateDeviceId = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const getDeviceId = (): string => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VALID_ID.test(saved)) return saved;
  } catch {
    // Penyimpanan diblokir (mode privat ketat): pakai ID sementara selama halaman terbuka.
  }
  if (!fallbackId) fallbackId = generateDeviceId();
  try {
    localStorage.setItem(STORAGE_KEY, fallbackId);
  } catch {
    // abaikan
  }
  return fallbackId;
};
