import type { ConflictSegment, ConflictView, Resolution } from "../types";

/** Lines of context kept on each side of a conflict; the unchanged lines beyond fold into a gap. */
export const CONTEXT_LINES = 3;

export type Conflict = Extract<ConflictSegment, { kind: "conflict" }>;

/** What the view draws, in order: lines, a fold of unchanged lines (that can be opened) or a conflict. */
export type Item =
  | { type: "lines"; key: string; start: number; lines: string[] }
  | { type: "gap"; key: string; count: number }
  | { type: "conflict"; key: string; conflict: Conflict };

/**
 * The pieces of the file as the view shows them: each run of lines between two conflicts keeps `CONTEXT_LINES` next to the
 * conflicts and folds the rest into a gap (`open` has the keys of the gaps the user opened). The start and the end of the file
 * keep only the lines near a conflict.
 */
export function items(segments: ConflictSegment[], open: ReadonlySet<string> = new Set()): Item[] {
  const out: Item[] = [];
  segments.forEach((s, i) => {
    if (s.kind === "conflict") {
      out.push({ type: "conflict", key: `c${s.index}`, conflict: s });
      return;
    }
    const first = i === 0;
    const last = i === segments.length - 1;
    // Lines kept at the top and at the bottom of the run: none on the side where the file starts or ends.
    const head = first ? 0 : CONTEXT_LINES;
    const tail = last ? 0 : CONTEXT_LINES;
    const key = `t${i}`;
    if (open.has(key) || s.lines.length <= head + tail + 1) {
      out.push({ type: "lines", key, start: s.start, lines: s.lines });
      return;
    }
    const hidden = s.lines.length - head - tail;
    if (head > 0) out.push({ type: "lines", key: `${key}a`, start: s.start, lines: s.lines.slice(0, head) });
    out.push({ type: "gap", key, count: hidden });
    if (tail > 0) out.push({ type: "lines", key: `${key}b`, start: s.start + s.lines.length - tail, lines: s.lines.slice(-tail) });
  });
  return out;
}

/** The index of the conflict to go to from `from` (-1: none yet), in a direction; it wraps around. `null` if there are none. */
export function stepConflict(view: ConflictView, from: number, direction: 1 | -1): number | null {
  if (view.total === 0) return null;
  return (from + direction + view.total) % view.total;
}

/** The first conflict without a choice, from `from` on (wrapping), or `null` if all have one. */
export function nextUnresolved(view: ConflictView, from: number): number | null {
  const conflicts = view.segments.filter((s): s is Conflict => s.kind === "conflict");
  for (let step = 0; step < conflicts.length; step++) {
    const c = conflicts[(from + step + conflicts.length) % conflicts.length];
    if (c.resolution.kind === "unresolved") return c.index;
  }
  return null;
}

/** The text of a custom resolution as a list of lines (an empty text is no line at all). */
export function linesOf(text: string): string[] {
  return text === "" ? [] : text.split(/\r?\n/);
}

export function textOf(lines: string[]): string {
  return lines.join("\n");
}

export const RESOLUTION_KEYS: Record<Resolution["kind"], string> = {
  unresolved: "merge.state.unresolved",
  ours: "merge.state.ours",
  theirs: "merge.state.theirs",
  both: "merge.state.both",
  bothReversed: "merge.state.bothReversed",
  custom: "merge.state.custom",
};
