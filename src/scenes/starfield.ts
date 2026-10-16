import { walk, type FileNode } from '../core/tree';
import { createCanvas2D } from './canvas2d';
import type { Scene, SceneContext } from './scene';

const MAX_STARS = 1400;
const SPEED = 0.22;

interface Star {
  node: FileNode;
  x: number;
  y: number;
  z: number;
  size: number;
  px: number;
  py: number;
  sx: number;
  sy: number;
}

/** Starfield: every file is a star, coloured by language, brighter the more lines it has. */
export function createStarfieldScene(ctx: SceneContext): Scene {
  const { canvas, g, resize } = createCanvas2D(ctx.host);
  const { rng } = ctx;
  const files: FileNode[] = [];
  for (const { node } of walk(ctx.root)) if (node.kind === 'file') files.push(node);
  if (files.length === 0) throw new Error('no files');

  const maxLines = Math.max(1, ...files.map((f) => f.lines));
  const spawn = (s: Star, far: boolean): void => {
    s.x = rng.range(-1, 1);
    s.y = rng.range(-1, 1);
    s.z = far ? 1 : rng.range(0.05, 1);
    s.px = s.py = s.sx = s.sy = Number.NaN;
  };
  const stars: Star[] = Array.from(
    { length: Math.min(MAX_STARS, Math.max(400, files.length)) },
    (_, i) => {
      const node = files[i % files.length] ?? (files[0] as FileNode);
      const star: Star = {
        node,
        x: 0,
        y: 0,
        z: 1,
        size: 0.6 + 2.2 * Math.sqrt(node.lines / maxLines),
        px: 0,
        py: 0,
        sx: 0,
        sy: 0,
      };
      spawn(star, false);
      return star;
    },
  );

  let w = 1;
  let h = 1;
  // The vanishing point drifts toward the pointer, so moving the mouse steers the flight.
  let cx = 0.5;
  let cy = 0.5;
  let tx = 0.5;
  let ty = 0.5;
  let hovered: Star | null = null;

  return {
    resize(width, height) {
      w = width;
      h = height;
      resize(width, height);
      g.fillStyle = '#05060a';
      g.fillRect(0, 0, w, h);
    },
    frame(dt) {
      cx += (tx - cx) * Math.min(1, dt * 1.5);
      cy += (ty - cy) * Math.min(1, dt * 1.5);
      g.fillStyle = 'rgba(5, 6, 10, 0.32)';
      g.fillRect(0, 0, w, h);
      const f = Math.max(w, h) * 0.5;
      const ox = cx * w;
      const oy = cy * h;
      g.lineCap = 'round';
      for (const s of stars) {
        s.z -= dt * SPEED * (s === hovered ? 0.05 : 1);
        if (s.z <= 0.02) spawn(s, true);
        s.px = s.sx;
        s.py = s.sy;
        s.sx = ox + (s.x / s.z) * f;
        s.sy = oy + (s.y / s.z) * f;
        if (s.sx < -50 || s.sx > w + 50 || s.sy < -50 || s.sy > h + 50) {
          spawn(s, true);
          continue;
        }
        if (Number.isNaN(s.px)) continue;
        const near = 1 - s.z;
        g.strokeStyle = s.node.language.color;
        g.globalAlpha = Math.min(1, near * 1.4);
        g.lineWidth = s.size * (0.4 + near * 1.8);
        g.beginPath();
        g.moveTo(s.px, s.py);
        g.lineTo(s.sx, s.sy);
        g.stroke();
      }
      g.globalAlpha = 1;
      if (hovered && !Number.isNaN(hovered.sx)) {
        g.strokeStyle = hovered.node.language.color;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(hovered.sx, hovered.sy, 12, 0, Math.PI * 2);
        g.stroke();
      }
    },
    pointer(x, y) {
      if (x < 0) {
        tx = ty = 0.5;
        hovered = null;
        return null;
      }
      tx = 0.5 + (x / w - 0.5) * 0.5;
      ty = 0.5 + (y / h - 0.5) * 0.5;
      let best: Star | null = null;
      let bestD = 18 * 18;
      for (const s of stars) {
        const d = (s.sx - x) ** 2 + (s.sy - y) ** 2;
        if (d < bestD && s.z < 0.8) {
          best = s;
          bestD = d;
        }
      }
      hovered = best;
      return best ? { node: best.node, color: best.node.language.color } : null;
    },
    dispose() {
      canvas.remove();
    },
  };
}
