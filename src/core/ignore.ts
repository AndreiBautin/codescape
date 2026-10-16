/** Directories that are generated or vendored: scanning them would drown the real code. */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  'target',
  'bin',
  'obj',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vs',
  'vendor',
  'Library',
  'Intermediate',
  'DerivedDataCache',
]);

export function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

const IGNORED_FILES =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|\.DS_Store)$|\.min\.(js|css)$|\.map$/;

/** True when any directory segment of a slash-separated path is ignored, or the file itself is. */
export function isIgnoredPath(path: string): boolean {
  return path.split('/').slice(0, -1).some(isIgnoredDir) || IGNORED_FILES.test(path);
}
