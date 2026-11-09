import type { Mode } from "../types";
import { readStored, writeStored } from "./configStore";

export interface Recent {
  mode: Mode;
  left: string;
  right: string;
  /** When it was run, in milliseconds since 1970. */
  at: number;
}

export const MAX_RECENTS = 20;

type Identity = Pick<Recent, "mode" | "left" | "right">;

/** What makes two recents the same comparison: the mode and the two paths (not the date). The Home uses it as the key of a row too. */
export function recentKey(r: Identity): string {
  return `${r.mode}\0${r.left}\0${r.right}`;
}

/** Adds a comparison at the head of the list: the same comparison does not appear twice. */
export function addRecent(list: Recent[], entry: Recent, max = MAX_RECENTS): Recent[] {
  return [entry, ...removeRecent(list, entry)].slice(0, max);
}

/** The list without this comparison. */
export function removeRecent(list: Recent[], entry: Identity): Recent[] {
  const key = recentKey(entry);
  return list.filter((r) => recentKey(r) !== key);
}

function isRecent(x: unknown): x is Recent {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    (r.mode === "files" || r.mode === "dirs") &&
    typeof r.left === "string" &&
    typeof r.right === "string" &&
    typeof r.at === "number"
  );
}

/** Reads the saved list; unreadable or invalid content gives an empty list. */
export function parseRecents(text: string | null): Recent[] {
  if (!text) return [];
  try {
    const data: unknown = JSON.parse(text);
    return Array.isArray(data) ? data.filter(isRecent).slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

// The list is kept in `recents.json` (see `configStore`): if it cannot be written it only lasts while the program is open.
export function loadRecents(): Recent[] {
  return parseRecents(readStored("recents"));
}

export function saveRecents(list: Recent[]): void {
  writeStored("recents", JSON.stringify(list, null, 2));
}
