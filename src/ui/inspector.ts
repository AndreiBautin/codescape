import {
  LOOSE,
  neighbours,
  type FileEdge,
  type Layer,
  type ModuleGraph,
  type NeighbourGroup,
} from '../core/graph';
import type { DirNode, TreeNode } from '../core/tree';
import { formatNode } from '../scenes/scene';

export const LAYER_COLOR: Record<Layer, string> = {
  entry: '#ffd23f',
  core: '#3d8bff',
  foundation: '#2fe08d',
  isolated: '#8b93a7',
};

const LAYER_HINT: Record<Layer, string> = {
  entry: 'Entry — nothing here imports it; it starts things',
  core: 'Core — imports and is imported',
  foundation: 'Foundation — depended on, depends on nothing here',
  isolated: 'Isolated — no imports in or out at this level',
};

export interface InspectorState {
  readonly scope: DirNode;
  readonly graph: ModuleGraph;
  readonly edges: readonly FileEdge[];
  readonly selected: TreeNode | null;
  /** Source files whose imports were read, out of those that could have been. */
  readonly analysed: number;
  readonly analysable: number;
}

export interface InspectorActions {
  select(node: TreeNode | null): void;
  drill(dir: DirNode): void;
  githubUrl(path: string): string | null;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

const badge = (layer: Layer): HTMLElement => {
  const b = el('span', 'badge', layer);
  b.style.color = LAYER_COLOR[layer];
  b.style.borderColor = `${LAYER_COLOR[layer]}55`;
  b.title = LAYER_HINT[layer];
  return b;
};

const groupList = (
  title: string,
  groups: readonly NeighbourGroup[],
  empty: string,
): HTMLElement => {
  const wrap = el('div', 'insp-section');
  wrap.append(el('div', 'insp-h', title));
  if (groups.length === 0) {
    wrap.append(el('div', 'insp-empty', empty));
    return wrap;
  }
  const ul = el('ul', 'insp-list');
  const max = Math.max(...groups.map((g) => g.count));
  for (const g of groups.slice(0, 8)) {
    const li = el('li');
    const bar = el('i');
    bar.style.width = `${Math.max(6, (g.count / max) * 100)}%`;
    li.append(el('b', '', g.label), el('span', '', String(g.count)), bar);
    ul.append(li);
  }
  if (groups.length > 8) ul.append(el('li', 'insp-more', `+${groups.length - 8} more`));
  wrap.append(ul);
  return wrap;
};

const moduleName = (graph: ModuleGraph, i: number, scope: DirNode): string => {
  const m = graph.modules[i];
  return !m ? '?' : m.name === LOOSE ? `${scope.name} (files)` : m.name;
};

/** The architecture panel: an overview of the current folder's modules, or the selected
 *  file or folder's dependencies. Rebuilt from state each time — it is small. */
export function renderInspector(host: HTMLElement, s: InspectorState, act: InspectorActions): void {
  host.replaceChildren();
  const { graph, scope } = s;
  const moduleIndex = s.selected
    ? graph.modules.findIndex((m) => m.node !== null && m.node === s.selected)
    : -1;

  if (!s.selected) {
    host.append(
      el('div', 'insp-eyebrow', 'Architecture'),
      el('div', 'insp-title', scope.name || '/'),
    );
    const imports = graph.edges.reduce((n, e) => n + e.weight, 0);
    host.append(
      el(
        'div',
        'insp-meta',
        `${imports.toLocaleString()} imports across ${graph.modules.length} modules`,
      ),
    );
    if (s.analysed < s.analysable)
      host.append(
        el(
          'div',
          'insp-note',
          `Imports read from ${s.analysed.toLocaleString()} of ${s.analysable.toLocaleString()} source files.`,
        ),
      );
    if (graph.cycles.length > 0) {
      const warn = el('div', 'insp-warn');
      warn.append(
        el('b', '', `${graph.cycles.length} dependency cycle${graph.cycles.length > 1 ? 's' : ''}`),
      );
      for (const c of graph.cycles.slice(0, 4))
        warn.append(el('div', '', c.map((i) => moduleName(graph, i, scope)).join(' ⇄ ')));
      host.append(warn);
    }
    // Highest in the stack first: reading top to bottom follows the direction of dependency.
    const order = graph.modules
      .map((m, i) => ({ m, i }))
      .sort(
        (a, b) =>
          (graph.depth[b.i] ?? 0) - (graph.depth[a.i] ?? 0) ||
          (b.m.node?.lines ?? 0) - (a.m.node?.lines ?? 0),
      );
    const ul = el('ul', 'insp-modules');
    for (const { m, i } of order.slice(0, 14)) {
      const li = el('li');
      const layer = graph.layer[i] ?? 'isolated';
      li.append(
        badge(layer),
        el('b', '', moduleName(graph, i, scope)),
        el('span', 'io', `↗${graph.fanOut[i] ?? 0} ↙${graph.fanIn[i] ?? 0}`),
      );
      if (m.node) {
        const node = m.node;
        li.tabIndex = 0;
        li.title = 'Click to inspect · double-click to open';
        li.addEventListener('click', () => act.select(node));
        li.addEventListener('dblclick', () => act.drill(node));
      } else li.classList.add('static');
      ul.append(li);
    }
    host.append(
      ul,
      el('div', 'insp-hint', 'Click anything to inspect · double-click a folder to open it'),
    );
    return;
  }

  const node = s.selected;
  const back = el('button', 'insp-back', '← Overview');
  back.addEventListener('click', () => act.select(null));
  host.append(back);
  host.append(
    el('div', 'insp-eyebrow', node.kind === 'dir' ? 'Folder' : 'File'),
    el('div', 'insp-title', node.kind === 'dir' ? `${node.name}/` : node.name),
    el('div', 'insp-path', node.path || '/'),
    el('div', 'insp-meta', formatNode(node)),
  );
  if (moduleIndex >= 0) {
    const layer = graph.layer[moduleIndex] ?? 'isolated';
    const row = el('div', 'insp-layer');
    row.append(badge(layer), el('span', '', LAYER_HINT[layer]));
    host.append(row);
    const cycle = graph.cycles.find((c) => c.includes(moduleIndex));
    if (cycle) {
      const warn = el('div', 'insp-warn');
      warn.append(
        el('b', '', 'In a dependency cycle'),
        el('div', '', cycle.map((i) => moduleName(graph, i, scope)).join(' ⇄ ')),
      );
      host.append(warn);
    }
  }
  const n = neighbours(node, scope, s.edges);
  host.append(
    groupList('Depends on', n.dependsOn, 'Nothing outside itself'),
    groupList('Used by', n.usedBy, 'Nothing imports it'),
  );
  const actions = el('div', 'insp-actions');
  if (node.kind === 'dir' && node !== scope) {
    const open = el('button', 'insp-btn', 'Open folder');
    open.addEventListener('click', () => act.drill(node));
    actions.append(open);
  }
  const url = node.kind === 'file' ? act.githubUrl(node.path) : null;
  if (url) {
    const a = el('a', 'insp-btn', 'View on GitHub');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    actions.append(a);
  }
  if (actions.childElementCount > 0) host.append(actions);
}
