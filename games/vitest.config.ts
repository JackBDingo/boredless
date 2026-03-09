import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@game-platform': resolve(__dirname, '../server/src/games'),
      '@boredless/shared': resolve(__dirname, '../packages/shared/src/index.ts'),
      '@phone': resolve(__dirname, '../phone/src'),
      '@display': resolve(__dirname, '../display/src'),
    },
  },
});
