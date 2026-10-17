# Testing

`pnpm test` (Vitest). Tests live beside the code as `*.test.ts`.

## What is tested, and why

- **Tree roll-ups and ordering** (`buildTree`, `summarize`) — a wrong total would still render
  something plausible; nothing else would notice.
- **Ignore rules** — scanning `node_modules` would not crash, it would just make every
  visual a picture of dependencies.
- **Config parsing** — every bad value degrades to its default with a warning; `?speed=` must
  not become speed 0 (a frozen screen that looks like a bug elsewhere).
- **Pipes layout invariants** — determinism for a seed, axis-aligned integer runs, every
  segment starts at its parent's joint (no floating pipes), contiguous growth order, and the
  segment cap.
- **Line counting** — trailing newline and CRLF handling.

- **Import extraction and resolution per language** — a wrong resolution silently draws an
  edge that does not exist, which is worse than a missing one.
- **Module graph** — weights, cycle membership (only cycle edges marked), layer classification,
  neighbour grouping; and the demo codebase is asserted to resolve in every language it
  ships and to contain exactly one known cycle, so the demo cannot quietly stop demonstrating.

## Deliberately not tested

- **Rendering output** (three.js meshes, canvas strokes). Pixel tests are brittle and the
  failure mode is visible the moment you look; checked by eye in the browser instead.
- **The File System Access walk** (`scanDirectoryHandle`). It is thin glue over a
  Chromium-only API with no faithful in-process fake; the logic it calls (ignore rules,
  line counting, tree building) is tested.
- **UI wiring in `ui/app.ts`** — DOM event plumbing, verified manually.
- **Import parsing against real-world edge cases** (imports inside strings or comments, macro
  includes, build-tool path aliases beyond `@/` and `~/`). The regexes are a deliberate
  trade against shipping parsers. The usual failure is a missing edge (the inspector reports
  coverage); a commented-out import is the known case that adds a false one.
