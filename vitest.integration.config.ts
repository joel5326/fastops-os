import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/engine/__tests__/integration.test.ts', 'src/engine/__tests__/context-integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
