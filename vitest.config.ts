import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests live beside the code they cover (src/ and scripts/). Playwright owns
    // `tests/` and has its own runner, so it is excluded here to stop the two
    // from picking up each other's specs.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['node_modules/**', 'tests/**', '.next/**'],
    environment: 'node',
  },
});
