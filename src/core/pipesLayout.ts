import type { Rng } from './rng';
import type { DirNode, TreeNode } from './tree';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One straight run of pipe on the integer grid, ending at the joint that represents `node`. */
export interface Segment {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly pipe: number;
  /** Position in its pipe's growth order — pipes grow in parallel, each in this order. */
  readonly order: number;
  readonly node: TreeNode;
}

export interface Pipe {
  readonly name: string;
  readonly color: string;
  readonly length: number;
}

export interface PipesLayout {
  readonly segments: readonly Segment[];
  readonly pipes: readonly Pipe[];
  /** Half-width of the grid cube the layout stays inside. */
  readonly bound: number;
}

/** The 1990s palette, tuned up a little so it sits on a dark glass background. */
export const PIPE_COLORS = [
  '#ff3b5c',
  '#2fe08d',
  '#3d8bff',
  '#ffd23f',
  '#28e0e8',
  '#d65cff',
  '#ff8a3d',
  '#e8ecf5',
] as const;

const DIRS: readonly Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

const key = (v: Vec3): string => `${v.x},${v.y},${v.z}`;
const add = (a: Vec3, d: Vec3, n: number): Vec3 => ({
  x: a.x + d.x * n,
  y: a.y + d.y * n,
  z: a.z + d.z * n,
});

export interface PipesOptions {
  /** Hard cap on segments, so a monorepo does not produce a million meshes. */
  readonly maxSegments: number;
  /** At most this many files drawn per directory (the largest ones). */
  readonly maxFilesPerDir: number;
}

export const DEFAULT_PIPES_OPTIONS: PipesOptions = { maxSegments: 1600, maxFilesPerDir: 18 };

export function layoutPipes(
  root: DirNode,
  rng: Rng,
  options: PipesOptions = DEFAULT_PIPES_OPTIONS,
): PipesLayout {
  // Each top-level directory is its own pipe; loose top-level files share a pipe named after the root.
  const groups: { name: string; nodes: TreeNode[] }[] = [];
  const loose: TreeNode[] = [];
  for (const child of root.children) {
    if (child.kind === 'dir' && groups.length < PIPE_COLORS.length - 1)
      groups.push({ name: child.name, nodes: [child] });
    else loose.push(child);
  }
  if (loose.length > 0) groups.push({ name: root.name, nodes: loose });

  const budget = Math.min(options.maxSegments, root.files + countDirs(root));
  const bound = Math.max(6, Math.ceil(Math.cbrt(budget) * 2.2));
  const occupied = new Set<string>();
  const segments: Segment[] = [];
  const lengths: number[] = [];

  const inBounds = (v: Vec3): boolean =>
    Math.abs(v.x) <= bound && Math.abs(v.y) <= bound && Math.abs(v.z) <= bound;

  /** Pick a direction and run length that does not collide; fall back to any in-bounds move. */
  const step = (at: Vec3, last: Vec3 | null): { dir: Vec3; len: number } => {
    const choices = DIRS.filter(
      (d) => !last || d.x !== -last.x || d.y !== -last.y || d.z !== -last.z,
    );
    for (let attempt = 0; attempt < 10; attempt++) {
      const dir = rng.pick(choices);
      const len = rng.int(2, 5);
      let free = true;
      for (let i = 1; i <= len && free; i++) {
        const c = add(at, dir, i);
        free = inBounds(c) && !occupied.has(key(c));
      }
      if (free) return { dir, len };
    }
    const inside = choices.filter((d) => inBounds(add(at, d, 2)));
    return { dir: rng.pick(inside.length > 0 ? inside : DIRS), len: 2 };
  };

  groups.forEach((group, pipe) => {
    let order = 0;
    const start: Vec3 = {
      x: rng.int(-bound + 2, bound - 2),
      y: rng.int(-bound + 2, bound - 2),
      z: rng.int(-bound + 2, bound - 2),
    };
    occupied.add(key(start));

    const grow = (node: TreeNode, at: Vec3, last: Vec3 | null): void => {
      if (segments.length >= budget) return;
      const { dir, len } = step(at, last);
      const to = add(at, dir, len);
      for (let i = 1; i <= len; i++) occupied.add(key(add(at, dir, i)));
      segments.push({ from: at, to, pipe, order: order++, node });
      if (node.kind !== 'dir') return;
      let files = 0;
      for (const child of node.children) {
        if (child.kind === 'file' && ++files > options.maxFilesPerDir) break;
        grow(child, to, dir);
      }
    };
    for (const node of group.nodes) grow(node, start, null);
    lengths.push(order);
  });

  return {
    segments,
    bound,
    pipes: groups.map((g, i) => ({
      name: g.name,
      color: PIPE_COLORS[i % PIPE_COLORS.length] ?? '#ffffff',
      length: lengths[i] ?? 0,
    })),
  };
}

function countDirs(dir: DirNode): number {
  let n = 0;
  for (const c of dir.children) if (c.kind === 'dir') n += 1 + countDirs(c);
  return n;
}
