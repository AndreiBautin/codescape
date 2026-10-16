import { languageOf, type Language } from './languages';

/** One scanned file, as reported by a scanner. Paths are slash-separated and relative to the root. */
export interface FileEntry {
  readonly path: string;
  readonly bytes: number;
  readonly lines: number;
}

export interface FileNode {
  readonly kind: 'file';
  readonly name: string;
  readonly path: string;
  readonly bytes: number;
  readonly lines: number;
  readonly language: Language;
}

export interface DirNode {
  readonly kind: 'dir';
  readonly name: string;
  readonly path: string;
  readonly children: TreeNode[];
  files: number;
  lines: number;
  bytes: number;
}

export type TreeNode = FileNode | DirNode;

const parentOf = (path: string): string => {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
};

const newDir = (name: string, path: string): DirNode => ({
  kind: 'dir',
  name,
  path,
  children: [],
  files: 0,
  lines: 0,
  bytes: 0,
});

export function buildTree(rootName: string, entries: readonly FileEntry[]): DirNode {
  const root = newDir(rootName, '');
  const dirs = new Map<string, DirNode>([['', root]]);

  const dirFor = (path: string): DirNode => {
    const existing = dirs.get(path);
    if (existing) return existing;
    const parent = dirFor(parentOf(path));
    const dir = newDir(path.slice(path.lastIndexOf('/') + 1), path);
    parent.children.push(dir);
    dirs.set(path, dir);
    return dir;
  };

  for (const e of entries) {
    const parentPath = parentOf(e.path);
    dirFor(parentPath).children.push({
      kind: 'file',
      name: e.path.slice(e.path.lastIndexOf('/') + 1),
      path: e.path,
      bytes: e.bytes,
      lines: e.lines,
      language: languageOf(e.path),
    });
    // Roll totals up through every ancestor, root included.
    let p = parentPath;
    for (;;) {
      const d = dirs.get(p);
      if (d) {
        d.files += 1;
        d.lines += e.lines;
        d.bytes += e.bytes;
      }
      if (p === '') break;
      p = parentOf(p);
    }
  }
  sortTree(root);
  return root;
}

/** Directories first, then heaviest first, so layouts lead with the big branches and stay stable. */
function sortTree(dir: DirNode): void {
  dir.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return b.lines - a.lines || a.name.localeCompare(b.name);
  });
  for (const c of dir.children) if (c.kind === 'dir') sortTree(c);
}

export function* walk(node: TreeNode, depth = 0): Generator<{ node: TreeNode; depth: number }> {
  yield { node, depth };
  if (node.kind === 'dir') for (const c of node.children) yield* walk(c, depth + 1);
}

export interface LanguageShare {
  readonly language: Language;
  readonly files: number;
  readonly lines: number;
}

export interface Summary {
  readonly files: number;
  readonly dirs: number;
  readonly lines: number;
  readonly bytes: number;
  readonly languages: readonly LanguageShare[];
}

export function summarize(root: DirNode): Summary {
  const langs = new Map<string, { language: Language; files: number; lines: number }>();
  let dirs = 0;
  for (const { node } of walk(root)) {
    if (node.kind === 'dir') {
      if (node !== root) dirs += 1;
      continue;
    }
    const s = langs.get(node.language.name) ?? { language: node.language, files: 0, lines: 0 };
    s.files += 1;
    s.lines += node.lines;
    langs.set(node.language.name, s);
  }
  return {
    files: root.files,
    dirs,
    lines: root.lines,
    bytes: root.bytes,
    languages: [...langs.values()].sort((a, b) => b.lines - a.lines || b.files - a.files),
  };
}
