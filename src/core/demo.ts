import type { Rng } from './rng';
import type { FileEntry } from './tree';

/** A plausible synthetic codebase, so the app has something beautiful to show before a folder is
 *  chosen. Deterministic for a given Rng. */
export function demoCodebase(rng: Rng): FileEntry[] {
  const entries: FileEntry[] = [];
  const file = (path: string, avgLines: number): void => {
    const lines = Math.max(3, Math.round(avgLines * rng.range(0.3, 1.8)));
    entries.push({ path, lines, bytes: lines * rng.int(22, 40) });
  };
  const many = (dir: string, names: readonly string[], ext: string, avg: number): void => {
    for (const n of names) file(`${dir}/${n}.${ext}`, avg);
  };

  const features = ['auth', 'billing', 'search', 'profile', 'inbox', 'settings'];
  for (const f of features) {
    many(`web/src/features/${f}`, ['index', `${f}Page`, `${f}Store`, `${f}Api`], 'tsx', 140);
    many(`web/src/features/${f}/components`, ['Header', 'List', 'Item', 'Empty'], 'tsx', 80);
    many(`web/src/features/${f}`, [`${f}.test`], 'ts', 120);
  }
  many('web/src/ui', ['Button', 'Dialog', 'Menu', 'Tooltip', 'Tabs', 'Toast', 'Input'], 'tsx', 90);
  many('web/src/styles', ['tokens', 'base', 'themes'], 'css', 160);
  many('web', ['package', 'tsconfig'], 'json', 30);

  for (const svc of ['gateway', 'accounts', 'payments', 'indexer']) {
    many(`services/${svc}`, ['main', 'routes', 'handlers', 'models', 'config'], 'go', 220);
    many(`services/${svc}`, ['handlers_test'], 'go', 180);
  }
  many('ml/pipeline', ['ingest', 'features', 'train', 'evaluate', 'serve'], 'py', 260);
  many('ml/notebooks', ['explore', 'baseline'], 'py', 400);
  many('engine/core', ['renderer', 'scene', 'mesh', 'shader', 'math'], 'cpp', 520);
  many('engine/core', ['renderer', 'scene', 'mesh', 'shader', 'math'], 'h', 110);
  many('infra/terraform', ['main', 'network', 'db'], 'toml', 90);
  many('scripts', ['deploy', 'seed', 'release'], 'sh', 60);
  many('docs', ['README', 'ARCHITECTURE', 'TESTING', 'CONTRIBUTING'], 'md', 120);
  file('README.md', 80);
  file('package.json', 40);
  return entries;
}
