import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Row, Side } from "../types";
import type { Hunk } from "./hunks";

/** The row being edited: in the pane `side`, at the row `row` of the view. */
export interface LineEdit {
  side: Side;
  row: number;
  /** Index (from 0) in the file of the row to replace, or where to insert if `insert`. */
  at: number;
  insert: boolean;
  text: string;
  original: string;
}

export type EditEnd = "confirm" | "next" | "delete" | "cancel";

/**
 * The direct edit of a row (one at a time): how it opens on a row or on an empty row, and how it
 * closes (confirm, confirm and open the row below, delete, cancel). The state (`editing`, `editingRef`) lives in
 * whoever uses it, which resets it when the comparison or the view changes; `runEdit` runs the edit and records its effects.
 */
export function useLineEditing(o: {
  setEditing: Dispatch<SetStateAction<LineEdit | null>>;
  editingRef: MutableRefObject<LineEdit | null>;
  busy: boolean;
  readOnly: { left: boolean; right: boolean };
  hunks: Hunk[];
  rowAt: (index: number) => Row | undefined;
  runEdit: (side: Side, at: number, remove: number, lines: string[]) => Promise<boolean>;
  onLocate: (side: Side, number: number) => Promise<number | null>;
  /** Brings the row just opened into view if it is not among the drawn ones. */
  revealRow: (row: number) => void;
}) {
  const { setEditing, editingRef, busy, readOnly, hunks, rowAt, runEdit, onLocate, revealRow } = o;
  // One close at a time: the field asks for it both with Enter and by losing focus.
  const committing = useRef(false);

  /** Where to insert a row before the empty row `row` of the side: after the last row the side has before. */
  const insertionIndex = (side: Side, row: number): number | null => {
    // An empty row is always inside a block: we look back to the start of the block
    // (with a filter, the rows before this one may be missing) and, if there is nothing, the block
    // says how many rows the side has before it.
    const hunk = hunks.find((h) => row >= h.start && row < h.end);
    for (let j = row - 1; j >= (hunk?.start ?? 0); j--) {
      const r = rowAt(j);
      if (!r) return null; // row not arrived yet: unknown
      const cell = side === "left" ? r.left : r.right;
      if (cell) return cell.number;
    }
    if (!hunk) return 0;
    return side === "left" ? hunk.leftAt : hunk.rightAt;
  };

  const startEdit = (side: Side, row: number) => {
    if (busy || editingRef.current) return;
    if (side === "left" ? readOnly.left : readOnly.right) return;
    const r = rowAt(row);
    if (!r) return;
    const cell = side === "left" ? r.left : r.right;
    if (cell) {
      setEditing({ side, row, at: cell.number - 1, insert: false, text: cell.text, original: cell.text });
    } else {
      const at = insertionIndex(side, row);
      if (at !== null) setEditing({ side, row, at, insert: true, text: "", original: "" });
    }
  };

  /** The line (number from 1) the row shows on the side, if the side is editable and nothing is being edited. */
  const lineOf = (side: Side, row: number): number | null => {
    if (busy || editingRef.current) return null;
    if (side === "left" ? readOnly.left : readOnly.right) return null;
    const r = rowAt(row);
    const cell = r && (side === "left" ? r.left : r.right);
    return cell ? cell.number : null;
  };

  /** Inserts an empty line below or above the row and opens it for typing (the menu of the row). */
  const insertLine = async (side: Side, row: number, where: "below" | "above") => {
    const number = lineOf(side, row);
    if (number === null) return;
    const at = where === "below" ? number : number - 1;
    if (!(await runEdit(side, at, 0, [""]))) return;
    const newRow = await onLocate(side, at + 1);
    if (newRow === null) return;
    setEditing({ side, row: newRow, at, insert: false, text: "", original: "" });
    revealRow(newRow);
  };

  /** Deletes the line of the row (the menu of the row). */
  const deleteLine = async (side: Side, row: number) => {
    const number = lineOf(side, row);
    if (number !== null) await runEdit(side, number - 1, 1, []);
  };

  /** Closes the edit: confirm, confirm and open a new row below, delete the row or cancel. */
  const endEdit = async (how: EditEnd) => {
    const e = editingRef.current;
    if (!e || committing.current) return;
    committing.current = true;
    editingRef.current = null;
    setEditing(null);
    try {
      if (how === "cancel") return;
      const remove = e.insert ? 0 : 1;
      if (how === "delete") {
        if (!e.insert) await runEdit(e.side, e.at, 1, []);
      } else if (how === "next") {
        if (await runEdit(e.side, e.at, remove, [e.text, ""])) {
          const row = await onLocate(e.side, e.at + 2);
          if (row !== null) {
            setEditing({ side: e.side, row, at: e.at + 1, insert: false, text: "", original: "" });
            revealRow(row);
          }
        }
      } else if (e.insert ? e.text !== "" : e.text !== e.original) {
        await runEdit(e.side, e.at, remove, [e.text]);
      }
    } finally {
      committing.current = false;
    }
  };

  return { startEdit, endEdit, insertLine, deleteLine };
}
