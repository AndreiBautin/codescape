import { parseRepo, type RepoRef } from './github';

/** Configuration comes from the URL query string. Parsing is total: a bad value falls back to its
 *  documented default with a warning, never an exception. */
export const MODES = ['pipes', 'starfield', 'mystify', 'windows', 'beziers', 'flowerbox'] as const;
export type Mode = (typeof MODES)[number];

export interface Config {
  readonly mode: Mode;
  /** Animation speed multiplier, 0.1–5. Default 1. */
  readonly speed: number;
  /** Seed for every random choice. null = the caller picks one. */
  readonly seed: number | null;
  /** Start straight into the bundled demo codebase instead of the welcome screen. Default false. */
  readonly demo: boolean;
  /** Public GitHub repository to load on start (`?repo=owner/name`). Default none. */
  readonly repo: RepoRef | null;
}

export const DEFAULT_CONFIG: Config = {
  mode: 'pipes',
  speed: 1,
  seed: null,
  demo: false,
  repo: null,
};

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

export function parseConfig(query: string): { config: Config; warnings: string[] } {
  const params = new URLSearchParams(query);
  const warnings: string[] = [];
  let { mode, speed, seed, demo, repo } = DEFAULT_CONFIG;

  const rawMode = params.get('mode');
  if (rawMode !== null) {
    if (isMode(rawMode)) mode = rawMode;
    else warnings.push(`mode: unknown value, using "${DEFAULT_CONFIG.mode}"`);
  }
  const rawSpeed = params.get('speed');
  if (rawSpeed !== null) {
    const n = Number(rawSpeed);
    if (rawSpeed.trim() !== '' && Number.isFinite(n) && n >= 0.1 && n <= 5) speed = n;
    else warnings.push(`speed: expected 0.1–5, using ${DEFAULT_CONFIG.speed}`);
  }
  const rawSeed = params.get('seed');
  if (rawSeed !== null) {
    const n = Number(rawSeed);
    if (rawSeed.trim() !== '' && Number.isSafeInteger(n) && n >= 0) seed = n;
    else warnings.push('seed: expected a non-negative integer, ignoring');
  }
  const rawDemo = params.get('demo');
  if (rawDemo !== null) {
    if (rawDemo === '1' || rawDemo === 'true' || rawDemo === '') demo = true;
    else if (rawDemo === '0' || rawDemo === 'false') demo = false;
    else warnings.push('demo: expected 1 or 0, using 0');
  }
  const rawRepo = params.get('repo');
  if (rawRepo !== null) {
    repo = parseRepo(rawRepo);
    if (!repo) warnings.push('repo: expected owner/name or a github.com URL, ignoring');
  }
  return { config: { mode, speed, seed, demo, repo }, warnings };
}
