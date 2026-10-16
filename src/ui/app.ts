import { MODES, isMode, type Config, type Mode } from '../core/config';
import { demoCodebase } from '../core/demo';
import { formatRepo, parseRepo, type RepoRef } from '../core/github';
import type { Logger } from '../core/log';
import { createRng } from '../core/rng';
import { buildTree, summarize, type DirNode } from '../core/tree';
import { GithubError, scanGithubRepo } from '../scan/scanGithub';
import { scanDirectoryHandle, scanFileList, type ScanResult } from '../scan/scanFolder';
import { createMystifyScene } from '../scenes/mystify';
import { createPipesScene } from '../scenes/pipes';
import { formatNode, type Scene, type SceneContext } from '../scenes/scene';
import { createStarfieldScene } from '../scenes/starfield';
import { createBeziersScene } from '../scenes/beziers';
import { createFlowerBoxScene } from '../scenes/flowerBox';
import { createFlyingFilesScene } from '../scenes/flyingFiles';

const IDLE_MS = 3000;

const FACTORIES: Record<Mode, (ctx: SceneContext) => Scene> = {
  pipes: createPipesScene,
  starfield: createStarfieldScene,
  mystify: createMystifyScene,
  windows: createFlyingFilesScene,
  beziers: createBeziersScene,
  flowerbox: createFlowerBoxScene,
};

export interface AppDeps {
  readonly config: Config;
  readonly seed: number;
  readonly log: Logger;
  /** Monotonic milliseconds — the only clock the app reads. */
  readonly now: () => number;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const compact = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString();

export function startApp(deps: AppDeps): void {
  const { log, now } = deps;
  const stage = $('stage');
  const tooltip = $('tooltip');
  const welcome = $('welcome');
  const status = $('welcome-status');
  const folderInput = $<HTMLInputElement>('folder-input');

  let mode: Mode = deps.config.mode;
  let root: DirNode | null = null;
  /** The folder currently drilled into; null = the whole codebase. */
  let focus: DirNode | null = null;
  let repoRef: RepoRef | null = null;
  let scene: Scene | null = null;
  let paused = false;
  let seed = deps.seed;

  const mount = (): void => {
    if (!root) return;
    scene?.dispose();
    stage.replaceChildren();
    // A fresh rng per mount so switching modes back and forth replays the same scene.
    const shown = focus ?? root;
    scene = FACTORIES[mode]({ host: stage, root: shown, rng: createRng(seed) });
    renderCrumbs();
    renderLegend(shown);
    scene.resize(window.innerWidth, window.innerHeight);
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))
      b.setAttribute('aria-selected', String(b.dataset['mode'] === mode));
    log.info('scene.mounted', { mode: MODES.indexOf(mode), files: root.files });
  };

  const load = (tree: DirNode): void => {
    root = tree;
    focus = null;
    const s = summarize(tree);
    $('root-name').textContent = tree.name;
    $('s-files').textContent = compact(s.files);
    $('s-lines').textContent = compact(s.lines);
    $('s-dirs').textContent = compact(s.dirs);
    const total = Math.max(1, s.lines);
    $('langbar').replaceChildren(
      ...s.languages.map((l) => {
        const span = document.createElement('span');
        span.style.flex = String(l.lines / total);
        span.style.background = l.language.color;
        return span;
      }),
    );
    $('stats').hidden = false;
    $('dock').hidden = false;
    welcome.classList.add('gone');
    mount();
  };

  const legendRow = (label: string, color: string, value: string): HTMLLIElement => {
    const li = document.createElement('li');
    const dot = document.createElement('i');
    dot.style.background = dot.style.color = color;
    const name = document.createElement('b');
    name.textContent = label;
    const pct = document.createElement('span');
    pct.textContent = value;
    li.append(dot, name, pct);
    return li;
  };

  /** Folder colours when the scene encodes folders; languages otherwise. */
  const renderLegend = (shown: DirNode): void => {
    const folders = scene?.legend?.();
    const total = Math.max(1, shown.lines);
    $('legend-title').textContent = folders ? 'Folders' : 'Languages';
    $('legend').replaceChildren(
      ...(folders
        ? folders.slice(0, 8).map((f) => legendRow(f.label, f.color, ''))
        : summarize(shown)
            .languages.slice(0, 5)
            .map((l) =>
              legendRow(
                l.language.name,
                l.language.color,
                `${Math.round((l.lines / total) * 100)}%`,
              ),
            )),
    );
  };

  /** Folders from the root down to `target`, inclusive. */
  const chainTo = (target: DirNode | null): DirNode[] => {
    if (!root) return [];
    const chain: DirNode[] = [root];
    if (!target) return chain;
    let at: DirNode = root;
    for (const part of target.path.split('/')) {
      const next = at.children.find((c): c is DirNode => c.kind === 'dir' && c.name === part);
      if (!next) break;
      chain.push(next);
      at = next;
    }
    return chain;
  };

  const parentOf = (d: DirNode): DirNode | null => {
    const chain = chainTo(d);
    const parent = chain[chain.length - 2];
    return !parent || parent === root ? null : parent;
  };

  /** Breadcrumb from the root to the focused folder; each crumb climbs back up. */
  const renderCrumbs = (): void => {
    const el = $('root-name');
    el.replaceChildren();
    const chain = chainTo(focus);
    chain.forEach((d, i) => {
      if (i > 0) el.append(' / ');
      const b = document.createElement('button');
      b.className = 'crumb';
      b.textContent = d.name;
      b.disabled = i === chain.length - 1;
      b.addEventListener('click', () => {
        focus = d === root ? null : d;
        mount();
      });
      el.append(b);
    });
  };

  const githubUrl = (path: string): string | null =>
    repoRef
      ? `https://github.com/${repoRef.owner}/${repoRef.repo}/blob/${repoRef.ref ?? 'HEAD'}/${path}`
      : null;

  /** Click a folder to drill into it; click a file to open it on GitHub. */
  stage.addEventListener('click', (e) => {
    const hit = scene?.pointer(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.node.kind === 'dir' && hit.node.children.length > 0 && hit.node !== (focus ?? root)) {
      focus = hit.node;
      mount();
    } else if (hit.node.kind === 'file') {
      const url = githubUrl(hit.node.path);
      if (url) window.open(url, '_blank', 'noopener');
    }
  });

  const loadScan = (result: ScanResult): void => {
    log.info('scan.done', { files: result.entries.length, truncated: result.truncated });
    if (result.entries.length === 0) {
      status.textContent = 'That folder has no source files we could read.';
      welcome.classList.remove('gone');
      return;
    }
    load(buildTree(result.rootName, result.entries));
  };

  const progress = (p: { files: number }): void => {
    status.textContent = `Reading… ${p.files.toLocaleString()} files`;
  };

  const scanFailed = (err: unknown): void => {
    // AbortError = the user closed the picker; not a failure worth reporting.
    if (err instanceof DOMException && err.name === 'AbortError') return;
    log.error('scan.failed');
    status.textContent = 'Could not read that folder. Try another, or watch the demo.';
  };

  const openFolder = async (): Promise<void> => {
    if (!('showDirectoryPicker' in window)) {
      folderInput.click();
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      welcome.classList.remove('gone');
      status.textContent = 'Reading…';
      setRepoParam(null);
      loadScan(await scanDirectoryHandle(handle, progress));
    } catch (err) {
      scanFailed(err);
    }
  };

  folderInput.addEventListener('change', () => {
    const files = folderInput.files;
    if (!files || files.length === 0) return;
    welcome.classList.remove('gone');
    scanFileList(files, progress).then(loadScan, scanFailed);
  });

  /** Keep the address bar shareable: a loaded repo is in the URL, a local folder is not. */
  const setRepoParam = (repo: RepoRef | null): void => {
    if (!repo) repoRef = null;
    const url = new URL(window.location.href);
    if (repo) url.searchParams.set('repo', formatRepo(repo));
    else url.searchParams.delete('repo');
    window.history.replaceState(null, '', url);
  };

  let loadingRepo = false;
  const loadRepo = async (input: string): Promise<void> => {
    const repo = parseRepo(input);
    if (!repo) {
      welcome.classList.remove('gone');
      status.textContent = 'Enter a public repo as owner/name or paste its GitHub URL.';
      return;
    }
    if (loadingRepo) return;
    loadingRepo = true;
    welcome.classList.remove('gone');
    status.textContent = `Fetching ${formatRepo(repo)} from GitHub…`;
    try {
      const result = await scanGithubRepo(repo, (p) => {
        status.textContent = `Counting lines… ${p.files.toLocaleString()} files`;
      });
      setRepoParam(repo);
      repoRef = repo;
      loadScan(result);
    } catch (err) {
      log.warn('github.failed', {
        rateLimited: err instanceof GithubError && err.reason === 'rate-limited',
      });
      status.textContent =
        err instanceof GithubError ? err.message : 'Could not load that repository.';
    } finally {
      loadingRepo = false;
    }
  };

  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-repo-form]'))
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      if (input) void loadRepo(input.value);
    });
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-example]'))
    b.addEventListener('click', () => void loadRepo(b.dataset['example'] ?? ''));

  const loadDemo = (): void => {
    setRepoParam(null);
    load(buildTree('demo-monorepo', demoCodebase(createRng(seed))));
  };

  const setMode = (m: Mode): void => {
    if (m === mode && scene) return;
    mode = m;
    mount();
  };

  const togglePause = (): void => {
    paused = !paused;
    $('btn-pause').textContent = paused ? 'Resume' : 'Pause';
  };

  const toggleFull = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  $('welcome-open').addEventListener('click', () => void openFolder());
  $('welcome-demo').addEventListener('click', loadDemo);
  $('btn-open').addEventListener('click', () => void openFolder());
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-full').addEventListener('click', toggleFull);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))
    b.addEventListener('click', () => {
      const m = b.dataset['mode'];
      if (isMode(m)) setMode(m);
    });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const m = MODES[Number(e.key) - 1];
    if (m && root) setMode(m);
    else if ((e.key === 'Escape' || e.key === 'Backspace') && focus && root) {
      focus = parentOf(focus);
      mount();
    } else if (e.key === ' ' && root) {
      e.preventDefault();
      togglePause();
    } else if (e.key === 'f' || e.key === 'F') toggleFull();
    else if (e.key === 'o' || e.key === 'O') void openFolder();
    else if ((e.key === 'r' || e.key === 'R') && root) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      mount();
    }
  });

  // Drag and drop a folder (Chromium exposes it as a directory handle).
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('dragging');
  });
  window.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    const item = e.dataTransfer?.items[0];
    if (!item || !('getAsFileSystemHandle' in item)) return;
    void (async () => {
      try {
        const handle: unknown = await item.getAsFileSystemHandle();
        if (!(handle instanceof FileSystemDirectoryHandle)) {
          status.textContent = 'Drop a folder, not a file.';
          return;
        }
        welcome.classList.remove('gone');
        loadScan(await scanDirectoryHandle(handle, progress));
      } catch (err) {
        scanFailed(err);
      }
    })();
  });

  // Idle detection: chrome fades away like a real screensaver.
  let lastMove = now();
  const showTooltip = (x: number, y: number): void => {
    const hit = scene?.pointer(x, y) ?? null;
    if (!hit) {
      tooltip.hidden = true;
      return;
    }
    tooltip.hidden = false;
    $('tt-name').textContent = hit.node.kind === 'dir' ? `${hit.node.name}/` : hit.node.name;
    $('tt-path').textContent = hit.node.path || '/';
    $('tt-meta').textContent = formatNode(hit.node);
    const dot = tooltip.querySelector<HTMLElement>('.dot');
    if (dot) dot.style.background = dot.style.color = hit.color;
    const pad = 380;
    tooltip.style.left = `${Math.min(x, window.innerWidth - pad)}px`;
    tooltip.style.top = `${Math.min(y, window.innerHeight - 120)}px`;
  };
  let pointerX = -1;
  let pointerY = -1;
  window.addEventListener('pointermove', (e) => {
    lastMove = now();
    document.body.classList.remove('idle');
    pointerX = e.clientX;
    pointerY = e.clientY;
  });
  document.addEventListener('pointerleave', () => {
    pointerX = pointerY = -1;
    scene?.pointer(-1, -1);
    tooltip.hidden = true;
  });
  window.addEventListener('resize', () => scene?.resize(window.innerWidth, window.innerHeight));

  let last = now();
  const tick = (): void => {
    const t = now();
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (scene) {
      if (root && t - lastMove > IDLE_MS) {
        document.body.classList.add('idle');
        tooltip.hidden = true;
      } else if (pointerX >= 0) showTooltip(pointerX, pointerY);
      if (!paused) scene.frame(dt * deps.config.speed);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  if (deps.config.repo) void loadRepo(formatRepo(deps.config.repo));
  else if (deps.config.demo) loadDemo();
}
