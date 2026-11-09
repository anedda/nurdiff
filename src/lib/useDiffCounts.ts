import { useCallback, useEffect, useRef, useState } from "react";
import { fileDiffStats } from "../api";
import type { DirEntryDiff } from "../types";
import { countKey, tooLargeToCount, type DiffCount } from "./diffCounts";
import { joinPath } from "./tree";

/** How many counts are computed together. */
const MAX_PARALLEL = 3;

/**
 * The different rows of each file in the unified view of the folders. They are not computed in the comparison
 * (it would be slow on large trees): a row asks for it when it appears (`request`) and withdraws it if it
 * disappears before it starts (`cancel`). At most three at a time; the results stay as long as
 * the folders are the same, and they apply to the file with that size and that date.
 */
export function useDiffCounts(left: string, right: string) {
  const [counts, setCounts] = useState<Record<string, DiffCount>>({});
  const asked = useRef(new Set<string>());
  const queue = useRef<{ k: string; entry: DirEntryDiff }[]>([]);
  const running = useRef(0);
  const roots = useRef({ left, right, generation: 0 });
  roots.current.left = left;
  roots.current.right = right;

  // With other folders the old results are not valid and those in flight are discarded.
  useEffect(() => {
    roots.current.generation += 1;
    asked.current = new Set();
    queue.current = [];
    setCounts({});
  }, [left, right]);

  const pump = useCallback(() => {
    while (running.current < MAX_PARALLEL && queue.current.length > 0) {
      const { k, entry } = queue.current.shift()!;
      const { left: l, right: r, generation } = roots.current;
      running.current += 1;
      setCounts((c) => ({ ...c, [k]: "loading" }));
      fileDiffStats(joinPath(l, entry.path), joinPath(r, entry.path))
        .then((c): DiffCount => (c.kind === "lines" ? c : c.kind === "binary" ? "binary" : "large"))
        .catch((): DiffCount => "error")
        .then((result) => {
          if (roots.current.generation === generation) setCounts((c) => ({ ...c, [k]: result }));
        })
        .finally(() => {
          running.current -= 1;
          pump();
        });
    }
  }, []);

  const request = useCallback(
    (entry: DirEntryDiff) => {
      const k = countKey(entry);
      // Too large by its sizes: `countOf` already says so, without asking.
      if (asked.current.has(k) || tooLargeToCount(entry)) return;
      asked.current.add(k);
      queue.current.push({ k, entry });
      pump();
    },
    [pump],
  );

  const cancel = useCallback((entry: DirEntryDiff) => {
    const k = countKey(entry);
    const at = queue.current.findIndex((job) => job.k === k);
    if (at < 0) return;
    queue.current.splice(at, 1);
    asked.current.delete(k);
  }, []);

  return { counts, request, cancel };
}
