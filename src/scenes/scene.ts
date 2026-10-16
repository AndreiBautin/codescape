import type { Rng } from '../core/rng';
import type { DirNode, TreeNode } from '../core/tree';

export interface Hover {
  readonly node: TreeNode;
  readonly color: string;
}

/** A screensaver. The ui owns the clock and the DOM events; a scene only draws and answers
 *  "what is under this point?". */
export interface Scene {
  resize(width: number, height: number): void;
  /** dt in seconds, already multiplied by the speed setting. */
  frame(dt: number): void;
  /** Pointer in CSS pixels relative to the canvas, or null when it leaves. */
  pointer(x: number, y: number): Hover | null;
  /** Which colour means which folder, when colour encodes folders rather than languages. */
  legend?(): readonly LegendItem[];
  dispose(): void;
}

export interface LegendItem {
  readonly label: string;
  readonly color: string;
}

export interface SceneContext {
  readonly host: HTMLElement;
  readonly root: DirNode;
  readonly rng: Rng;
}

export function formatNode(node: TreeNode): string {
  return node.kind === 'dir'
    ? `${node.files.toLocaleString()} files · ${node.lines.toLocaleString()} lines`
    : `${node.language.name} · ${node.lines.toLocaleString()} lines`;
}
