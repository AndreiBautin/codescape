# Codescape

**Live:** https://andreibautin.github.io/codescape/ · **Landing page:** https://andreibautin.github.io/codescape-demo/ ([repo](https://github.com/AndreiBautin/codescape-demo))

A screensaver for your source code. Point it at a folder and watch the codebase grow as
**3D Pipes**, fly past as a **Starfield**, or ribbon across the screen as **Mystify** — the
old Windows screensavers, rebuilt with glass UI and real data.

## Run it

Double-click `start-app.bat`, or:

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5391 and paste any public GitHub repo (`owner/name` or URL), or choose a local folder (Chrome or Edge for the folder picker and
drag-and-drop; other browsers fall back to an upload-style picker). `?demo=1` skips straight
to a built-in sample codebase.

**Keys:** `1` `2` `3` modes · `Space` pause · `F` fullscreen · `O` open folder · `R` reshuffle.
URL options: `repo` (e.g. `?repo=facebook/react`), `mode`, `speed` (0.1–5), `seed`, `demo`.

**Install:** in Chrome/Edge click the install icon in the address bar — it gets a desktop icon,
its own window, and opens offline (repos still need the network).

**Deploy:** every push to `main` runs `pnpm verify`, then publishes `dist/` to GitHub Pages.
Free, no server. GitHub's anonymous API limit is 60 requests/hour per visitor; each repo
load uses two.

## The idea that makes it click

The codebase becomes a tree once, in pure code (`src/core`), and each screensaver is just a
different way of drawing that tree: **a pipe is a top-level folder, a branch is a subfolder,
a joint is a file**; a star is a file coloured by language; a Mystify polygon is a folder
whose speed is its size. Everything is read locally in the browser — nothing leaves the machine.

`pnpm verify` runs typecheck, lint, format check, tests and build; it gates every push.
