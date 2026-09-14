import { defineConfig } from 'vitest/config';

// Tes backend produk digital dan data bersama (src/data). Komponen frontend tidak dites di sini (lihat skrip Playwright).
export default defineConfig({
  test: {
    include: ['backend/**/*.test.ts', 'src/data/**/*.test.ts', 'src/utils/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    env: { NODE_ENV: 'test' }
  }
});
