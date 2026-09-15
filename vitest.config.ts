import { defineConfig } from 'vitest/config';

// Tes backend, data bersama (src/data), utilitas, dan snapshot markup komponen (renderToStaticMarkup, tanpa DOM).
// Interaksi UI tetap diuji dengan skrip Playwright.
export default defineConfig({
  test: {
    include: ['backend/**/*.test.ts', 'src/data/**/*.test.ts', 'src/utils/**/*.test.ts', 'src/components/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 30000,
    env: { NODE_ENV: 'test' }
  }
});
