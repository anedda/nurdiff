import { useCallback, useEffect, useRef, useState } from "react";
import { openConflicts, releaseDiff, resolveConflict, saveConflicts, undoConflicts } from "../api";
import type { ConflictView, Resolution } from "../types";

/**
 * The file with conflict markers of a tab: it opens it, keeps what the core answers after every choice and frees it when the
 * tab goes away. One operation at a time; an error does not close the file, it is shown and can be dismissed.
 */
export function useConflicts(path: string) {
  const [view, setView] = useState<ConflictView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const id = useRef<number | null>(null);
  const working = useRef(false);

  useEffect(() => {
    let alive = true;
    openConflicts(path)
      .then((v) => {
        if (!alive) {
          releaseDiff(v.id).catch(() => {});
          return;
        }
        id.current = v.id;
        setView(v);
      })
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
      if (id.current !== null) releaseDiff(id.current).catch(() => {});
      id.current = null;
    };
  }, [path]);

  /** Runs an operation on the open file and shows the new state; false if it did not run or failed. */
  const run = useCallback(async (work: (id: number) => Promise<ConflictView>): Promise<boolean> => {
    if (id.current === null || working.current) return false;
    working.current = true;
    setBusy(true);
    try {
      setView(await work(id.current));
      setError(null);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }, []);

  const resolve = useCallback((index: number, resolution: Resolution) => run((i) => resolveConflict(i, index, resolution)), [run]);
  const undo = useCallback(() => run((i) => undoConflicts(i)), [run]);
  const save = useCallback(() => run((i) => saveConflicts(i)), [run]);
  const clearError = useCallback(() => setError(null), []);

  return { view, error, busy, resolve, undo, save, clearError };
}
