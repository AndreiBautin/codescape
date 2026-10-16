/** A public GitHub repository reference, parsed from whatever the user pasted. */
export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
  /** Branch, tag or sha; null = the repository's default branch. */
  readonly ref: string | null;
}

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

/** Accepts `owner/repo`, `owner/repo@ref`, or a github.com URL (including /tree/<ref>). Returns
 *  null for anything else rather than guessing. */
export function parseRepo(input: string): RepoRef | null {
  let s = input.trim().replace(/\.git$/, '');
  let ref: string | null = null;
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i.exec(s);
  if (url?.[1]) {
    const parts = url[1].split(/[?#]/)[0]?.split('/').filter(Boolean) ?? [];
    const [owner, repo, kind, ...rest] = parts;
    if (!owner || !repo) return null;
    if (kind === 'tree' && rest.length > 0) ref = rest.join('/');
    s = `${owner}/${repo.replace(/\.git$/, '')}`;
  } else {
    const at = s.indexOf('@');
    if (at > 0) {
      ref = s.slice(at + 1) || null;
      s = s.slice(0, at);
    }
  }
  const [owner, repo, extra] = s.split('/');
  if (!owner || !repo || extra !== undefined) return null;
  if (!NAME.test(owner) || !NAME.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo, ref };
}

export function formatRepo(r: RepoRef): string {
  return r.ref ? `${r.owner}/${r.repo}@${r.ref}` : `${r.owner}/${r.repo}`;
}

/** Estimate lines for files we did not download, from the bytes-per-line of the ones we did. */
export function estimateLines(bytes: number, sampleBytes: number, sampleLines: number): number {
  const perLine = sampleLines > 0 && sampleBytes > 0 ? sampleBytes / sampleLines : 32;
  return bytes === 0 ? 0 : Math.max(1, Math.round(bytes / perLine));
}
