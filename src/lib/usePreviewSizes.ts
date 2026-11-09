import { useEffect, useRef, useState } from "react";
import { cancelDirectorySizes, directorySize } from "../api";
import { key, swapSizes, type DirSize, type PreviewRow } from "./previewTree";
import { useChannel } from "./channel";
import { joinPath } from "./tree";
import { useRootsChange } from "./useRootsChange";

/** How many sizes are computed together. */
const MAX_PARALLEL = 3;

/**
 * Size of the folders of the preview: the system does not keep it, so the core computes it
 * by visiting the folder (in the background, at most three at a time, in list order).
 * Changing folders cancels everything; swapping them keeps the results already ready.
 * `paused` suspends new requests (while Expand opens folders they would restart at every level).
 */
export function usePreviewSizes(left: string, right: string, shown: readonly PreviewRow[], paused: boolean) {
  const channel = useChannel("sizes");
  const [sizes, setSizes] = useState<Record<string, DirSize>>({});
  const epoch = useRef<number | null>(null);
  const [ready, setReady] = useState(0);
  const asked = useRef(new Set<string>());
  const queue = useRef<{ k: string; path: string; forRoots: string; ep: number }[]>([]);
  const running = useRef(0);
  const current = useRef(`${left}\0${right}`);
  current.current = `${left}\0${right}`;

  /** Starts queued jobs up to the limit. Every finished job calls it again, whatever its epoch: after a restart
   * the new jobs wait for the slots of the old ones. */
  const pump = () => {
    while (running.current < MAX_PARALLEL && queue.current.length > 0) {
      const job = queue.current.shift()!;
      running.current += 1;
      setSizes((s) => ({ ...s, [job.k]: "loading" }));
      directorySize(job.path, job.ep, channel)
        .catch(() => "error" as const)
        .then((v) => {
          if (v !== null && current.current === job.forRoots && epoch.current === job.ep) {
            setSizes((s) => ({ ...s, [job.k]: v }));
          }
        })
        .finally(() => {
          running.current -= 1;
          latestPump.current();
        });
    }
  };
  const latestPump = useRef(pump);
  latestPump.current = pump;

  /** Cancels the computations in progress and starts new ones (new epoch); `keepDone` keeps those already finished. */
  const restart = (keepDone?: Record<string, DirSize>) => {
    setSizes(keepDone ?? {});
    asked.current = new Set(Object.keys(keepDone ?? {}));
    queue.current = [];
    epoch.current = null;
    cancelDirectorySizes(channel)
      .then((e) => {
        epoch.current = e;
        setReady((n) => n + 1);
      })
      .catch(() => {});
  };
  /** Removes from the queue the computations not yet started: they are redone when the rows become visible again. */
  const dropQueued = () => {
    for (const job of queue.current) asked.current.delete(job.k);
    queue.current = [];
  };

  useRootsChange(
    left,
    right,
    () => restart(swapSizes(sizes)),
    () => restart(),
  );
  // Closed: the jobs still running end without starting the queued ones.
  useEffect(
    () => () => {
      queue.current = [];
      void cancelDirectorySizes(channel).catch(() => {});
    },
    [channel],
  );

  useEffect(() => {
    const ep = epoch.current;
    if (ep === null || paused) return;
    const forRoots = `${left}\0${right}`;
    for (const row of shown) {
      for (const side of ["left", "right"] as const) {
        const entry = side === "left" ? row.pair.left : row.pair.right;
        const k = key(side, row.rel);
        if (entry?.kind !== "dir" || asked.current.has(k)) continue;
        asked.current.add(k);
        queue.current.push({ k, path: joinPath(side === "left" ? left : right, row.rel), forRoots, ep });
      }
    }
    latestPump.current();
  }, [shown, ready, paused, left, right]);

  return { sizes, restart: () => restart(), dropQueued };
}
