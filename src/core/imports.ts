import { extensionOf } from './languages';

/** Import extraction is regex-based on purpose: a real parser per language would be megabytes
 *  of WASM for a picture. It errs towards missing an edge rather than inventing one. */

const JS = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte']);
const PY = new Set(['py']);
const GO = new Set(['go']);
const RS = new Set(['rs']);
const C = new Set(['c', 'h', 'cc', 'cpp', 'hpp']);
const JVM = new Set(['java', 'kt']);

/** Whether we know how to read imports from this file. */
export function hasImports(path: string): boolean {
  const ext = extensionOf(path);
  return JS.has(ext) || PY.has(ext) || GO.has(ext) || RS.has(ext) || C.has(ext) || JVM.has(ext);
}

const all = (re: RegExp, text: string, group = 1): string[] => {
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const v = m[group];
    if (v) out.push(v);
  }
  return out;
};

/** Raw import specifiers as written in the file, before resolution. */
export function extractImports(path: string, text: string): string[] {
  const ext = extensionOf(path);
  if (JS.has(ext))
    return [
      ...all(/(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"\n]+)['"]/g, text),
      ...all(/\bimport\s*['"]([^'"\n]+)['"]/g, text),
      ...all(/\b(?:require|import)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g, text),
    ];
  if (PY.has(ext))
    return [
      ...all(/^[ \t]*from[ \t]+([.\w]+)[ \t]+import\b/gm, text),
      ...all(/^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm, text).flatMap((s) =>
        s.split(',').map((x) => x.trim()),
      ),
    ];
  if (GO.has(ext))
    return [
      ...all(/\bimport\s+(?:[\w.]+\s+)?"([^"\n]+)"/g, text),
      ...all(/\bimport\s*\(([\s\S]*?)\)/g, text).flatMap((block) => all(/"([^"\n]+)"/g, block)),
    ];
  if (RS.has(ext))
    return [
      ...all(
        /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?use[ \t]+((?:crate|super|self)(?:::\w+)+)/gm,
        text,
      ),
      ...all(/^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?mod[ \t]+(\w+)[ \t]*;/gm, text).map(
        (m) => `mod:${m}`,
      ),
    ];
  if (C.has(ext)) return all(/#[ \t]*include[ \t]*"([^"\n]+)"/g, text);
  if (JVM.has(ext)) return all(/^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+)/gm, text);
  return [];
}

/** Every path in the codebase, indexed for the lookups resolution needs. */
export interface PathIndex {
  readonly files: ReadonlySet<string>;
  /** directory → files directly inside it */
  readonly dirs: ReadonlyMap<string, readonly string[]>;
  /** basename → every path with that basename */
  readonly byName: ReadonlyMap<string, readonly string[]>;
}

const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseOf = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

export function indexPaths(paths: Iterable<string>): PathIndex {
  const files = new Set<string>();
  const dirs = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const p of paths) {
    files.add(p);
    const d = dirOf(p);
    dirs.set(d, [...(dirs.get(d) ?? []), p]);
    const b = baseOf(p);
    byName.set(b, [...(byName.get(b) ?? []), p]);
  }
  return { files, dirs, byName };
}

/** Collapse `.` and `..`; null when it climbs above the root. */
export function normalize(path: string): string | null {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

const join = (a: string, b: string): string | null => normalize(a ? `${a}/${b}` : b);

const JS_EXTS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.vue',
  '.svelte',
  '.d.ts',
];

const firstHit = (index: PathIndex, candidates: (string | null)[]): string | null => {
  for (const c of candidates) if (c !== null && index.files.has(c)) return c;
  return null;
};

/** The one file whose path ends with `suffix`, preferring the one nearest `from`. */
const bySuffix = (index: PathIndex, suffix: string, from: string): string | null => {
  const matches = (index.byName.get(baseOf(suffix)) ?? []).filter(
    (p) => p === suffix || p.endsWith(`/${suffix}`),
  );
  if (matches.length <= 1) return matches[0] ?? null;
  const shared = (p: string): number => {
    let i = 0;
    while (i < p.length && p[i] === from[i]) i++;
    return i;
  };
  return [...matches].sort((a, b) => shared(b) - shared(a))[0] ?? null;
};

/** Resolve one specifier to a file in the codebase, or null when it is external or unknown. */
export function resolveImport(from: string, spec: string, index: PathIndex): string | null {
  const ext = extensionOf(from);
  const dir = dirOf(from);

  if (JS.has(ext)) {
    let base: string | null = null;
    if (spec.startsWith('.')) base = join(dir, spec);
    else if (spec.startsWith('@/') || spec.startsWith('~/')) base = join('src', spec.slice(2));
    else if (spec.startsWith('/')) base = normalize(spec);
    if (base === null) return null;
    const stripped = base.replace(/\.(m?js|cjs|jsx)$/, '');
    return firstHit(index, [
      ...JS_EXTS.map((e) => base + e),
      ...JS_EXTS.map((e) => stripped + e),
      ...JS_EXTS.slice(1).map((e) => `${base}/index${e}`),
    ]);
  }

  if (PY.has(ext)) {
    const dots = /^\.*/.exec(spec)?.[0].length ?? 0;
    const rest = spec.slice(dots).replace(/\./g, '/');
    const roots: string[] = [];
    if (dots > 0) {
      let r: string | null = dir;
      for (let i = 1; i < dots && r !== null; i++) r = r === '' ? null : dirOf(r);
      if (r === null) return null;
      roots.push(r);
    } else {
      // Absolute imports resolve against any ancestor of the importer: packages often live
      // under src/ or a project subfolder rather than at the repository root.
      for (let r: string | null = dir; r !== null; r = r === '' ? null : dirOf(r)) roots.push(r);
    }
    for (const r of roots) {
      const p = rest ? join(r, rest) : r;
      const hit = firstHit(index, [p && `${p}.py`, p !== null ? join(p, '__init__.py') : null]);
      if (hit) return hit;
    }
    return null;
  }

  if (GO.has(ext)) {
    // Standard library paths have no dot in their first segment.
    const segs = spec.split('/');
    if (!segs[0]?.includes('.')) return null;
    for (let k = segs.length - 1; k >= 1; k--) {
      const suffix = segs.slice(segs.length - k).join('/');
      for (const [d, files] of index.dirs)
        if (d === suffix || d.endsWith(`/${suffix}`)) {
          const go = files.find((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
          if (go) return go;
        }
    }
    return null;
  }

  if (RS.has(ext)) {
    if (spec.startsWith('mod:')) {
      const name = spec.slice(4);
      const stem = baseOf(from).replace(/\.rs$/, '');
      const own = ['mod', 'lib', 'main'].includes(stem) ? dir : join(dir, stem);
      return firstHit(index, [
        join(dir, `${name}.rs`),
        join(dir, `${name}/mod.rs`),
        own && join(own, `${name}.rs`),
      ]);
    }
    const [head, ...path] = spec.split('::');
    let base: string | null;
    if (head === 'crate') {
      const at = from.lastIndexOf('src/');
      base = at < 0 ? '' : from.slice(0, at + 3);
    } else base = head === 'super' ? dirOf(dir) : dir;
    // `use crate::a::b::Item` — the module is some prefix of the path; try the longest first.
    for (let k = path.length; k >= 1; k--) {
      const p = join(base, path.slice(0, k).join('/'));
      const hit = firstHit(index, [p && `${p}.rs`, p !== null ? join(p, 'mod.rs') : null]);
      if (hit) return hit;
    }
    return null;
  }

  if (C.has(ext)) return firstHit(index, [join(dir, spec)]) ?? bySuffix(index, spec, from);

  if (JVM.has(ext)) {
    const p = spec.replace(/\./g, '/');
    return bySuffix(index, `${p}.java`, from) ?? bySuffix(index, `${p}.kt`, from);
  }
  return null;
}
