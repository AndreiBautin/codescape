import { extensionOf } from '../core/languages';
import { walk, type FileNode, type TreeNode } from '../core/tree';
import { drawLinks, fileAdjacency } from './flow';
import { createCanvas2D } from './canvas2d';
import type { Scene, SceneContext } from './scene';

const COUNT = 70;
const SPEED = 0.16;

interface Card {
  node: FileNode;
  x: number;
  y: number;
  z: number;
  spin: number;
  sx: number;
  sy: number;
  size: number;
}

/** Flying Windows, but every window is a file: a little document icon in its language's colour,
 *  labelled with its extension, tumbling out of the dark. */
export function createFlyingFilesScene(ctx: SceneContext): Scene {
  const { canvas, g, resize } = createCanvas2D(ctx.host);
  const { rng } = ctx;
  const files: FileNode[] = [];
  for (const { node } of walk(ctx.root)) if (node.kind === 'file') files.push(node);
  if (files.length === 0) throw new Error('no files');

  const byPath = new Map(files.map((f) => [f.path, f]));
  const adjacency = fileAdjacency(ctx.edges);
  const linked = files.filter((f) => adjacency.has(f.path));
  // Half the time, launch a file that an on-screen card imports or is imported by, so the
  // dependency links have something to connect; otherwise any file that has links at all.
  const nextFile = (): FileNode => {
    const anchor = cards.length > 0 ? rng.pick(cards).node : null;
    const near = anchor ? (adjacency.get(anchor.path) ?? []) : [];
    if (near.length > 0 && rng.next() < 0.5) return byPath.get(rng.pick(near)) ?? rng.pick(files);
    return linked.length > 0 && rng.next() < 0.7 ? rng.pick(linked) : rng.pick(files);
  };
  const cards: Card[] = [];
  const reset = (c: Card, far: boolean): void => {
    c.node = nextFile();
    c.x = rng.range(-1.2, 1.2);
    c.y = rng.range(-0.9, 0.9);
    c.z = far ? 1 : rng.range(0.1, 1);
    c.spin = rng.range(-1, 1);
  };
  for (let i = 0; i < COUNT; i++) {
    const c: Card = {
      node: rng.pick(files),
      x: 0,
      y: 0,
      z: 1,
      spin: 0,
      sx: -1e4,
      sy: -1e4,
      size: 0,
    };
    reset(c, false);
    cards.push(c);
  }

  let w = 1;
  let h = 1;
  let t = 0;
  let hovered: Card | null = null;
  let pinned: TreeNode | null = null;
  let cx = 0.5;
  let cy = 0.5;
  let tx = 0.5;
  let ty = 0.5;

  const drawCard = (c: Card): void => {
    const s = c.size;
    const color = c.node.language.color;
    g.save();
    g.translate(c.sx, c.sy);
    g.rotate(Math.sin(t * 0.7 + c.spin * 4) * 0.25 * c.spin);
    g.globalAlpha = Math.min(1, (1 - c.z) * 1.6);
    const fold = s * 0.28;
    // Page with a folded corner.
    g.beginPath();
    g.moveTo(-s / 2, -s * 0.65);
    g.lineTo(s / 2 - fold, -s * 0.65);
    g.lineTo(s / 2, -s * 0.65 + fold);
    g.lineTo(s / 2, s * 0.65);
    g.lineTo(-s / 2, s * 0.65);
    g.closePath();
    const grad = g.createLinearGradient(0, -s * 0.65, 0, s * 0.65);
    grad.addColorStop(0, color);
    grad.addColorStop(1, '#10131c');
    g.fillStyle = grad;
    g.shadowColor = color;
    g.shadowBlur = c === hovered ? 30 : 12;
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.moveTo(s / 2 - fold, -s * 0.65);
    g.lineTo(s / 2 - fold, -s * 0.65 + fold);
    g.lineTo(s / 2, -s * 0.65 + fold);
    g.closePath();
    g.fill();
    // Code lines.
    g.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 4; i++)
      g.fillRect(-s * 0.32, -s * 0.15 + i * s * 0.16, s * (0.35 + ((i * 37) % 30) / 100), s * 0.05);
    const ext = extensionOf(c.node.path);
    if (s > 26 && ext) {
      g.fillStyle = '#fff';
      g.font = `600 ${Math.round(s * 0.2)}px 'JetBrains Mono', monospace`;
      g.textAlign = 'center';
      g.fillText(`.${ext}`.slice(0, 6), 0, -s * 0.28);
    }
    if (c === hovered) {
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.strokeRect(-s / 2 - 6, -s * 0.65 - 6, s + 12, s * 1.3 + 12);
    }
    g.restore();
  };

  return {
    resize(width, height) {
      w = width;
      h = height;
      resize(width, height);
    },
    frame(dt) {
      t += dt;
      cx += (tx - cx) * Math.min(1, dt * 1.5);
      cy += (ty - cy) * Math.min(1, dt * 1.5);
      g.fillStyle = '#05060a';
      g.fillRect(0, 0, w, h);
      const f = Math.min(w, h) * 0.7;
      for (const c of cards) {
        c.z -= dt * SPEED * (c === hovered ? 0.05 : 1);
        if (c.z <= 0.04) reset(c, true);
        c.sx = cx * w + (c.x / c.z) * f;
        c.sy = cy * h + (c.y / c.z) * f;
        c.size = 26 / c.z;
        if (
          c.sx < -c.size * 2 ||
          c.sx > w + c.size * 2 ||
          c.sy < -c.size * 2 ||
          c.sy > h + c.size * 2
        )
          reset(c, true);
      }
      // Far cards first so near ones overlap them.
      for (const c of [...cards].sort((a, b) => b.z - a.z)) drawCard(c);
      g.globalAlpha = 1;
      drawLinks(
        g,
        cards.map((c) => ({
          path: c.node.path,
          x: c.sx,
          y: c.sy,
          alpha: Math.min(1, (1 - c.z) * 1.6),
        })),
        ctx.edges,
        hovered?.node ?? pinned,
        t,
      );
    },
    pointer(x, y) {
      hovered = null;
      if (x < 0) {
        tx = ty = 0.5;
        return null;
      }
      // The windows fly away from the pointer, so moving the mouse steers the flight.
      tx = 0.5 + (x / w - 0.5) * 0.5;
      ty = 0.5 + (y / h - 0.5) * 0.5;
      let best = Infinity;
      for (const c of cards) {
        if (Math.abs(c.sx - x) < c.size / 2 && Math.abs(c.sy - y) < c.size * 0.65 && c.z < best) {
          best = c.z;
          hovered = c;
        }
      }
      return hovered ? { node: hovered.node, color: hovered.node.language.color } : null;
    },
    pin(node) {
      pinned = node;
    },
    dispose() {
      canvas.remove();
    },
  };
}
