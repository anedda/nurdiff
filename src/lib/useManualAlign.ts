import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ContextItem } from "../components/ContextMenu";
import type { Translate } from "../i18n";
import type { Row, Side } from "../types";
import type { LineEdit } from "./useLineEditing";

/** The row marked as the first end of an alignment: the side and the row number (from 1). */
export interface PendingAlign {
  side: Side;
  number: number;
}

/**
 * The items of the right-click menu on a row of the manual alignment: mark the row, place it next to the
 * row marked on the other side, remove the mark, remove this alignment or all of them.
 */
export function alignMenuItems(o: {
  t: Translate;
  side: Side;
  row: Row;
  pending: PendingAlign | null;
  /** How many alignments there are in the comparison. */
  alignCount: number;
  onAlignWith: (number: number) => void;
  onMark: (side: Side, number: number) => void;
  onUnmark: () => void;
  onRemoveOne: (leftNumber: number) => void;
  onRemoveAll: () => void;
}): ContextItem[] {
  const { t, side, row, pending, alignCount } = o;
  const sideName = (s: Side) => t(s === "left" ? "fd.side.left" : "fd.side.right");
  const cell = side === "left" ? row.left : row.right;
  const items: ContextItem[] = [];
  if (!cell) {
    items.push({ label: t("fd.menu.noRow"), disabled: true });
  } else {
    if (pending && pending.side !== side) {
      items.push({
        label: t("fd.menu.align", { n: pending.number, side: sideName(pending.side) }),
        onSelect: () => o.onAlignWith(cell.number),
      });
    }
    items.push({
      label: t("fd.menu.mark", { n: cell.number, side: sideName(side) }),
      onSelect: () => o.onMark(side, cell.number),
    });
    if (pending) items.push({ label: t("fd.menu.unmark"), onSelect: o.onUnmark });
  }
  if (row.aligned && row.left) {
    const leftNumber = row.left.number;
    items.push({ label: t("fd.menu.removeOne"), separator: true, onSelect: () => o.onRemoveOne(leftNumber) });
  }
  if (alignCount > 0) {
    items.push({ label: t("fd.menu.removeAll", { n: alignCount }), separator: !row.aligned, onSelect: o.onRemoveAll });
  }
  return items;
}

/**
 * The manual alignment: places two chosen rows side by side (right-click on one, then on the other). The state (the row
 * marked, the open menu, the notice) lives in whoever uses it, which resets it at every new comparison.
 */
export function useManualAlign(o: {
  t: Translate;
  active: boolean;
  busy: boolean;
  editingRef: MutableRefObject<LineEdit | null>;
  rowAt: (index: number) => Row | undefined;
  selectRow: (side: Side, row: number, reveal?: boolean) => void;
  pendingAlign: PendingAlign | null;
  setPendingAlign: Dispatch<SetStateAction<PendingAlign | null>>;
  menu: unknown;
  setMenu: (menu: { x: number; y: number; items: ContextItem[] } | null) => void;
  setAlignNote: (show: boolean) => void;
  alignCount: number;
  onAlign: (left: number, right: number) => Promise<boolean>;
  onUnalign: (left: number) => Promise<boolean>;
  onClearAligns: () => Promise<boolean>;
  onLocate: (side: Side, number: number) => Promise<number | null>;
  /** Brings the row to the centre of the window. */
  centerRow: (row: number) => void;
  /** Items for the row clicked (for example "Copy the line to the right"), after the extra ones and before the alignment. */
  rowItems?: (side: Side, row: number, r: Row) => ContextItem[];
  /** Items to put at the head of the menu (for example "Copy"), computed when it opens. */
  extraItems?: () => ContextItem[];
}) {
  const { t, active, busy, editingRef, rowAt, selectRow, pendingAlign, setPendingAlign, menu, setMenu, setAlignNote } = o;

  /** Places the marked row next to `number` of the other side and brings the aligned row into view. */
  const doAlign = async (side: Side, number: number) => {
    if (!pendingAlign) return;
    const [l, r] = side === "left" ? [number, pendingAlign.number] : [pendingAlign.number, number];
    setPendingAlign(null);
    if (await o.onAlign(l, r)) {
      setAlignNote(false);
      const row = await o.onLocate("left", l);
      if (row !== null) {
        selectRow("left", row, true);
        o.centerRow(row);
      }
    }
  };

  const openMenu = (side: Side, row: number, x: number, y: number) => {
    if (busy || editingRef.current) return;
    const r = rowAt(row);
    if (!r) return;
    // With some text selected ("Copy" is there) the selected row does not move: the right click must not lose the selection.
    const extra = o.extraItems?.() ?? [];
    if (extra.length === 0) selectRow(side, row);
    const own = alignMenuItems({
      t,
      side,
      row: r,
      pending: pendingAlign,
      alignCount: o.alignCount,
      onAlignWith: (number) => void doAlign(side, number),
      onMark: (s, number) => setPendingAlign({ side: s, number }),
      onUnmark: () => setPendingAlign(null),
      onRemoveOne: (leftNumber) => void o.onUnalign(leftNumber),
      onRemoveAll: () => void o.onClearAligns(),
    });
    // The groups of items go one after the other, each separated from the previous one.
    const groups = [extra, o.rowItems?.(side, row, r) ?? [], own].filter((g) => g.length > 0);
    const items = groups.flatMap((g, i) => (i === 0 ? g : [{ ...g[0], separator: true }, ...g.slice(1)]));
    setMenu({ x, y, items });
  };

  // Esc clears the marked row (if no row is being edited and no menu is open).
  useEffect(() => {
    if (!pendingAlign || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editingRef.current && !menu) setPendingAlign(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingAlign, active, menu, editingRef, setPendingAlign]);

  return { openMenu };
}
