import { estimateLines, type RepoRef } from '../core/github';
import { extractImports, hasImports } from '../core/imports';
import { isIgnoredPath } from '../core/ignore';
import { isTextual } from '../core/languages';
import type { FileEntry } from '../core/tree';
import { countLines, type ScanProgress, type ScanResult } from './scanFolder';

/** Raw downloads are not API-rate-limited, but they are still bandwidth: count lines exactly for
 *  the largest files up to this many, and estimate the rest from their byte size. */
const MAX_DOWNLOADS = 700;
const MAX_DOWNLOAD_BYTES = 300_000;
const CONCURRENCY = 12;
const MAX_FILES = 20_000;

export type GithubFailure = 'not-found' | 'rate-limited' | 'network' | 'empty';

export class GithubError extends Error {
  readonly reason: GithubFailure;
  constructor(reason: GithubFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    throw new GithubError('network', 'Could not reach GitHub.');
  }
  if (res.status === 404)
    throw new GithubError('not-found', 'Repository not found, or it is private.');
  if (res.status === 403 || res.status === 429)
    throw new GithubError(
      'rate-limited',
      'GitHub rate limit reached (60 repos/hour). Try again later.',
    );
  if (!res.ok) throw new GithubError('network', `GitHub returned ${res.status}.`);
  return res.json();
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

interface Blob {
  readonly path: string;
  readonly size: number;
}

/** Validates the git trees API response; anything malformed is dropped rather than trusted. */
function readTree(body: unknown): { blobs: Blob[]; truncated: boolean } {
  if (!isRecord(body) || !Array.isArray(body['tree']))
    throw new GithubError('network', 'Unexpected response from GitHub.');
  const blobs: Blob[] = [];
  for (const item of body['tree'] as unknown[]) {
    if (!isRecord(item) || item['type'] !== 'blob') continue;
    const path = item['path'];
    const size = item['size'];
    if (typeof path === 'string' && typeof size === 'number' && size >= 0)
      blobs.push({ path, size });
  }
  return { blobs, truncated: body['truncated'] === true };
}

export async function scanGithubRepo(
  repo: RepoRef,
  onProgress: (p: ScanProgress) => void,
): Promise<ScanResult> {
  const base = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
  let ref = repo.ref;
  if (!ref) {
    const info = await getJson(base);
    const branch = isRecord(info) ? info['default_branch'] : undefined;
    if (typeof branch !== 'string')
      throw new GithubError('network', 'Unexpected response from GitHub.');
    ref = branch;
  }
  const tree = readTree(await getJson(`${base}/git/trees/${encodeURIComponent(ref)}?recursive=1`));
  const blobs = tree.blobs.filter((b) => !isIgnoredPath(b.path)).slice(0, MAX_FILES);
  if (blobs.length === 0) throw new GithubError('empty', 'That repository has no files to show.');

  const lines = new Map<string, number>();
  const imports = new Map<string, string[]>();
  // Source files with imports come first — they are what the architecture view is made of —
  // then the largest of everything else, for line counts.
  const rank = (b: Blob): number => (hasImports(b.path) ? 1 : 0);
  const toFetch = blobs
    .filter((b) => isTextual(b.path) && b.size <= MAX_DOWNLOAD_BYTES)
    .sort((a, b) => rank(b) - rank(a) || b.size - a.size)
    .slice(0, MAX_DOWNLOADS);
  const raw = (path: string): string =>
    `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}`;

  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < toFetch.length) {
      const blob = toFetch[next++];
      if (!blob) break;
      try {
        const res = await fetch(raw(blob.path));
        if (res.ok) {
          const text = await res.text();
          lines.set(blob.path, countLines(text));
          if (hasImports(blob.path)) imports.set(blob.path, extractImports(blob.path, text));
        }
      } catch {
        // A failed download just falls back to the estimate.
      }
      if (++done % 20 === 0) onProgress({ files: done });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  let sampleBytes = 0;
  let sampleLines = 0;
  for (const b of toFetch) {
    const n = lines.get(b.path);
    if (n !== undefined) {
      sampleBytes += b.size;
      sampleLines += n;
    }
  }
  const entries: FileEntry[] = blobs.map((b) => ({
    path: b.path,
    bytes: b.size,
    lines:
      lines.get(b.path) ??
      (isTextual(b.path) ? estimateLines(b.size, sampleBytes, sampleLines) : 0),
    imports: imports.get(b.path) ?? [],
  }));
  return {
    rootName: `${repo.owner}/${repo.repo}`,
    entries,
    truncated: tree.truncated || tree.blobs.length > MAX_FILES,
    analysed: imports.size,
    analysable: blobs.filter((b) => hasImports(b.path)).length,
  };
}
