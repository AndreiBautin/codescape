import { isIgnoredDir, isIgnoredPath } from '../core/ignore';
import { isTextual } from '../core/languages';
import type { FileEntry } from '../core/tree';

/** Files larger than this are sized but not read: line counts are cosmetic, memory is not. */
const MAX_READ_BYTES = 1_000_000;
/** Stop after this many files so a mis-aimed scan (a home directory) stays responsive. */
const MAX_FILES = 20_000;

export interface ScanProgress {
  readonly files: number;
}

export interface ScanResult {
  readonly rootName: string;
  readonly entries: FileEntry[];
  readonly truncated: boolean;
}

/** Everything is read locally in the browser; nothing about the folder leaves the machine. */
export function countLines(text: string): number {
  if (text.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith('\n') ? n - 1 : n;
}

async function entryFor(path: string, file: File): Promise<FileEntry> {
  const lines = isTextual(path) && file.size <= MAX_READ_BYTES ? countLines(await file.text()) : 0;
  return { path, bytes: file.size, lines };
}

/** File System Access API (Chromium). */
export async function scanDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  onProgress: (p: ScanProgress) => void,
): Promise<ScanResult> {
  const entries: FileEntry[] = [];
  let truncated = false;

  const visit = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    for await (const child of dir.values()) {
      if (entries.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      if (child.kind === 'directory') {
        if (!isIgnoredDir(child.name)) await visit(child, path);
      } else if (!isIgnoredPath(path)) {
        entries.push(await entryFor(path, await child.getFile()));
        if (entries.length % 200 === 0) onProgress({ files: entries.length });
      }
    }
  };
  await visit(handle, '');
  return { rootName: handle.name, entries, truncated };
}

/** <input webkitdirectory> fallback for browsers without showDirectoryPicker. */
export async function scanFileList(
  files: FileList,
  onProgress: (p: ScanProgress) => void,
): Promise<ScanResult> {
  const entries: FileEntry[] = [];
  let rootName = 'codebase';
  let truncated = false;
  for (const file of Array.from(files)) {
    const rel = file.webkitRelativePath || file.name;
    const cut = rel.indexOf('/');
    if (cut > 0) rootName = rel.slice(0, cut);
    const path = cut > 0 ? rel.slice(cut + 1) : rel;
    if (isIgnoredPath(path)) continue;
    if (entries.length >= MAX_FILES) {
      truncated = true;
      break;
    }
    entries.push(await entryFor(path, file));
    if (entries.length % 200 === 0) onProgress({ files: entries.length });
  }
  return { rootName, entries, truncated };
}
