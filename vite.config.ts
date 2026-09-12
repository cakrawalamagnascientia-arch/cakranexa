import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

// Satu chunk per bahasa non-default (locale-en, locale-zh, ...): ganti bahasa cukup memuat 1 file.
// Bahasa Indonesia (default) dibundel langsung di aplikasi utama.
const localesDir = path.resolve(__dirname, 'src/i18n/locales');
const localeChunks = Object.fromEntries(
  fs.readdirSync(localesDir)
    .filter((lang) => lang !== 'id' && fs.statSync(path.join(localesDir, lang)).isDirectory())
    .map((lang) => [
      `locale-${lang}`,
      fs.readdirSync(path.join(localesDir, lang)).filter((file) => file.endsWith('.json')).map((file) => path.join(localesDir, lang, file))
    ])
);

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    // Saat `vite` dijalankan terpisah (npm run dev:client), proxy API ke Express di :3000
    proxy: {
      '/api': 'http://localhost:3000',
      '/sitemap.xml': 'http://localhost:3000',
      '/robots.txt': 'http://localhost:3000'
    },
    // HMR/file watching dapat dimatikan via DISABLE_HMR=true (lingkungan agen/AI Studio)
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {}
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          charts: ['recharts'],
          pdf: ['jspdf', 'html2canvas', 'jsbarcode', 'qrcode'],
          motion: ['motion'],
          ...localeChunks
        }
      }
    }
  }
}));
