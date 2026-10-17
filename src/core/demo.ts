import type { Rng } from './rng';
import type { FileEntry } from './tree';

/** A plausible synthetic monorepo with a real dependency structure — layers, a shared library
 *  used across languages, and one deliberate cycle — so the architecture view has something
 *  to say before a repo is loaded. Deterministic for a given Rng. */
export function demoCodebase(rng: Rng): FileEntry[] {
  const entries: FileEntry[] = [];
  const file = (path: string, avgLines: number, imports: readonly string[] = []): void => {
    const lines = Math.max(3, Math.round(avgLines * rng.range(0.3, 1.8)));
    entries.push({ path, lines, bytes: lines * rng.int(22, 40), imports });
  };
  const GO = 'github.com/acme/demo';

  // Web: app shell → features → ui kit + api client → shared types.
  const features = ['auth', 'billing', 'search', 'profile', 'inbox', 'settings'];
  file('web/src/main.tsx', 40, ['./app']);
  file(
    'web/src/app.tsx',
    120,
    features.map((f) => `./features/${f}`),
  );
  for (const f of features) {
    const dir = `web/src/features/${f}`;
    file(`${dir}/index.tsx`, 60, [`./${f}Page`]);
    file(`${dir}/${f}Page.tsx`, 180, [
      `./${f}Store`,
      './components/List',
      '../../ui/Button',
      '../../ui/Dialog',
    ]);
    file(`${dir}/${f}Store.ts`, 140, [
      `./${f}Api`,
      '../../../../shared/ts/types',
      ...(f === 'billing' ? ['../auth/authStore'] : []),
    ]);
    file(`${dir}/${f}Api.ts`, 90, ['../../api/client']);
    for (const c of ['Header', 'List', 'Item', 'Empty'])
      file(
        `${dir}/components/${c}.tsx`,
        80,
        c === 'List' ? ['./Item', '../../../ui/Tooltip'] : ['../../../ui/Button'],
      );
    file(`${dir}/${f}.test.ts`, 120, [`./${f}Store`]);
  }
  for (const u of ['Button', 'Dialog', 'Menu', 'Tooltip', 'Tabs', 'Toast', 'Input'])
    file(`web/src/ui/${u}.tsx`, 90, ['../styles/tokens.css']);
  for (const s of ['tokens', 'base', 'themes']) file(`web/src/styles/${s}.css`, 160);
  file('web/src/api/client.ts', 150, ['../../../shared/ts/types']);
  file('web/package.json', 30);

  // Services: gateway → accounts ⇄ payments (the cycle) → shared db; all speak shared proto.
  const svcImports: Record<string, string[]> = {
    gateway: ['services/accounts', 'services/payments', 'services/indexer'],
    accounts: ['services/payments', 'services/platform/db'],
    payments: ['services/accounts', 'services/platform/db'],
    indexer: ['services/platform/db'],
  };
  for (const [svc, deps] of Object.entries(svcImports)) {
    file(`services/${svc}/main.go`, 120, [
      ...deps.map((d) => `${GO}/${d}`),
      `${GO}/shared/go/proto`,
    ]);
    for (const part of ['routes', 'handlers', 'models', 'config'])
      file(`services/${svc}/${part}.go`, 220);
    file(`services/${svc}/handlers_test.go`, 180);
  }
  file('services/platform/db/db.go', 300, [`${GO}/shared/go/proto`]);
  file('services/platform/db/migrate.go', 160);

  // ML: serve → train → features → ingest → shared schema.
  file('ml/pipeline/ingest.py', 260, ['shared.py.schema']);
  file('ml/pipeline/features.py', 260, ['.ingest']);
  file('ml/pipeline/train.py', 300, ['.features', '.evaluate']);
  file('ml/pipeline/evaluate.py', 200, ['.features']);
  file('ml/pipeline/serve.py', 180, ['.train', 'shared.py.schema']);
  file('ml/pipeline/__init__.py', 5);
  file('ml/notebooks/explore.py', 400, ['ml.pipeline.features']);

  // Engine: C++ renderer layers.
  const inc: Record<string, string[]> = {
    renderer: ['scene.h', 'shader.h'],
    scene: ['mesh.h', 'math.h'],
    mesh: ['math.h'],
    shader: ['math.h'],
    math: [],
  };
  for (const [m, deps] of Object.entries(inc)) {
    file(`engine/core/${m}.cpp`, 520, [`${m}.h`, ...deps]);
    file(`engine/core/${m}.h`, 110, deps);
  }

  // Shared contracts, imported from three languages.
  file('shared/ts/types.ts', 220);
  file('shared/go/proto/proto.go', 340);
  file('shared/py/schema.py', 180);
  file('shared/py/__init__.py', 3);
  file('shared/__init__.py', 3);

  // Tooling that reaches into the product.
  file('tools/cli.ts', 140, ['../web/src/api/client', '../shared/ts/types']);
  file('tools/seed.py', 90, ['shared.py.schema', 'ml.pipeline.ingest']);
  file('infra/terraform/main.toml', 90);
  file('infra/terraform/network.toml', 90);
  file('docs/ARCHITECTURE.md', 120);
  file('docs/README.md', 80);
  file('README.md', 80);
  return entries;
}
