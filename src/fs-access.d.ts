// File System Access API members not yet in TypeScript's DOM lib (Chromium-only).
interface Window {
  showDirectoryPicker(options?: {
    mode?: 'read' | 'readwrite';
  }): Promise<FileSystemDirectoryHandle>;
}
interface DataTransferItem {
  getAsFileSystemHandle(): Promise<FileSystemHandle | null>;
}
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
}
