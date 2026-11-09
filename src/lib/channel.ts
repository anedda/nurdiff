import { useState } from "react";

let last = 0;

/**
 * A name of its own for the cancellable work of a component (folder comparison, sizes, scan): the core keeps an
 * epoch for each one, so cancelling in one tab does not stop the work of the others.
 */
export function useChannel(prefix: string): string {
  const [channel] = useState(() => `${prefix}${++last}`);
  return channel;
}
