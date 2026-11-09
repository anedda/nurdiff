/**
 * Cache of rows loaded in blocks ("chunks") of fixed size.
 *
 * The comparison lives in Rust: the UI only asks for the blocks needed by the visible window
 * and keeps the last `maxChunks` used in memory. Chunk `i` contains the rows
 * `[i * chunkSize, (i + 1) * chunkSize)`, except the last one, which goes up to `total`.
 */

/** Rows per request: ~80 KB of JSON with rows of typical length. */
export const CHUNK_SIZE = 500;
/** Blocks kept in memory (50000 rows with the default values). */
export const MAX_CHUNKS = 100;

/** Range `[first, last]` (inclusive) of the chunks that cover the rows `[start, end)`. */
export function chunkRange(
  start: number,
  end: number,
  chunkSize: number,
  total: number,
): [number, number] | null {
  if (total <= 0) return null;
  const from = Math.max(0, Math.min(start, total - 1));
  const to = Math.max(from, Math.min(end, total) - 1);
  return [Math.floor(from / chunkSize), Math.floor(to / chunkSize)];
}

/** Rows `[start, end)` covered by chunk `index`. */
export function chunkBounds(index: number, chunkSize: number, total: number): [number, number] {
  const start = index * chunkSize;
  return [Math.min(start, total), Math.min(start + chunkSize, total)];
}

export class ChunkCache<T> {
  // The insertion order of the Map is the order of use: the first is the least recent.
  private chunks = new Map<number, T[]>();
  private pending = new Set<number>();

  constructor(
    readonly chunkSize: number = CHUNK_SIZE,
    readonly maxChunks: number = MAX_CHUNKS,
  ) {}

  get size(): number {
    return this.chunks.size;
  }

  has(chunk: number): boolean {
    return this.chunks.has(chunk);
  }

  /** The row `index`, if its chunk is in the cache. */
  row(index: number): T | undefined {
    if (index < 0) return undefined;
    return this.chunks.get(Math.floor(index / this.chunkSize))?.[index % this.chunkSize];
  }

  /** Marks the chunks from `first` to `last` (inclusive) as used, so they are not the first to be discarded. */
  touch(first: number, last: number): void {
    for (let c = first; c <= last; c++) {
      const rows = this.chunks.get(c);
      if (rows) {
        this.chunks.delete(c);
        this.chunks.set(c, rows);
      }
    }
  }

  /** Chunks from `first` to `last` neither in the cache nor already requested. */
  missing(first: number, last: number): number[] {
    const result: number[] = [];
    for (let c = first; c <= last; c++) {
      if (!this.chunks.has(c) && !this.pending.has(c)) result.push(c);
    }
    return result;
  }

  markPending(chunk: number): void {
    this.pending.add(chunk);
  }

  /** The request failed: the chunk can be requested again. */
  clearPending(chunk: number): void {
    this.pending.delete(chunk);
  }

  /** Inserts a chunk that arrived; discards the least recent ones beyond the limit. */
  set(chunk: number, rows: T[]): void {
    this.pending.delete(chunk);
    this.chunks.delete(chunk);
    this.chunks.set(chunk, rows);
    while (this.chunks.size > this.maxChunks) {
      const oldest = this.chunks.keys().next().value as number;
      this.chunks.delete(oldest);
    }
  }
}
