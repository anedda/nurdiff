import type { Translate } from "../i18n";
import type { ExtFilter } from "../types";

export const EMPTY_EXT_FILTER: ExtFilter = { includeExts: [], includeNone: false, excludeExts: [], excludeNone: false };

/** Clean extensions from a text like "TS, .rs tsx": lowercase, without dot, without duplicates. As in the core. */
export function parseExtList(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,;\s]+/)) {
    const ext = part.trim().replace(/^\.+/, "").toLowerCase();
    if (ext && !out.includes(ext)) out.push(ext);
  }
  return out;
}

/** Does the filter remove anything? */
export function isExtFilterActive(f: ExtFilter): boolean {
  return f.includeExts.length > 0 || f.includeNone || f.excludeExts.length > 0 || f.excludeNone;
}

export function sameExtFilter(a: ExtFilter, b: ExtFilter): boolean {
  return (
    a.includeNone === b.includeNone &&
    a.excludeNone === b.excludeNone &&
    a.includeExts.join(",") === b.includeExts.join(",") &&
    a.excludeExts.join(",") === b.excludeExts.join(",")
  );
}

/** The text of the field for a list of extensions: "rs, ts". */
export function formatExtList(exts: string[]): string {
  return exts.join(", ");
}

/** The filter in words, for the badge: "only rs, ts, (no extension) · without log". */
export function describeExtFilter(f: ExtFilter, t: Translate): string {
  const list = (exts: string[], none: boolean) => [...exts, ...(none ? [t("extFilter.noneName")] : [])].join(", ");
  const parts: string[] = [];
  if (f.includeExts.length > 0 || f.includeNone) parts.push(t("extFilter.desc.include", { list: list(f.includeExts, f.includeNone) }));
  if (f.excludeExts.length > 0 || f.excludeNone) parts.push(t("extFilter.desc.exclude", { list: list(f.excludeExts, f.excludeNone) }));
  return parts.join(" · ");
}

/** The filter that comes out of the fields of the panel (texts and checkboxes). */
export function filterFromDraft(draft: { include: string; includeNone: boolean; exclude: string; excludeNone: boolean }): ExtFilter {
  return {
    includeExts: parseExtList(draft.include),
    includeNone: draft.includeNone,
    excludeExts: parseExtList(draft.exclude),
    excludeNone: draft.excludeNone,
  };
}
