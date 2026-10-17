# Codescape — notes for whoever comes next

The product is an **architecture explorer** that looks like 90s Microsoft screensavers — every
mode must stay a real MS screensaver _and_ show the dependency structure (flows + pin).

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
- Deployed to GitHub Pages under `/codescape/`. The base comes only from `BASE_PATH` (set in CI)
  → vite `base`; manifest `start_url`/`scope` and the worker register path are relative, so
  never hard-code `/codescape/` anywhere else.
- `public/sw.js` is hand-written: network-first navigations, cache-first same-origin assets,
  GitHub API/raw never cached. Bump `CACHE` if the shell list changes.
- GitHub loading (`scan/scanGithub.ts`) must stay at two API calls per repo (anonymous limit
  60/hour); line counts come from raw.githubusercontent.com, which is not API-limited.
- Landing page lives in a separate repo, `AndreiBautin/codescape-demo` (one static file).
- Python on this machine defaults to cp1252: pass `encoding='utf-8'` when scripting edits.
- Every Scene implements `pin(node)` and draws flows from `ctx.graph` (module level) and
  `ctx.edges` (file level). Cycle edges are always `CYCLE_COLOR` (scenes/flow.ts).
- Resolution must not guess: when unsure, return null. Add a test per new form. (Extraction
  is regex, so imports inside comments/strings do slip through — known, documented.)
- GitHub scans stay at 2 API calls; contents come from raw.githubusercontent.com (≤700 files).
