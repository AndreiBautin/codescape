import { PIPE_COLORS } from '../core/pipesLayout';
import type { DirNode, TreeNode } from '../core/tree';
import { CYCLE_COLOR, FLOW_COLOR, drawFlow } from './flow';
import { createCanvas2D } from './canvas2d';
import type { Scene, SceneContext } from './scene';

const TRAIL = 26;

interface Curve {
  readonly dir: DirNode;
  readonly color: string;
  readonly speed: number;
  readonly pts: { x: number; y: number; vx: number; vy: number }[];
  readonly history: number[][];
}

/** Beziers: each large folder is a cubic curve whose four control points drift and bounce,
 *  leaving a silky fan of past curves. Line width follows the folder's share of the code. */
export function createBeziersScene(ctx: SceneContext): Scene {
  const { canvas, g, resize } = createCanvas2D(ctx.host);
  const { rng } = ctx;
  const dirs = ctx.root.children.filter((c): c is DirNode => c.kind === 'dir').slice(0, 5);
  const groups = dirs.length > 0 ? dirs : [ctx.root];
  const total = Math.max(1, ctx.root.lines);

  let w = 1;
  let h = 1;
  const curves: Curve[] = groups.map((dir, i) => ({
    dir,
    color: PIPE_COLORS[(i + 2) % PIPE_COLORS.length] ?? '#fff',
    speed: rng.range(70, 140),
    pts: Array.from({ length: 4 }, () => {
      const a = rng.range(0, Math.PI * 2);
      return { x: rng.next(), y: rng.next(), vx: Math.cos(a), vy: Math.sin(a) };
    }),
    history: [],
  }));
  let hovered: Curve | null = null;
  let pointer: { x: number; y: number } | null = null;
  let pinned: TreeNode | null = null;
  let t = 0;
  const curveOf = new Map<number, number>();
  ctx.graph.modules.forEach((m, i) => {
    const c = curves.findIndex((cv) => cv.dir.path === m.path && m.node !== null);
    if (c >= 0) curveOf.set(i, c);
  });
  const flows = ctx.graph.edges.flatMap((e) => {
    const a = curveOf.get(e.from);
    const b = curveOf.get(e.to);
    return a === undefined || b === undefined ? [] : [{ a, b, weight: e.weight, cycle: e.inCycle }];
  });
  /** The point halfway along a curve's newest stroke. */
  const midpoint = (c: Curve): { x: number; y: number } => {
    const p = c.history[0] ?? [];
    const at = (k: number): number => p[k] ?? 0;
    return {
      x: 0.125 * at(0) + 0.375 * at(2) + 0.375 * at(4) + 0.125 * at(6),
      y: 0.125 * at(1) + 0.375 * at(3) + 0.375 * at(5) + 0.125 * at(7),
    };
  };

  const path = (p: number[]): void => {
    g.beginPath();
    g.moveTo(p[0] ?? 0, p[1] ?? 0);
    g.bezierCurveTo(p[2] ?? 0, p[3] ?? 0, p[4] ?? 0, p[5] ?? 0, p[6] ?? 0, p[7] ?? 0);
  };

  return {
    resize(width, height) {
      for (const c of curves)
        for (const p of c.pts) {
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
      g.globalCompositeOperation = 'lighter';
      for (const c of curves) {
        const slow = c === hovered ? 0.15 : 1;
        for (const p of c.pts) {
          if (pointer) {
            // Control points are drawn toward the pointer, so the curves bend to follow it.
            const dx = pointer.x - p.x;
            const dy = pointer.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d > 1 && d < 320) {
              p.vx += (dx / d) * dt * 1.6;
              p.vy += (dy / d) * dt * 1.6;
              const n = Math.hypot(p.vx, p.vy);
              p.vx /= n;
              p.vy /= n;
            }
          }
          p.x += p.vx * c.speed * slow * dt;
          p.y += p.vy * c.speed * slow * dt;
          if (p.x < 0 || p.x > w) p.vx = -p.vx;
          if (p.y < 0 || p.y > h) p.vy = -p.vy;
          p.x = Math.min(w, Math.max(0, p.x));
          p.y = Math.min(h, Math.max(0, p.y));
        }
        c.history.unshift(c.pts.flatMap((p) => [p.x, p.y]));
        if (c.history.length > TRAIL * 2) c.history.pop();
        const weight = 1 + 3 * Math.sqrt(c.dir.lines / total);
        c.history.forEach((p, i) => {
          if (i % 2 !== 0) return;
          const fade = 1 - i / c.history.length;
          g.strokeStyle = c.color;
          g.globalAlpha = fade * (c === hovered ? 0.9 : 0.55);
          g.lineWidth = i === 0 ? weight * 1.6 : weight * fade;
          g.shadowColor = c.color;
          g.shadowBlur = i === 0 ? 18 : 0;
          path(p);
          g.stroke();
        });
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.shadowBlur = 0;
      const active = hovered ?? curves.find((c) => c.dir === pinned) ?? null;
      for (const f of flows) {
        const a = curves[f.a];
        const b = curves[f.b];
        if (!a || !b) continue;
        const ma = midpoint(a);
        const mb = midpoint(b);
        drawFlow(g, ma.x, ma.y, mb.x, mb.y, {
          weight: f.weight,
          color: f.cycle ? CYCLE_COLOR : FLOW_COLOR,
          time: t,
          alpha: !active || active === a || active === b ? 0.95 : 0.15,
        });
      }
    },
    pin(node) {
      pinned = node;
    },
    pointer(x, y) {
      hovered = null;
      pointer = x < 0 ? null : { x, y };
      if (x < 0) return null;
      g.lineWidth = 16;
      for (const c of curves) {
        const p = c.history[0];
        if (!p) continue;
        path(p);
        // isPointInStroke uses the canvas transform, so convert CSS pixels to device pixels.
        const dpr = canvas.width / w;
        if (g.isPointInStroke(x * dpr, y * dpr)) {
          hovered = c;
          break;
        }
      }
      return hovered ? { node: hovered.dir, color: hovered.color } : null;
    },
    legend() {
      return curves.map((c) => ({ label: c.dir.path || c.dir.name, color: c.color }));
    },
    dispose() {
      canvas.remove();
    },
  };
}
