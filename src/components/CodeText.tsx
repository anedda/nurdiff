import { splitByMarks, splitWithHits, type Range } from "../lib/segments";
import { visibleWhitespace } from "../lib/whitespace";
import type { Cell } from "../types";

interface CodeProps {
  cell: Cell | null | undefined;
  showSpaces: boolean;
  /** The search matches in this line (UTF-16 ranges), and where the current one starts if it is in this line. */
  hits?: Range[];
  currentHit?: number | null;
}

/**
 * Text of a row, with the parts that differ from the other side highlighted, the search matches and, on request,
 * spaces and tabs visible.
 */
export default function Code({ cell, showSpaces, hits, currentHit = null }: CodeProps) {
  if (!cell) return <span className="code" />;
  const found = hits && hits.length > 0;
  if (!showSpaces && !found && (!cell.marks || cell.marks.length === 0)) return <span className="code">{cell.text}</span>;
  let col = 0;
  // `hit` is null without matches: one single path draws both.
  const segments = found
    ? splitWithHits(cell.text, cell.marks, hits, currentHit)
    : splitByMarks(cell.text, cell.marks ?? []).map((s) => ({ ...s, hit: null }));
  return (
    // With visible spaces the text shown has the dots: the real one is in `data-text`, for copying.
    <span className="code" data-text={showSpaces ? cell.text : undefined}>
      {segments.map((segment, i) => {
        let text = segment.text;
        if (showSpaces) {
          const shown = visibleWhitespace(text, col);
          text = shown.text;
          col = shown.col;
        }
        if (!segment.marked && !segment.hit) return text;
        const classes = [segment.marked ? "ie" : "", segment.hit ? "find" : "", segment.hit === "current" ? "current" : ""].filter(Boolean);
        return (
          <mark key={i} className={classes.join(" ")}>
            {text}
          </mark>
        );
      })}
    </span>
  );
}
