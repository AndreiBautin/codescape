import { defineConfig } from 'vitest/config';

// Port is pinned: start-app.bat and the README refer to 5391.
export default defineConfig({
  server: { port: 5391, strictPort: true },
  preview: { port: 5391, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
