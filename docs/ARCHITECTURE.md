# Architecture

Four modules, one direction of dependency:

```
core/    pure model: tree, import extraction + resolution, module graph (layers, cycles),
         languages, ignore rules, pipes layout, config, rng, logger
scan/    browser filesystem → FileEntry[]           (depends on core)
scenes/  draw a DirNode + its ModuleGraph: pipes, flower box (three.js); starfield, mystify,
         flying files, beziers (canvas 2D); flow.ts / flow3d.ts draw the dependency flows
ui/      DOM, events, frame loop, inspector panel; wires scan → core → scenes
main.ts  composition root: reads the URL, the wall clock and the env, nothing else does
```

There is no domain layer in the business-rules sense — the "rules" are how a folder tree
maps onto geometry, and those live in `core/` so they can be tested without a GPU. The
boundary is enforced in `eslint.config.js`: `core/` cannot import scan/scenes/ui/three or
touch `window`/`document`; scenes and scanners cannot import ui; `Math.random`, `Date.now`
and `console` are banned outside their single owners.

## One request, end to end: "Open folder" → pipes growing

1. `src/ui/app.ts` `openFolder()` calls `window.showDirectoryPicker()` (typed in
   `src/fs-access.d.ts`).
2. `src/scan/scanFolder.ts` `scanDirectoryHandle()` walks the handle, skipping anything
   `core/ignore.ts` rejects, reading text files (≤1 MB) to `countLines()`. Capped at 20k files.
3. `app.ts` `loadScan()` → `core/tree.ts` `buildTree()` turns paths into a `DirNode` tree with
   file/line/byte totals rolled up, sorted dirs-first and heaviest-first; `summarize()` feeds
   the stats card.
4. `mount()` creates the scene for the current mode with a fresh `createRng(seed)`.
5. `scenes/pipes.ts` calls `core/pipesLayout.ts` `layoutPipes()`, which walks the tree and
   emits axis-aligned grid segments (one pipe per top-level folder, avoiding occupied cells),
   then builds a cylinder + joint mesh per segment.
6. The `tick()` loop in `app.ts` passes `dt × speed` to `scene.frame()`; pipes reveal
   `SEGMENTS_PER_SECOND` segments per pipe in parallel, hold, then regrow with new choices.
7. Pointer moves go to `scene.pointer()`, which raycasts joints and returns the `TreeNode`;
   `app.ts` renders the tooltip.

## How the architecture view is computed

1. Scanners read each source file and call `core/imports.ts` `extractImports()` (regex per
   language). GitHub scans download up to 700 files, source files first; the inspector says
   how many of the analysable files were read.
2. `ui/app.ts` `load()` → `core/graph.ts` `resolveEdges()` turns specifiers into file→file
   edges with `resolveImport()` (relative paths, index files, `.js`→`.ts`, Python packages, Go
   module suffixes, Rust `crate::`, C include suffixes, Java package paths). Externals are
   dropped.
3. Every `mount()` builds `moduleGraph(shown, edges)`: the shown folder's direct children are
   the modules; edges are aggregated with weights; Tarjan SCC finds cycles; depth over the
   condensation gives layers.
4. Scenes get `{ edges, graph }` in their context and draw module flows between their own
   anchors (pipe hubs, polygon centroids, curve midpoints, petal tips) and file links for the
   hovered or pinned node. `ui/inspector.ts` renders the same graph as text.
