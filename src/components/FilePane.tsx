import type { KeyboardEvent as ReactKeyboardEvent, RefObject, UIEvent } from "react";
import { useT } from "../i18n/context";
import type { Hunk } from "../lib/hunks";
import type { Range } from "../lib/segments";
import type { Row, SearchHit, Side } from "../types";
import type { EditEnd, LineEdit } from "../lib/useLineEditing";
import Code from "./CodeText";
import { ArrowToLeftIcon, ArrowToRightIcon } from "./icons";
import PaneCopyButton from "./PaneCopyButton";

/** Height (px) of a pane row: it is also needed by whoever computes which rows to draw. */
export const ROW_HEIGHT = 20;
/** Space that compensates for the horizontal scroll bar, visible only in the right pane. */
export const SCROLLBAR_ALLOWANCE = 16;

/** Colour class of the row, from the point of view of one side (`loading`: row not arrived yet). */
function tone(row: Row | undefined, side: Side): string {
  if (!row) return "loading";
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

interface PaneProps {
  side: Side;
  total: number;
  rowAt: (index: number) => Row | undefined;
  start: number;
  end: number;
  /** Width of the longest row, in characters. */
  width: number;
  current: Hunk | null;
  scrollerRef: RefObject<HTMLDivElement>;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  /** The side can be modified (it is not read-only). */
  editable: boolean;
  /** Selected row (index in the view), the same in the two panes. */
  selected: number | null;
  onSelect: (side: Side, row: number) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** Right click on a row (window coordinates). */
  onContext: (side: Side, row: number, x: number, y: number) => void;
  /** Row marked as the first end of an alignment. */
  marked: { side: Side; number: number } | null;
  editing: LineEdit | null;
  onStartEdit: (side: Side, row: number) => void;
  onEditText: (text: string) => void;
  onEndEdit: (how: EditEnd) => void;
  showSpaces: boolean;
  /** There is selected text in the pane: the copy icon appears, which calls `onCopy`. */
  showCopy: boolean;
  onCopy: () => void;
  /** The row has a line to copy to the other side (the button on its inner edge appears). */
  canCopyRow: (row: Row | undefined) => boolean;
  onCopyRow: (row: number) => void;
  /** The selected text takes this many rows and they can go to the other side: the button next to "Copy" appears. */
  rangeRows: number | null;
  onCopyRange: () => void;
  /** The search matches of this side by row, and the current one (null if the search is on the other side or closed). */
  search: { byRow: ReadonlyMap<number, Range[]>; current: SearchHit | null } | null;
}

/** One side of the comparison: it draws only the rows between `start` and `end`. */
export default function FilePane({
  side,
  total,
  rowAt,
  start,
  end,
  width,
  current,
  scrollerRef,
  onScroll,
  editable,
  selected,
  onSelect,
  onKeyDown,
  onContext,
  marked,
  editing,
  onStartEdit,
  onEditText,
  onEndEdit,
  showSpaces,
  showCopy,
  onCopy,
  canCopyRow,
  onCopyRow,
  rangeRows,
  onCopyRange,
  search,
}: PaneProps) {
  const t = useT();
  const items = [];
  for (let i = start; i < end; i++) {
    const row = rowAt(i);
    const cell = row && (side === "left" ? row.left : row.right);
    const isCurrent = current !== null && i >= current.start && i < current.end;
    const isMarked = !!cell && marked !== null && marked.side === side && marked.number === cell.number;
    items.push(
      <div
        key={i}
        className={`vrow ${tone(row, side)}${isCurrent ? " current" : ""}${i === selected ? " selected" : ""}${row?.gap ? " gap" : ""}${row?.aligned ? " aligned" : ""}${isMarked ? " marked" : ""}`}
        style={{ top: i * ROW_HEIGHT }}
        data-row={i}
        title={row?.aligned ? t("fd.alignedTitle") : undefined}
        onClick={() => onSelect(side, i)}
        onContextMenu={
          row
            ? (e) => {
                e.preventDefault();
                onContext(side, i, e.clientX, e.clientY);
              }
            : undefined
        }
        onDoubleClick={row && editable ? () => onStartEdit(side, i) : undefined}
      >
        {canCopyRow(row) && (
          <span className="row-copy">
            <button
              type="button"
              tabIndex={-1}
              title={t(side === "left" ? "fd.row.copyRight" : "fd.row.copyLeft")}
              aria-label={t(side === "left" ? "fd.row.copyRight" : "fd.row.copyLeft")}
              onClick={(e) => {
                e.stopPropagation();
                onCopyRow(i);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {side === "left" ? <ArrowToRightIcon /> : <ArrowToLeftIcon />}
            </button>
          </span>
        )}
        <span className="num">{cell?.number ?? ""}</span>
        {editing && editing.side === side && editing.row === i ? (
          <input
            className="line-edit"
            value={editing.text}
            autoFocus
            spellCheck={false}
            aria-label={editing.insert ? t("fd.edit.new") : t("fd.edit.line", { n: editing.at + 1 })}
            onChange={(e) => onEditText(e.currentTarget.value)}
            onBlur={() => onEndEdit("confirm")}
            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") onEndEdit(e.ctrlKey || e.metaKey ? "next" : "confirm");
              else if (e.key === "Escape") onEndEdit("cancel");
              else if (e.key === "Delete" && (e.ctrlKey || e.metaKey)) onEndEdit("delete");
              else return;
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        ) : (
          <Code cell={cell} showSpaces={showSpaces} hits={search?.byRow.get(i)} currentHit={search?.current?.row === i ? search.current.start : null} />
        )}
      </div>,
    );
  }

  // The left pane shows no scroll bars (it follows the right one): to be able to
  // reach the same position at the bottom it needs the space of the horizontal bar.
  const extra = side === "left" ? SCROLLBAR_ALLOWANCE : 0;

  return (
    <div
      className={`pane ${side}`}
      ref={scrollerRef}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="region"
      aria-label={t(side === "left" ? "lp.left" : "lp.right")}
      title={editable ? t("fd.pane.editHint") : undefined}
    >
      <PaneCopyButton
        show={showCopy && !editing}
        onCopy={onCopy}
        range={rangeRows === null ? undefined : { side, count: rangeRows, onCopy: onCopyRange }}
      />
      <div
        className="pane-inner"
        style={{
          height: total * ROW_HEIGHT + extra,
          minWidth: `calc(4.5rem + ${width}ch + 2rem)`,
        }}
      >
        {items}
      </div>
    </div>
  );
}
