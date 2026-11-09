import { msg, type Message } from "../i18n";
import type { Mode, PathKind, Side } from "../types";

/** What to do with the items dropped onto the window. */
export type DropPlan =
  | {
      ok: true;
      mode: Mode;
      /** Values of the two fields after the drop. */
      left: string;
      right: string;
      /** True if two items were dropped: it can be compared right away. */
      compare: boolean;
    }
  | { ok: false; message: Message };

/** The name of the last item of a path (with `/` or `\`). */
export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const name = trimmed.split(/[\\/]/).pop();
  return name || path;
}

/** Which half of the window the pointer is in (`x` and `width` in CSS pixels). */
export function sideAt(x: number, width: number): Side {
  return x < width / 2 ? "left" : "right";
}

/**
 * Decides what to do with a drop.
 *
 * - two files or two folders: they fill the two fields (in the order received) and it can be compared;
 * - a single item: it goes into the field of the side under the pointer (`hover`), or into the first
 *   free field if the side is not known; if it is of a different type from the current mode it switches
 *   to the other mode and the other field, which held the wrong type, is emptied;
 * - everything else (none, more than two, mixed types, inaccessible paths) is an error.
 */
export function planDrop(
  paths: string[],
  kinds: PathKind[],
  current: { mode: Mode; left: string; right: string },
  hover: Side | null,
): DropPlan {
  if (paths.length === 0) return { ok: false, message: msg("drop.none") };
  if (paths.length > 2) {
    return {
      ok: false,
      message: msg("drop.tooMany", { count: paths.length }),
    };
  }
  for (let i = 0; i < paths.length; i++) {
    if (kinds[i] !== "file" && kinds[i] !== "dir") {
      return { ok: false, message: msg(kinds[i] === "missing" ? "drop.missing" : "drop.other", { name: baseName(paths[i]) }) };
    }
  }
  if (paths.length === 2 && kinds[0] !== kinds[1]) {
    return {
      ok: false,
      message: msg("drop.mixed"),
    };
  }

  const mode: Mode = kinds[0] === "file" ? "files" : "dirs";
  if (paths.length === 2) {
    return { ok: true, mode, left: paths[0], right: paths[1], compare: true };
  }

  const sameMode = current.mode === mode;
  const keptLeft = sameMode ? current.left : "";
  const keptRight = sameMode ? current.right : "";
  const side: Side = hover ?? (keptLeft === "" ? "left" : keptRight === "" ? "right" : "left");
  return {
    ok: true,
    mode,
    left: side === "left" ? paths[0] : keptLeft,
    right: side === "right" ? paths[0] : keptRight,
    compare: false,
  };
}
