# Codescape — notes for whoever comes next

- `src/core` is pure and DOM-free; the lint config enforces it. New mapping logic
  (tree → geometry) goes there, with a test. Scenes only turn layouts into pixels.
- A new screensaver = a `Scene` in `src/scenes/` + an entry in `MODES` (`core/config.ts`) +
  `FACTORIES` (`ui/app.ts`) + a dock button in `index.html`. `MODES` drives keys 1–N.
- Scenes get randomness only from `ctx.rng` and time only as `dt`. Remounting with the same
  seed must replay the same scene — don't cache state across mounts.
- Logger fields are numbers/booleans only by type, so paths never reach logs. Keep it that way.
- Port is **5391** (5317 is taken by LightShow on this machine). It appears in
  `vite.config.ts`, `start-app.bat`, `.claude/launch.json`, README.
- TypeScript is pinned to 6.x: typescript-eslint does not support TS 7 yet.
- `fs-access.d.ts` declares the Chromium File System Access members; `showDirectoryPicker`
  is feature-detected at runtime, with `<input webkitdirectory>` as fallback.
