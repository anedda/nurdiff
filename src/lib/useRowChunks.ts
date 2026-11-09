import { useCallback, useEffect, useReducer, useRef } from "react";
import { CHUNK_SIZE, ChunkCache, chunkBounds, chunkRange } from "./chunks";
import { useKeyed } from "./useKeyed";

/** Rows loaded beyond the edge of the visible window, to have scrolling ready. */
const PREFETCH_ROWS = CHUNK_SIZE / 2;

export type FetchRows<T> = (id: number, start: number, end: number) => Promise<T[]>;

/**
 * Provides the rows of a comparison loading them in blocks from `fetchRows` while the window
 * `[start, end)` moves. With another `revision` (after a merge) the rows already received
 * are discarded and requested again. Returns a function that gives the row `i`, or `undefined` if its
 * block has not arrived yet (the view shows a placeholder and redraws on arrival).
 */
export function useRowChunks<T>(
  id: number,
  revision: number,
  total: number,
  fetchRows: FetchRows<T>,
  start: number,
  end: number,
  onError: (error: unknown) => void,
): (index: number) => T | undefined {
  // A new comparison has a new cache: the late answers of the old one
  // end up in the old cache and do not disturb.
  const cache = useKeyed(() => new ChunkCache<T>(), `${id}:${revision}`);
  const current = useRef(cache);
  current.current = cache;
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  // The functions passed by the caller can change at every render: the latest one is used.
  const latest = useRef({ fetchRows, onError });
  latest.current = { fetchRows, onError };

  useEffect(() => {
    const range = chunkRange(start - PREFETCH_ROWS, end + PREFETCH_ROWS, CHUNK_SIZE, total);
    if (!range) return;
    const [first, last] = range;
    cache.touch(first, last);
    for (const chunk of cache.missing(first, last)) {
      const [from, to] = chunkBounds(chunk, CHUNK_SIZE, total);
      cache.markPending(chunk);
      latest.current
        .fetchRows(id, from, to)
        .then((rows) => {
          cache.set(chunk, rows);
          if (current.current === cache) redraw();
        })
        .catch((e) => {
          cache.clearPending(chunk);
          if (current.current === cache) latest.current.onError(e);
        });
    }
  }, [cache, id, total, start, end]);

  return useCallback((index: number) => cache.row(index), [cache]);
}
