import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { MergeDirection, OpenedDiff, Side } from "../types";
import { stepHunk, type Hunk } from "./hunks";
import type { EditEnd } from "./useLineEditing";
import { scrollTopForRow } from "./virtual";

/** How many operations the view remembers in order to reselect the block on undo (like Rust). */
const MAX_UNDO = 100;

/** The focus is in a text field: there Ctrl+Z undoes the typing, not the merges. */
export function typingInField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/**
 * The current block and the operations that change it: going to a block or to a neighbouring one, merging, undoing,
 * saving, and the keyboard shortcuts (Alt+arrows, Ctrl+S, Ctrl+Z). After a merge, an undo or an
 * edit the selection moves to the right block when the new result arrives.
 *
 * The state it shares with the rest of the view (`current`, `pendingSelect`, `merged`, `saveAfter`) lives in
 * whoever uses it, which resets it at every new comparison.
 */
export function useHunkNavigation(o: {
  diff: OpenedDiff;
  /** The blocks of the view in use and how many rows it has (for scrolling). */
  vHunks: Hunk[];
  vTotal: number;
  rowHeight: number;
  busy: boolean;
  active: boolean;
  rightRef: RefObject<HTMLDivElement>;
  current: number;
  setCurrent: Dispatch<SetStateAction<number>>;
  /** Block to select when the result of an operation arrives (-1 = none, null = nothing to do). */
  pendingSelect: MutableRefObject<number | null>;
  /** Blocks touched recently, to reselect them on undo (-1: a row edit). */
  merged: MutableRefObject<number[]>;
  /** Ctrl+S during editing: confirms the row and, with the new result, saves. */
  saveAfter: MutableRefObject<boolean>;
  editingRef: MutableRefObject<unknown>;
  endEditRef: MutableRefObject<(how: EditEnd) => Promise<void>>;
  setAlignNote: (show: boolean) => void;
  onMerge: (hunk: number, direction: MergeDirection) => Promise<boolean>;
  onUndo: () => Promise<boolean>;
  onSave: (side: Side) => Promise<boolean>;
}) {
  const { diff, vHunks, vTotal, rowHeight, busy, active, rightRef, current, setCurrent, pendingSelect, merged, saveAfter } = o;
  const { editingRef, endEditRef, setAlignNote, onMerge, onUndo, onSave } = o;
  const { hunks } = diff;

  const goTo = useCallback(
    (index: number) => {
      setCurrent(index);
      const hunk = vHunks[index];
      const el = rightRef.current;
      if (!hunk || !el) return;
      el.scrollTop = scrollTopForRow(hunk.start, el.clientHeight, rowHeight, vTotal);
    },
    [vHunks, vTotal, rightRef, rowHeight, setCurrent],
  );

  const step = useCallback(
    (direction: 1 | -1) => goTo(stepHunk(current, hunks.length, direction)),
    [current, hunks.length, goTo],
  );

  /**
   * Runs an operation that changes the comparison. The selection is prepared before asking for it: React can
   * redraw with the new comparison before the answer arrives here, and the effect below must already know it.
   * `index` is the block to reselect on undo (-1: none).
   */
  const tracked = useCallback(
    async (index: number, operation: () => Promise<boolean>): Promise<boolean> => {
      pendingSelect.current = index;
      const hadAligns = diff.aligns.length > 0;
      const ok = await operation();
      if (ok) {
        if (hadAligns) setAlignNote(true);
        merged.current.push(index);
        if (merged.current.length > MAX_UNDO) merged.current.shift();
      } else {
        pendingSelect.current = null;
      }
      return ok;
    },
    [diff.aligns.length, setAlignNote, pendingSelect, merged],
  );

  const merge = useCallback(
    async (direction: MergeDirection) => {
      if (current < 0 || busy) return;
      // No copying towards a read-only side.
      if (direction === "leftToRight" ? diff.rightReadOnly : diff.leftReadOnly) return;
      await tracked(current, () => onMerge(current, direction));
    },
    [current, busy, onMerge, diff.leftReadOnly, diff.rightReadOnly, tracked],
  );

  const undo = useCallback(async () => {
    if (!diff.canUndo || busy) return;
    pendingSelect.current = merged.current[merged.current.length - 1] ?? -1;
    const hadAligns = diff.aligns.length > 0;
    if (await onUndo()) {
      if (hadAligns) setAlignNote(true);
      merged.current.pop();
    } else pendingSelect.current = null;
  }, [diff.canUndo, diff.aligns.length, busy, onUndo, pendingSelect, merged, setAlignNote]);

  const saveAll = useCallback(async () => {
    if (busy) return;
    const sides: Side[] = [];
    if (diff.leftDirty && !diff.leftReadOnly) sides.push("left");
    if (diff.rightDirty && !diff.rightReadOnly) sides.push("right");
    for (const side of sides) {
      if (!(await onSave(side))) break;
    }
  }, [busy, diff.leftDirty, diff.rightDirty, diff.leftReadOnly, diff.rightReadOnly, onSave]);

  // The effects that follow start only when a new result arrives (`diff.revision`): the functions
  // and the blocks are those of the new result, read from the reference instead of the dependencies.
  const afterResult = useRef({ goTo, hunksCount: hunks.length, saveAll });
  afterResult.current = { goTo, hunksCount: hunks.length, saveAll };

  // After a merge the copied difference disappears: it moves to the one that takes its place.
  // After an undo it goes back to the restored one.
  useEffect(() => {
    const index = pendingSelect.current;
    if (index === null) return;
    pendingSelect.current = null;
    const { goTo: go, hunksCount } = afterResult.current;
    const next = Math.min(index, hunksCount - 1);
    if (index < 0 || next < 0) setCurrent(-1);
    else go(next);
  }, [diff.revision, pendingSelect, setCurrent]);

  // Ctrl+S during editing: first the row is confirmed, then, with the new result, it is saved.
  useEffect(() => {
    if (!saveAfter.current) return;
    saveAfter.current = false;
    void afterResult.current.saveAll();
  }, [diff.revision, saveAfter]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current) {
        // While a row is being edited only the field's shortcuts apply; Ctrl+S confirms and saves.
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveAfter.current = true;
          void endEditRef.current("confirm");
        }
        return;
      }
      if (e.altKey) {
        const keys: Record<string, () => void> = {
          ArrowDown: () => step(1),
          ArrowUp: () => step(-1),
          Home: () => goTo(0),
          End: () => goTo(hunks.length - 1),
          ArrowRight: () => void merge("leftToRight"),
          ArrowLeft: () => void merge("rightToLeft"),
        };
        const action = keys[e.key];
        if (action) {
          e.preventDefault();
          action();
        }
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          void saveAll();
        } else if (e.key.toLowerCase() === "z" && !typingInField(e.target)) {
          e.preventDefault();
          void undo();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, step, merge, undo, saveAll, goTo, hunks.length, editingRef, endEditRef, saveAfter]);

  return { goTo, step, merge, undo, saveAll, tracked };
}
