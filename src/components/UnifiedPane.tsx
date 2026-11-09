import type { KeyboardEvent as ReactKeyboardEvent, RefObject, UIEvent } from "react";
import { useT } from "../i18n/context";
import type { UnifiedRow, UnifiedSpan } from "../types";
import Code from "./CodeText";
import { ArrowToLeftIcon, ArrowToRightIcon } from "./icons";
import PaneCopyButton from "./PaneCopyButton";

const ROW_HEIGHT = 20;

const SIGN = { equal: " ", removed: "−", added: "+" } as const;
const TONE = { equal: "", removed: "del", added: "add" } as const;

interface Props {
  total: number;
  rowAt: (index: number) => UnifiedRow | undefined;
  start: number;
  end: number;
  /** Width of the longest row, in characters. */
  width: number;
  /** The current block (rows `[start, end)` of the unified view). */
  current: UnifiedSpan | null;
  scrollerRef: RefObject<HTMLDivElement>;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  selected: number | null;
  onSelect: (index: number) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** Right click on a row (window coordinates). */
  onContext: (index: number, x: number, y: number) => void;
  showSpaces: boolean;
  /** There is selected text in the pane: the copy icon appears. */
  showCopy: boolean;
  onCopy: () => void;
  /** Which way the row is copied (a removed row to the right, an added one to the left), or null if it cannot be. */
  copyDirection: (row: UnifiedRow | undefined) => "leftToRight" | "rightToLeft" | null;
  onCopyRow: (index: number) => void;
}

/**
 * Unified view of a file: a single pane, with the row numbers of the two sides and a sign.
 * Like the side-by-side panes it draws only the rows between `start` and `end`. Read-only.
 */
export default function UnifiedPane({ total, rowAt, start, end, width, current, scrollerRef, onScroll, selected, onSelect, onKeyDown, onContext, showSpaces, showCopy, onCopy, copyDirection, onCopyRow }: Props) {
  const t = useT();
  const items = [];
  for (let i = start; i < end; i++) {
    const row = rowAt(i);
    const isCurrent = current !== null && i >= current.start && i < current.end;
    const copy = copyDirection(row);
    items.push(
      <div
        key={i}
        className={`vrow urow ${row ? TONE[row.kind] : "loading"}${isCurrent ? " current" : ""}${i === selected ? " selected" : ""}${row?.gap ? " gap" : ""}`}
        style={{ top: i * ROW_HEIGHT }}
        data-kind={row?.kind}
        onClick={() => onSelect(i)}
        onContextMenu={
          row
            ? (e) => {
                e.preventDefault();
                onContext(i, e.clientX, e.clientY);
              }
            : undefined
        }
      >
        {copy && (
          <span className="row-copy">
            <button
              type="button"
              tabIndex={-1}
              title={t(copy === "leftToRight" ? "fd.row.copyRight" : "fd.row.copyLeft")}
              aria-label={t(copy === "leftToRight" ? "fd.row.copyRight" : "fd.row.copyLeft")}
              onClick={(e) => {
                e.stopPropagation();
                onCopyRow(i);
              }}
            >
              {copy === "leftToRight" ? <ArrowToRightIcon /> : <ArrowToLeftIcon />}
            </button>
          </span>
        )}
        <span className="num">{row?.left ?? ""}</span>
        <span className="num num2">{row?.right ?? ""}</span>
        <span className="u-sign" aria-hidden="true">{row ? SIGN[row.kind] : ""}</span>
        <Code cell={row ? { number: 0, text: row.text, marks: row.marks } : null} showSpaces={showSpaces} />
      </div>,
    );
  }
  return (
    <div className="pane right unified" ref={scrollerRef} onScroll={onScroll} onKeyDown={onKeyDown} tabIndex={0} role="region" aria-label={t("fd.unified.label")}>
      <PaneCopyButton show={showCopy} onCopy={onCopy} />
      <div className="pane-inner" style={{ height: total * ROW_HEIGHT, minWidth: `calc(9rem + 1.6rem + ${width}ch + 2rem)` }}>
        {items}
      </div>
    </div>
  );
}
