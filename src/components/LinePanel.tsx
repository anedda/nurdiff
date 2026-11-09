import { useT } from "../i18n/context";
import { CopyIcon } from "./icons";
import { splitByMarks } from "../lib/segments";
import { visibleWhitespace } from "../lib/whitespace";
import type { Cell, Row } from "../types";

/** Colour class of one side of the row. */
function toneOf(row: Row, side: "left" | "right"): string {
  switch (row.kind) {
    case "equal":
      return "";
    case "changed":
      return "chg";
    case "leftOnly":
      return side === "left" ? "del" : "void";
    case "rightOnly":
      return side === "right" ? "add" : "void";
  }
}

/** Text of a row with visible spaces and tabs and the differing parts highlighted. */
function VisibleText({ cell }: { cell: Cell }) {
  let col = 0;
  return (
    <>
      {splitByMarks(cell.text, cell.marks).map((segment, i) => {
        const shown = visibleWhitespace(segment.text, col);
        col = shown.col;
        return segment.marked ? (
          <mark key={i} className="ie">
            {shown.text}
          </mark>
        ) : (
          shown.text
        );
      })}
      <span className="eol" aria-hidden="true">
        ¶
      </span>
    </>
  );
}

function Line({ row, side }: { row: Row | undefined; side: "left" | "right" }) {
  const t = useT();
  const cell = row && (side === "left" ? row.left : row.right);
  return (
    <div className={`lp-line ${row ? toneOf(row, side) : ""}`} data-side={side}>
      <span className="lp-label" title={t(side === "left" ? "lp.left" : "lp.right")}>
        <span className="lp-arrow" aria-hidden="true">
          {side === "left" ? "◀" : "▶"}
        </span>
        <span className="lp-num">{cell?.number ?? ""}</span>
      </span>
      <span className="lp-text">{cell ? <VisibleText cell={cell} /> : null}</span>
    </div>
  );
}

/** The cell to the right of a line: the copy button, outside the area that scrolls, so a long line never goes under it. */
function CopyCell({ row, side, onCopy }: { row: Row; side: "left" | "right"; onCopy?: (text: string) => void }) {
  const t = useT();
  const cell = side === "left" ? row.left : row.right;
  return (
    <div className="lp-copycell">
      {onCopy && cell && (
        <button
          type="button"
          className="lp-copy"
          title={t(side === "left" ? "lp.copy.left" : "lp.copy.right")}
          aria-label={t(side === "left" ? "lp.copy.left" : "lp.copy.right")}
          onClick={() => onCopy(cell.text)}
        >
          <CopyIcon />
        </button>
      )}
    </div>
  );
}

/**
 * The selected row of the two files, one above the other, with visible spaces (·) and tabs (→):
 * so the whitespace differences are seen at a glance. Always present, of fixed height.
 * Where a side does not have the row it shows an empty row. The lines scroll together; the copy buttons
 * are in a column of their own to the right, which does not scroll.
 */
export default function LinePanel({ row, onCopy }: { row: Row | undefined; onCopy?: (text: string) => void }) {
  const t = useT();
  return (
    <div className="linepanel" role="region" aria-label={t("lp.label")}>
      {row ? (
        <div className="lp-body">
          <div className="lp-scroll">
            <Line row={row} side="left" />
            <Line row={row} side="right" />
          </div>
          <div className="lp-copycol">
            <CopyCell row={row} side="left" onCopy={onCopy} />
            <CopyCell row={row} side="right" onCopy={onCopy} />
          </div>
        </div>
      ) : (
        <p className="lp-empty">{t("lp.empty")}</p>
      )}
    </div>
  );
}
