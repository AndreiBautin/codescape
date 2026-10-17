# Codescape

**Live:** https://andreibautin.github.io/codescape/ · **Landing page:** https://andreibautin.github.io/codescape-demo/ ([repo](https://github.com/AndreiBautin/codescape-demo))

A way to understand a codebase's architecture that is actually enjoyable to look at. Point it at
any public GitHub repo (or a local folder) and it reads the imports, works out which modules
depend on which, finds dependency cycles, and draws it all as one of six classic Microsoft
screensavers: **3D Pipes**, **Starfield**, **Mystify**, **Flying Windows** (as Flying Files),
**Beziers** and **3D Flower Box**.

## Run it

Double-click `start-app.bat`, or:

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5391 and paste any public GitHub repo (`owner/name` or URL), or choose a local folder (Chrome or Edge for the folder picker and
drag-and-drop; other browsers fall back to an upload-style picker). `?demo=1` skips straight
to a built-in sample codebase.

**Keys:** `1`–`6` modes · `Esc` back out · `Space` pause · `F` fullscreen · `O` open folder · `R` reshuffle.
URL options: `repo` (e.g. `?repo=facebook/react`), `mode`, `speed` (0.1–5), `seed`, `demo`.

**Install:** in Chrome/Edge click the install icon in the address bar — it gets a desktop icon,
its own window, and opens offline (repos still need the network).

**Deploy:** every push to `main` runs `pnpm verify`, then publishes `dist/` to GitHub Pages.
Free, no server. GitHub's anonymous API limit is 60 requests/hour per visitor; each repo
load uses two.

## The idea that makes it click

The codebase becomes two things once, in pure code (`src/core`): a **folder tree** and an
**import graph** rolled up to modules. Every screensaver is just a different way of drawing
those two — a pipe per folder, a star or flying window per file, a ribbon per module — with
the dependencies as particle flows between them (importer → imported, cycles in red). The
inspector says what the picture means: each module's layer (entry / core / foundation),
what it depends on, what uses it. Click to inspect, double-click a folder to go inside.

Imports are read with per-language regexes for TS/JS, Python, Go, Rust, C/C++ and
Java/Kotlin — deliberately, instead of shipping a parser per language. It errs toward missing
an edge; the one known way it invents one is an import inside a comment or string.

`pnpm verify` runs typecheck, lint, format check, tests and build; it gates every push.
