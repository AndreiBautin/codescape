import { describe, expect, it } from 'vitest';
import { parseConfig, DEFAULT_CONFIG } from './config';
import { demoCodebase } from './demo';
import { estimateLines, formatRepo, parseRepo } from './github';
import { isIgnoredPath } from './ignore';
import { extensionOf, languageOf, OTHER } from './languages';
import { createLogger, type Level } from './log';
import { layoutPipes, PIPE_COLORS } from './pipesLayout';
import { createRng } from './rng';
import { buildTree, summarize, walk, type DirNode } from './tree';

const sample = (): DirNode =>
  buildTree('repo', [
    { path: 'README.md', bytes: 10, lines: 5 },
    { path: 'src/a.ts', bytes: 100, lines: 50 },
    { path: 'src/deep/b.ts', bytes: 200, lines: 70 },
    { path: 'web/c.css', bytes: 30, lines: 20 },
  ]);

describe('buildTree', () => {
  it('rolls totals up through every ancestor, root included', () => {
    const root = sample();
    expect(root.files).toBe(4);
    expect(root.lines).toBe(145);
    const src = root.children.find((c) => c.name === 'src');
    expect(src?.kind === 'dir' && [src.files, src.lines]).toEqual([2, 120]);
  });

  it('puts directories first and heaviest first', () => {
    expect(sample().children.map((c) => c.name)).toEqual(['src', 'web', 'README.md']);
  });

  it('creates intermediate directories that contain no files directly', () => {
    const root = buildTree('r', [{ path: 'a/b/c/d.ts', bytes: 1, lines: 1 }]);
    const paths = [...walk(root)].map((w) => w.node.path);
    expect(paths).toEqual(['', 'a', 'a/b', 'a/b/c', 'a/b/c/d.ts']);
  });
});

describe('summarize', () => {
  it('counts folders excluding the root and ranks languages by lines', () => {
    const s = summarize(sample());
    expect(s.dirs).toBe(3);
    expect(s.languages.map((l) => l.language.name)).toEqual(['TypeScript', 'CSS', 'Markdown']);
    expect(s.languages[0]?.lines).toBe(120);
  });
});

describe('languages', () => {
  it('reads the last extension case-insensitively and ignores dotfiles', () => {
    expect(extensionOf('a/b.test.TS')).toBe('ts');
    expect(extensionOf('.gitignore')).toBe('');
    expect(languageOf('x/Makefile')).toBe(OTHER);
  });
});

describe('ignore', () => {
  it('skips vendored directories at any depth, but not similarly named files', () => {
    expect(isIgnoredPath('node_modules/x/index.js')).toBe(true);
    expect(isIgnoredPath('packages/app/dist/main.js')).toBe(true);
    expect(isIgnoredPath('src/dist.ts')).toBe(false);
    expect(isIgnoredPath('pnpm-lock.yaml')).toBe(true);
    expect(isIgnoredPath('src/app.min.js')).toBe(true);
  });
});

describe('parseConfig', () => {
  it('defaults when the query is empty', () => {
    expect(parseConfig('')).toEqual({ config: DEFAULT_CONFIG, warnings: [] });
  });

  it('accepts valid values', () => {
    expect(parseConfig('?mode=mystify&speed=2.5&seed=42&demo=1').config).toEqual({
      mode: 'mystify',
      speed: 2.5,
      seed: 42,
      demo: true,
      repo: null,
    });
  });

  it('degrades every bad value to its default with a warning, never throwing', () => {
    const { config, warnings } = parseConfig('?mode=matrix&speed=99&seed=-1&demo=yes');
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toHaveLength(4);
  });

  it('does not read an empty speed as zero', () => {
    expect(parseConfig('?speed=').config.speed).toBe(1);
  });
});

describe('rng', () => {
  it('is reproducible from a seed and stays in range', () => {
    const a = createRng(7);
    const b = createRng(7);
    const xs = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const r = createRng(1);
    for (let i = 0; i < 500; i++) {
      const n = r.int(2, 5);
      expect(n >= 2 && n <= 5 && Number.isInteger(n)).toBe(true);
    }
  });
});

describe('logger', () => {
  it('drops events below the minimum level', () => {
    const seen: Level[] = [];
    const log = createLogger((level) => seen.push(level), 'warn');
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    expect(seen).toEqual(['warn', 'error']);
  });
});

describe('layoutPipes', () => {
  const root = buildTree('demo', demoCodebase(createRng(3)));
  const layout = layoutPipes(root, createRng(11));

  it('is deterministic for a seed', () => {
    expect(layoutPipes(root, createRng(11))).toEqual(layout);
  });

  it('draws only axis-aligned runs on the integer grid, inside the bound', () => {
    for (const s of layout.segments) {
      const moved = [s.to.x - s.from.x, s.to.y - s.from.y, s.to.z - s.from.z].filter(
        (d) => d !== 0,
      );
      expect(moved).toHaveLength(1);
      for (const v of [s.to.x, s.to.y, s.to.z]) expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('connects every segment to its parent joint, so pipes never float', () => {
    const ends = new Map(layout.segments.map((s) => [s.node.path, s.to]));
    const starts = new Set<string>();
    for (const s of layout.segments) {
      const parentPath = s.node.path.includes('/')
        ? s.node.path.slice(0, s.node.path.lastIndexOf('/'))
        : '';
      const parentEnd = ends.get(parentPath);
      // Top-level nodes start at their pipe's origin, so every one in a pipe shares a start point.
      if (parentEnd) expect(s.from).toEqual(parentEnd);
      else starts.add(`${s.pipe}:${s.from.x},${s.from.y},${s.from.z}`);
    }
    expect(starts.size).toBe(layout.pipes.length);
  });

  it('gives each pipe a distinct colour and a growth order with no gaps', () => {
    expect(new Set(layout.pipes.map((p) => p.color)).size).toBe(layout.pipes.length);
    expect(layout.pipes.length).toBeLessThanOrEqual(PIPE_COLORS.length);
    layout.pipes.forEach((p, i) => {
      const orders = layout.segments.filter((s) => s.pipe === i).map((s) => s.order);
      expect(orders).toEqual(Array.from({ length: p.length }, (_, k) => k));
    });
  });

  it('respects the segment cap', () => {
    expect(
      layoutPipes(root, createRng(1), { maxSegments: 20, maxFilesPerDir: 99 }).segments,
    ).toHaveLength(20);
  });
});

describe('parseRepo', () => {
  it('accepts the forms people actually paste', () => {
    expect(parseRepo('facebook/react')).toEqual({ owner: 'facebook', repo: 'react', ref: null });
    expect(parseRepo(' https://github.com/facebook/react.git ')).toEqual({
      owner: 'facebook',
      repo: 'react',
      ref: null,
    });
    expect(parseRepo('github.com/a/b/tree/feature/x?tab=readme')).toEqual({
      owner: 'a',
      repo: 'b',
      ref: 'feature/x',
    });
    expect(parseRepo('a/b@v1.2')).toEqual({ owner: 'a', repo: 'b', ref: 'v1.2' });
  });

  it('refuses anything that is not a single owner/repo rather than guessing', () => {
    for (const bad of [
      '',
      'react',
      'a/b/c',
      'https://gitlab.com/a/b',
      '../etc/passwd',
      'a/..',
      'a b/c',
    ])
      expect(parseRepo(bad)).toBeNull();
  });

  it('round-trips through the URL parameter', () => {
    const r = parseRepo('a/b@main');
    expect(r && parseRepo(formatRepo(r))).toEqual(r);
    expect(parseConfig('?repo=nonsense').warnings).toHaveLength(1);
    expect(parseConfig('?repo=a%2Fb').config.repo).toEqual({ owner: 'a', repo: 'b', ref: null });
  });
});

describe('estimateLines', () => {
  it('scales by the sampled bytes-per-line and never reports zero for a non-empty file', () => {
    expect(estimateLines(4000, 1000, 50)).toBe(200);
    expect(estimateLines(5, 1000, 10)).toBe(1);
    expect(estimateLines(0, 1000, 10)).toBe(0);
    expect(estimateLines(320, 0, 0)).toBe(10);
  });
});
