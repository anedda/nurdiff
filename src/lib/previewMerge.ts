import type { DirListing } from "../types";

/** A row of the preview: the same name seen from the left and from the right (one of the two may be missing). */
export interface PairedEntry {
  name: string;
  left: DirListing | null;
  right: DirListing | null;
}

const isDir = (e: DirListing | null) => e?.kind === "dir";

/**
 * Merges the listings of the same folder read from the two sides: one row per name, with
 * subfolders before files and then alphabetical order ignoring case, like the core.
 * A side not read (null) counts as empty.
 */
export function mergeListings(left: DirListing[] | null, right: DirListing[] | null): PairedEntry[] {
  const byName = new Map<string, PairedEntry>();
  for (const e of left ?? []) byName.set(e.name, { name: e.name, left: e, right: null });
  for (const e of right ?? []) {
    const row = byName.get(e.name);
    if (row) row.right = e;
    else byName.set(e.name, { name: e.name, left: null, right: e });
  }
  return [...byName.values()].sort(
    (a, b) =>
      Number(!(isDir(a.left) || isDir(a.right))) - Number(!(isDir(b.left) || isDir(b.right))) ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}
