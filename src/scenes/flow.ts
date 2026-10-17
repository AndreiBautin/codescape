import { edgesTouching, type FileEdge } from '../core/graph';
import type { TreeNode } from '../core/tree';

/** Dependency cycles are always this colour, in every mode. */
export const CYCLE_COLOR = '#ff4d6d';
export const FLOW_COLOR = '#cfe0ff';

/** Paths on the other end of every import that crosses the node's boundary. */
export function neighbourPaths(node: TreeNode, edges: readonly FileEdge[]): Set<string> {
  const inside = (p: string): boolean =>
    node.kind === 'file' ? p === node.path : node.path === '' || p.startsWith(`${node.path}/`);
  const out = new Set<string>();
  for (const e of edgesTouching(node, edges)) out.add(inside(e.from) ? e.to : e.from);
  return out;
}

/** Undirected file adjacency, for scenes that draw file-to-file links. */
export function fileAdjacency(edges: readonly FileEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  return adj;
}

export interface FlowStyle {
  readonly weight: number;
  readonly color: string;
  /** Seconds, for the moving particles. */
  readonly time: number;
  readonly alpha: number;
}

/** A gently curved link from importer `a` to imported `b`; particles travel a → b so the
 *  direction of the dependency reads without arrowheads. */
export function drawFlow(
  g: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  style: FlowStyle,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const cx = (ax + bx) / 2 - dy * 0.18;
  const cy = (ay + by) / 2 + dx * 0.18;
  const width = Math.min(6, 1.4 + Math.log2(1 + style.weight));
  g.save();
  g.globalAlpha = style.alpha * 0.6;
  g.strokeStyle = style.color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(ax, ay);
  g.quadraticCurveTo(cx, cy, bx, by);
  g.stroke();
  const particles = Math.min(6, 1 + Math.floor(Math.log2(1 + style.weight)));
  g.globalAlpha = style.alpha;
  g.fillStyle = style.color;
  g.shadowColor = style.color;
  g.shadowBlur = 10;
  for (let i = 0; i < particles; i++) {
    const t = (style.time * (90 / Math.max(80, len)) + i / particles) % 1;
    const u = 1 - t;
    const px = u * u * ax + 2 * u * t * cx + t * t * bx;
    const py = u * u * ay + 2 * u * t * cy + t * t * by;
    g.beginPath();
    g.arc(px, py, width * 0.9 + 1, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export interface LinkItem {
  readonly path: string;
  readonly x: number;
  readonly y: number;
  /** 0–1, how visible the item itself is right now. */
  readonly alpha: number;
}

/** File-to-file import links between items currently on screen. Links touching the active
 *  file or folder carry particles; the rest are a faint constellation. */
export function drawLinks(
  g: CanvasRenderingContext2D,
  items: readonly LinkItem[],
  edges: readonly FileEdge[],
  active: TreeNode | null,
  time: number,
): void {
  const at = new Map<string, LinkItem>();
  for (const it of items) if (it.alpha > 0.15) at.set(it.path, it);
  const isActive = (p: string): boolean =>
    active !== null &&
    (active.kind === 'file'
      ? p === active.path
      : active.path === '' || p.startsWith(`${active.path}/`));
  for (const e of edges) {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (!a || !b) continue;
    const lit = isActive(e.from) !== isActive(e.to);
    if (active && !lit) continue;
    drawFlow(g, a.x, a.y, b.x, b.y, {
      weight: 1,
      color: FLOW_COLOR,
      time,
      alpha: (lit ? 1 : 0.35) * Math.min(a.alpha, b.alpha),
    });
  }
}
