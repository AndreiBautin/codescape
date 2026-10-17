import { indexPaths, resolveImport } from './imports';
import type { DirNode, TreeNode } from './tree';

/** `from` imports `to`; both are file paths inside the codebase. */
export interface FileEdge {
  readonly from: string;
  readonly to: string;
}

export interface ImportSource {
  readonly path: string;
  readonly imports: readonly string[];
}

/** Resolve every file's specifiers into deduplicated in-repo edges. */
export function resolveEdges(
  files: readonly ImportSource[],
  allPaths: Iterable<string>,
): FileEdge[] {
  const index = indexPaths(allPaths);
  const seen = new Set<string>();
  const edges: FileEdge[] = [];
  for (const f of files)
    for (const spec of f.imports) {
      const to = resolveImport(f.path, spec, index);
      if (!to || to === f.path) continue;
      const key = `${f.path}\n${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: f.path, to });
    }
  return edges;
}

/** One box on the architecture diagram: a direct child of the scope (a folder), or all the
 *  scope's loose files together. */
export interface Module {
  readonly name: string;
  /** The folder this module is; null for the loose-files module. */
  readonly node: DirNode | null;
  readonly path: string;
}

export interface ModuleEdge {
  readonly from: number;
  readonly to: number;
  /** Number of file-level imports this edge stands for. */
  readonly weight: number;
  /** Both ends are in the same dependency cycle. */
  readonly inCycle: boolean;
}

export type Layer = 'entry' | 'core' | 'foundation' | 'isolated';

export interface ModuleGraph {
  readonly modules: readonly Module[];
  readonly edges: readonly ModuleEdge[];
  /** Groups of module indexes that depend on each other in a loop. */
  readonly cycles: readonly (readonly number[])[];
  /** Depth in the dependency DAG: 0 = depends on nothing here, higher = further up the stack. */
  readonly depth: readonly number[];
  readonly layer: readonly Layer[];
  readonly fanIn: readonly number[];
  readonly fanOut: readonly number[];
}

export const LOOSE = '(files)';

const inScope = (scope: DirNode, path: string): boolean =>
  scope.path === '' || path.startsWith(`${scope.path}/`);

/** Which module of `scope` a file belongs to, as an index into `modules`, or -1 if outside. */
function moduleIndexer(scope: DirNode): { modules: Module[]; of: (path: string) => number } {
  const modules: Module[] = [];
  const byName = new Map<string, number>();
  for (const c of scope.children)
    if (c.kind === 'dir') {
      byName.set(c.name, modules.length);
      modules.push({ name: c.name, node: c, path: c.path });
    }
  let loose = -1;
  const prefix = scope.path === '' ? 0 : scope.path.length + 1;
  return {
    modules,
    of(path) {
      if (!inScope(scope, path)) return -1;
      const rest = path.slice(prefix);
      const cut = rest.indexOf('/');
      if (cut >= 0) return byName.get(rest.slice(0, cut)) ?? -1;
      if (loose < 0) {
        loose = modules.length;
        modules.push({ name: LOOSE, node: null, path: scope.path });
      }
      return loose;
    },
  };
}

/** Tarjan's strongly connected components. Returns component id per node. */
function components(n: number, adj: readonly (readonly number[])[]): number[] {
  const index = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const comp = new Array<number>(n).fill(-1);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  let counter = 0;
  let next = 0;
  // Iterative to survive deep graphs without blowing the call stack.
  for (let s = 0; s < n; s++) {
    if (index[s] !== -1) continue;
    const work: [number, number][] = [[s, 0]];
    while (work.length > 0) {
      const top = work[work.length - 1] as [number, number];
      const [v, i] = top;
      if (i === 0) {
        index[v] = low[v] = counter++;
        stack.push(v);
        onStack[v] = true;
      }
      const succ = adj[v] ?? [];
      if (i < succ.length) {
        top[1] = i + 1;
        const w = succ[i] as number;
        if (index[w] === -1) work.push([w, 0]);
        else if (onStack[w]) low[v] = Math.min(low[v] as number, index[w] as number);
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low[parent[0]] = Math.min(low[parent[0]] as number, low[v] as number);
      if (low[v] === index[v]) {
        for (;;) {
          const w = stack.pop() as number;
          onStack[w] = false;
          comp[w] = next;
          if (w === v) break;
        }
        next++;
      }
    }
  }
  return comp;
}

export function moduleGraph(scope: DirNode, edges: readonly FileEdge[]): ModuleGraph {
  const { modules, of } = moduleIndexer(scope);
  const weights = new Map<string, number>();
  for (const e of edges) {
    const a = of(e.from);
    const b = of(e.to);
    if (a < 0 || b < 0 || a === b) continue;
    const key = `${a},${b}`;
    weights.set(key, (weights.get(key) ?? 0) + 1);
  }
  const n = modules.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const key of weights.keys()) {
    const [a, b] = key.split(',').map(Number) as [number, number];
    adj[a]?.push(b);
  }
  const comp = components(n, adj);
  const members = new Map<number, number[]>();
  comp.forEach((c, i) => members.set(c, [...(members.get(c) ?? []), i]));
  const cycles = [...members.values()].filter((m) => m.length > 1);

  // Depth over the condensation: a component's depth is one more than its deepest dependency.
  const compDepth = new Map<number, number>();
  const depthOf = (c: number): number => {
    const known = compDepth.get(c);
    if (known !== undefined) return known;
    compDepth.set(c, 0); // guards re-entry; condensation is acyclic so this is only a placeholder
    let d = 0;
    for (const v of members.get(c) ?? [])
      for (const w of adj[v] ?? []) {
        const cw = comp[w] as number;
        if (cw !== c) d = Math.max(d, depthOf(cw) + 1);
      }
    compDepth.set(c, d);
    return d;
  };
  const depth = comp.map((c) => depthOf(c));
  const fanOut = adj.map((a) => a.length);
  const fanIn = new Array<number>(n).fill(0);
  for (const a of adj) for (const b of a) fanIn[b] = (fanIn[b] ?? 0) + 1;
  const layer: Layer[] = depth.map((d, i) => {
    if ((fanIn[i] ?? 0) === 0 && (fanOut[i] ?? 0) === 0) return 'isolated';
    // Nothing imports it but it imports others: where execution starts.
    if ((fanIn[i] ?? 0) === 0) return 'entry';
    return d === 0 ? 'foundation' : 'core';
  });

  return {
    modules,
    edges: [...weights].map(([key, weight]) => {
      const [from, to] = key.split(',').map(Number) as [number, number];
      return { from, to, weight, inCycle: comp[from] === comp[to] };
    }),
    cycles,
    depth,
    layer,
    fanIn,
    fanOut,
  };
}

export interface NeighbourGroup {
  readonly label: string;
  readonly count: number;
}

export interface Neighbours {
  readonly dependsOn: readonly NeighbourGroup[];
  readonly usedBy: readonly NeighbourGroup[];
}

/** What a file or folder imports from outside itself, and who imports it, grouped by the
 *  other side's module in `scope` (or by file when both sides share a module). */
export function neighbours(node: TreeNode, scope: DirNode, edges: readonly FileEdge[]): Neighbours {
  const inside = (p: string): boolean =>
    node.kind === 'file' ? p === node.path : node.path === '' || p.startsWith(`${node.path}/`);
  const { modules, of } = moduleIndexer(scope);
  const own = node.kind === 'file' ? of(node.path) : of(`${node.path}/x`);
  const label = (p: string): string => {
    const m = of(p);
    if (m < 0) return p.split('/')[0] ?? p;
    if (m === own) return p.slice(p.lastIndexOf('/') + 1);
    return modules[m]?.name ?? p;
  };
  const tally = (pick: (e: FileEdge) => string | null): NeighbourGroup[] => {
    const counts = new Map<string, number>();
    for (const e of edges) {
      const p = pick(e);
      if (p !== null) counts.set(label(p), (counts.get(label(p)) ?? 0) + 1);
    }
    return [...counts]
      .map(([l, count]) => ({ label: l, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  return {
    dependsOn: tally((e) => (inside(e.from) && !inside(e.to) ? e.to : null)),
    usedBy: tally((e) => (inside(e.to) && !inside(e.from) ? e.from : null)),
  };
}

/** Edges that touch a file or folder, for highlighting on hover. */
export function edgesTouching(node: TreeNode, edges: readonly FileEdge[]): FileEdge[] {
  const inside = (p: string): boolean =>
    node.kind === 'file' ? p === node.path : node.path === '' || p.startsWith(`${node.path}/`);
  return edges.filter((e) => inside(e.from) !== inside(e.to));
}
