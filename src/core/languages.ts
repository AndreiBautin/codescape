export interface Language {
  readonly name: string;
  /** Display colour, a hex string. */
  readonly color: string;
}

const L = (name: string, color: string): Language => ({ name, color });

export const OTHER: Language = L('Other', '#8a93a6');

const BY_EXT: Readonly<Record<string, Language>> = (() => {
  const ts = L('TypeScript', '#3d8bff');
  const js = L('JavaScript', '#f5d547');
  const cpp = L('C/C++', '#ff6b8b');
  const web = L('HTML', '#ff8a3d');
  const css = L('CSS', '#36c5f0');
  const md = L('Markdown', '#c9d1e0');
  const data = L('Data', '#7fd6ff');
  const sh = L('Shell', '#9be15d');
  return {
    ts,
    tsx: ts,
    mts: ts,
    cts: ts,
    js,
    jsx: js,
    mjs: js,
    cjs: js,
    py: L('Python', '#4fc3a1'),
    cs: L('C#', '#a970ff'),
    c: cpp,
    h: cpp,
    cpp,
    hpp: cpp,
    cc: cpp,
    rs: L('Rust', '#ff9e64'),
    go: L('Go', '#29beb0'),
    java: L('Java', '#e76f51'),
    kt: L('Kotlin', '#b388ff'),
    swift: L('Swift', '#ff7a59'),
    rb: L('Ruby', '#ff4d6d'),
    php: L('PHP', '#8892ff'),
    html: web,
    htm: web,
    vue: L('Vue', '#42d392'),
    svelte: L('Svelte', '#ff5e3a'),
    css,
    scss: css,
    sass: css,
    less: css,
    md,
    mdx: md,
    txt: md,
    json: data,
    yml: data,
    yaml: data,
    toml: data,
    xml: data,
    csv: data,
    sh,
    bash: sh,
    ps1: sh,
    bat: sh,
    cmd: sh,
    sql: L('SQL', '#ffb4a2'),
  };
})();

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function languageOf(path: string): Language {
  return BY_EXT[extensionOf(path)] ?? OTHER;
}

/** Whether a file is worth reading to count lines. Binary and unknown types are sized only. */
export function isTextual(path: string): boolean {
  return languageOf(path) !== OTHER;
}
