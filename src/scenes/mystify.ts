import { PIPE_COLORS } from '../core/pipesLayout';
import type { DirNode, TreeNode } from '../core/tree';
import { CYCLE_COLOR, FLOW_COLOR, drawFlow } from './flow';
import { createCanvas2D } from './canvas2d';
import type { Scene, SceneContext } from './scene';

const TRAIL = 14;
const VERTICES = 4;

interface Shape {
  readonly dir: DirNode;
  readonly color: string;
  readonly speed: number;
  readonly pts: { x: number; y: number; vx: number; vy: number }[];
  readonly history: { x: number; y: number }[][];
}

/** Mystify: each of the largest directories is a bouncing polygon. Bigger folders move faster
 *  and leave longer ribbons. */
export function createMystifyScene(ctx: SceneContext): Scene {
  const { canvas, g, resize } = createCanvas2D(ctx.host);
  const { rng } = ctx;
  const dirs = ctx.root.children.filter((c): c is DirNode => c.kind === 'dir').slice(0, 6);
  const groups = dirs.length >= 2 ? dirs : [ctx.root, ctx.root];
  const maxLines = Math.max(1, ...groups.map((d) => d.lines));

  let w = 1;
  let h = 1;
  const shapes: Shape[] = groups.map((dir, i) => ({
    dir,
    color: PIPE_COLORS[i % PIPE_COLORS.length] ?? '#fff',
    speed: 90 + 160 * Math.sqrt(dir.lines / maxLines),
    pts: Array.from({ length: VERTICES }, () => {
      const a = rng.range(0, Math.PI * 2);
      return { x: rng.next(), y: rng.next(), vx: Math.cos(a), vy: Math.sin(a) };
    }),
    history: [],
  }));
  let pointer: { x: number; y: number } | null = null;
  let hovered: Shape | null = null;
  let pinned: TreeNode | null = null;
  let t = 0;
  // Module edges between the folders that have a shape; drawn centroid to centroid.
  const shapeOf = new Map<number, number>();
  ctx.graph.modules.forEach((m, i) => {
    const s = shapes.findIndex((sh) => sh.dir.path === m.path && m.node !== null);
    if (s >= 0) shapeOf.set(i, s);
  });
  const flows = ctx.graph.edges.flatMap((e) => {
    const a = shapeOf.get(e.from);
    const b = shapeOf.get(e.to);
    return a === undefined || b === undefined ? [] : [{ a, b, weight: e.weight, cycle: e.inCycle }];
  });
  const centroid = (s: Shape): { x: number; y: number } => ({
    x: s.pts.reduce((n, p) => n + p.x, 0) / s.pts.length,
    y: s.pts.reduce((n, p) => n + p.y, 0) / s.pts.length,
  });

  return {
    resize(width, height) {
      // Points are stored in pixels after the first resize; scale them on later ones.
      for (const s of shapes)
        for (const p of s.pts) {
          p.x = w === 1 ? p.x * width : (p.x / w) * width;
          p.y = h === 1 ? p.y * height : (p.y / h) * height;
        }
      w = width;
      h = height;
      resize(width, height);
    },
    frame(dt) {
      t += dt;
      g.fillStyle = '#05060a';
      g.fillRect(0, 0, w, h);
      for (const s of shapes) {
        const slow = s === hovered ? 0.15 : 1;
        for (const p of s.pts) {
          if (pointer) {
            // The pointer gently repels the vertices, so the ribbons part around it.
            const dx = p.x - pointer.x;
            const dy = p.y - pointer.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 160 * 160 && d2 > 1) {
              const d = Math.sqrt(d2);
              p.vx += (dx / d) * dt * 3;
              p.vy += (dy / d) * dt * 3;
              const n = Math.hypot(p.vx, p.vy);
              p.vx /= n;
              p.vy /= n;
            }
          }
          p.x += p.vx * s.speed * slow * dt;
          p.y += p.vy * s.speed * slow * dt;
          if (p.x < 0 || p.x > w) p.vx = -p.vx;
          if (p.y < 0 || p.y > h) p.vy = -p.vy;
          p.x = Math.min(w, Math.max(0, p.x));
          p.y = Math.min(h, Math.max(0, p.y));
        }
        s.history.unshift(s.pts.map((p) => ({ x: p.x, y: p.y })));
        if (s.history.length > TRAIL * 3) s.history.pop();

        g.lineJoin = 'round';
        s.history.forEach((poly, i) => {
          if (i % 3 !== 0) return;
          g.globalAlpha = (1 - i / s.history.length) * (s === hovered ? 1 : 0.85);
          g.strokeStyle = s.color;
          g.lineWidth = i === 0 ? 2.2 : 1.2;
          g.shadowColor = s.color;
          g.shadowBlur = i === 0 ? 14 : 0;
          g.beginPath();
          poly.forEach((p, j) => (j === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
          g.closePath();
          g.stroke();
        });
      }
      g.globalAlpha = 1;
      g.shadowBlur = 0;
      const active = hovered ?? shapes.find((s) => s.dir === pinned) ?? null;
      for (const f of flows) {
        const a = shapes[f.a];
        const b = shapes[f.b];
        if (!a || !b) continue;
        const ca = centroid(a);
        const cb = centroid(b);
        const lit = !active || active === a || active === b;
        drawFlow(g, ca.x, ca.y, cb.x, cb.y, {
          weight: f.weight,
          color: f.cycle ? CYCLE_COLOR : FLOW_COLOR,
          time: t,
          alpha: lit ? 0.95 : 0.15,
        });
      }
    },
    pin(node) {
      pinned = node;
    },
    pointer(x, y) {
      if (x < 0) {
        pointer = null;
        hovered = null;
        return null;
      }
      pointer = { x, y };
      hovered = null;
      let best = 14;
      for (const s of shapes) {
        const poly = s.pts;
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i];
          const b = poly[(i + 1) % poly.length];
          if (!a || !b) continue;
          const d = distToSegment(x, y, a.x, a.y, b.x, b.y);
          if (d < best) {
            best = d;
            hovered = s;
          }
        }
      }
      return hovered ? { node: hovered.dir, color: hovered.color } : null;
    },
    legend() {
      return shapes.map((s) => ({ label: s.dir.path || s.dir.name, color: s.color }));
    },
    dispose() {
      canvas.remove();
    },
  };
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
