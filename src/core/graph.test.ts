import { describe, expect, it } from 'vitest';
import { edgesTouching, moduleGraph, neighbours, resolveEdges, LOOSE } from './graph';
import { extractImports, indexPaths, normalize, resolveImport } from './imports';
import { demoCodebase } from './demo';
import { createRng } from './rng';
import { buildTree } from './tree';

describe('extractImports', () => {
  it('reads every JS/TS import form, including re-exports and dynamic imports', () => {
    const src = `import a from './a';
import { b } from "../b";
import type { C } from './c';
export * from './d';
import './side-effect.css';
const e = require('./e');
const f = await import('./f');
// not an import: from('./nope')`;
    expect(extractImports('x/y.ts', src).sort()).toEqual(
      ['../b', './a', './c', './d', './e', './f', './side-effect.css'].sort(),
    );
  });

  it('reads Python, Go, Rust, C and Java', () => {
    expect(
      extractImports('m.py', 'from .models import User\nimport os, pkg.util\n').sort(),
    ).toEqual(['.models', 'os', 'pkg.util']);
    expect(extractImports('m.go', 'import (\n  "fmt"\n  "github.com/x/y/pkg/db"\n)\n')).toEqual([
      'fmt',
      'github.com/x/y/pkg/db',
    ]);
    expect(
      extractImports('m.rs', 'use crate::net::http::Client;\npub mod parser;\nuse std::io;\n'),
    ).toEqual(['crate::net::http::Client', 'mod:parser']);
    expect(extractImports('m.c', '#include "util/str.h"\n#include <stdio.h>\n')).toEqual([
      'util/str.h',
    ]);
    expect(
      extractImports('M.java', 'import com.acme.core.Engine;\nimport static java.lang.Math.max;'),
    ).toEqual(['com.acme.core.Engine', 'java.lang.Math.max']);
  });
});

describe('resolveImport', () => {
  const index = indexPaths([
    'src/ui/app.ts',
    'src/core/tree.ts',
    'src/core/index.ts',
    'src/lib/x.ts',
    'pkg/api/__init__.py',
    'pkg/api/models.py',
    'pkg/server.py',
    'svc/internal/db/db.go',
    'svc/internal/db/db_test.go',
    'cli/src/main.rs',
    'cli/src/net/http.rs',
    'cli/src/parser/mod.rs',
    'engine/include/util/str.h',
    'engine/src/render.c',
    'app/src/main/java/com/acme/core/Engine.java',
    'app/src/main/java/com/acme/App.java',
  ]);

  it('resolves relative TS imports through extensions, index files and .js-for-.ts', () => {
    expect(resolveImport('src/ui/app.ts', '../core/tree', index)).toBe('src/core/tree.ts');
    expect(resolveImport('src/ui/app.ts', '../core/tree.js', index)).toBe('src/core/tree.ts');
    expect(resolveImport('src/ui/app.ts', '../core', index)).toBe('src/core/index.ts');
    expect(resolveImport('src/ui/app.ts', '@/lib/x', index)).toBe('src/lib/x.ts');
  });

  it('treats packages and paths outside the repo as external', () => {
    expect(resolveImport('src/ui/app.ts', 'three', index)).toBeNull();
    expect(resolveImport('src/ui/app.ts', '../../../../etc', index)).toBeNull();
  });

  it('resolves Python relative and absolute imports, including packages', () => {
    expect(resolveImport('pkg/server.py', '.api.models', index)).toBe('pkg/api/models.py');
    expect(resolveImport('pkg/server.py', 'pkg.api', index)).toBe('pkg/api/__init__.py');
    expect(resolveImport('pkg/api/models.py', '..server', index)).toBe('pkg/server.py');
    expect(resolveImport('pkg/server.py', 'os', index)).toBeNull();
  });

  it('resolves Go module paths by directory suffix and skips the standard library and tests', () => {
    expect(resolveImport('svc/main.go', 'github.com/acme/svc/internal/db', index)).toBe(
      'svc/internal/db/db.go',
    );
    expect(resolveImport('svc/main.go', 'fmt', index)).toBeNull();
  });

  it('resolves Rust crate paths and mod declarations', () => {
    expect(resolveImport('cli/src/main.rs', 'crate::net::http::Client', index)).toBe(
      'cli/src/net/http.rs',
    );
    expect(resolveImport('cli/src/main.rs', 'mod:parser', index)).toBe('cli/src/parser/mod.rs');
  });

  it('resolves C includes by suffix and Java imports by package path', () => {
    expect(resolveImport('engine/src/render.c', 'util/str.h', index)).toBe(
      'engine/include/util/str.h',
    );
    expect(
      resolveImport('app/src/main/java/com/acme/App.java', 'com.acme.core.Engine', index),
    ).toBe('app/src/main/java/com/acme/core/Engine.java');
  });

  it('normalizes dot segments and refuses to climb above the root', () => {
    expect(normalize('a/./b/../c')).toBe('a/c');
    expect(normalize('../a')).toBeNull();
  });
});

describe('moduleGraph', () => {
  const paths = [
    'ui/app.ts',
    'core/a.ts',
    'core/b.ts',
    'db/store.ts',
    'util/x.ts',
    'main.ts',
    'README.md',
  ];
  const root = buildTree(
    'r',
    paths.map((path) => ({ path, bytes: 10, lines: 1, imports: [] })),
  );
  const edges = [
    { from: 'main.ts', to: 'ui/app.ts' },
    { from: 'ui/app.ts', to: 'core/a.ts' },
    { from: 'ui/app.ts', to: 'core/b.ts' },
    { from: 'core/a.ts', to: 'db/store.ts' },
    { from: 'db/store.ts', to: 'core/b.ts' }, // core ↔ db: a cycle
  ];
  const g = moduleGraph(root, edges);
  const idx = (name: string): number => g.modules.findIndex((m) => m.name === name);

  it('aggregates file imports into weighted module edges, ignoring imports within a module', () => {
    const uiCore = g.edges.find((e) => e.from === idx('ui') && e.to === idx('core'));
    expect(uiCore?.weight).toBe(2);
    expect(g.edges).toHaveLength(4);
  });

  it('finds the cycle and marks only its edges', () => {
    expect(g.cycles.map((c) => c.map((i) => g.modules[i]?.name).sort())).toEqual([['core', 'db']]);
    expect(g.edges.filter((e) => e.inCycle)).toHaveLength(2);
  });

  it('classifies layers from the dependency direction', () => {
    expect(g.layer[idx(LOOSE)]).toBe('entry');
    expect(g.layer[idx('ui')]).toBe('core');
    expect(g.layer[idx('core')]).toBe('foundation');
    expect(g.layer[idx('util')]).toBe('isolated');
    expect((g.depth[idx(LOOSE)] ?? 0) > (g.depth[idx('ui')] ?? 0)).toBe(true);
  });

  it('reports neighbours grouped by module, and by file within the same module', () => {
    const ui = root.children.find((c) => c.name === 'ui');
    if (!ui) throw new Error('missing ui');
    const n = neighbours(ui, root, edges);
    expect(n.dependsOn).toEqual([{ label: 'core', count: 2 }]);
    expect(n.usedBy).toEqual([{ label: LOOSE, count: 1 }]);
    const a = root.children.find((c) => c.name === 'core');
    const fileA = a?.kind === 'dir' ? a.children.find((c) => c.name === 'a.ts') : undefined;
    if (!fileA) throw new Error('missing a.ts');
    expect(neighbours(fileA, root, edges).dependsOn).toEqual([{ label: 'db', count: 1 }]);
    expect(edgesTouching(fileA, edges)).toHaveLength(2);
  });

  it('resolves and deduplicates edges end to end, dropping self-imports', () => {
    const resolved = resolveEdges(
      [
        { path: 'ui/app.ts', imports: ['../core/a', '../core/a.js', './app', 'react'] },
        { path: 'core/a.ts', imports: ['../db/store'] },
      ],
      paths,
    );
    expect(resolved).toEqual([
      { from: 'ui/app.ts', to: 'core/a.ts' },
      { from: 'core/a.ts', to: 'db/store.ts' },
    ]);
  });
});

describe('demo codebase architecture', () => {
  const entries = demoCodebase(createRng(5));
  const edges = resolveEdges(
    entries,
    entries.map((e) => e.path),
  );
  const root = buildTree('demo', entries);

  it('resolves imports in every language it ships, so the demo is not a lie', () => {
    const exts = new Set(edges.map((e) => e.from.slice(e.from.lastIndexOf('.') + 1)));
    for (const ext of ['tsx', 'ts', 'go', 'py', 'cpp']) expect(exts).toContain(ext);
  });

  it('shows cross-module flows at the top level, with shared as foundation', () => {
    const g = moduleGraph(root, edges);
    expect(g.edges.length).toBeGreaterThan(3);
    expect(g.layer[g.modules.findIndex((m) => m.name === 'shared')]).toBe('foundation');
  });

  it('contains exactly the accounts ⇄ payments cycle inside services', () => {
    const services = root.children.find((c) => c.name === 'services');
    if (services?.kind !== 'dir') throw new Error('missing services');
    const g = moduleGraph(services, edges);
    expect(g.cycles.map((c) => c.map((i) => g.modules[i]?.name).sort())).toEqual([
      ['accounts', 'payments'],
    ]);
  });
});
