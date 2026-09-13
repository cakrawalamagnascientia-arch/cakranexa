import { defineConfig } from 'vitest/config';

// Tes backend produk digital (fase 2). Frontend tidak dites di sini (lihat skrip Playwright).
export default defineConfig({
  test: {
    include: ['backend/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    env: { NODE_ENV: 'test' }
  }
});
