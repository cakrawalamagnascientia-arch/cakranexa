import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

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
          motion: ['motion']
        }
      }
    }
  }
}));
