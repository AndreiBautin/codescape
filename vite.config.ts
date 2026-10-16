import { defineConfig } from 'vitest/config';

// Port is pinned: start-app.bat and the README refer to 5391.
// BASE_PATH is set by the Pages deploy ("/codescape/"); every other URL in the app is relative to it.
export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  server: { port: 5391, strictPort: true },
  preview: { port: 5391, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
