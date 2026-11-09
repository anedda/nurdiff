/** A manual alignment: row on the left and row on the right (numbers from 1). */
export type AlignPair = [number, number];

/** The same alignments after swapping the two sides: the pairs are flipped and stay in order. */
export function swapAligns(aligns: readonly AlignPair[]): AlignPair[] {
  return aligns.map(([l, r]): AlignPair => [r, l]).sort((a, b) => a[0] - b[0]);
}
