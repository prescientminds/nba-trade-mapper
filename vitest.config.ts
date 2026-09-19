import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests for the comparables engine live beside it. Playwright owns
    // `tests/` and has its own runner, so it is excluded here to stop the two
    // from picking up each other's specs.
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'tests/**', '.next/**'],
    environment: 'node',
  },
});
