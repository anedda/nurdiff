import type { PathKind } from "../types";

/** Extensions of the archives NurDiff opens as folders (the same list as `kind_of` in `crates/archive`). */
const ARCHIVE_EXTENSIONS = [".zip", ".jar", ".apk", ".epub", ".tar", ".tar.gz", ".tgz"];

/** The name of the path ends like an archive. Only a first filter: the core also looks inside the file. */
export function looksLikeArchive(path: string): boolean {
  const name = path.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Both paths are folders for the core (an archive counts as a folder): they are compared in a tab of folders. */
export function bothAreFolders(kinds: readonly PathKind[] | null): boolean {
  return kinds !== null && kinds.length === 2 && kinds.every((k) => k === "dir");
}
