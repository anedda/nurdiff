import { useRef } from "react";

/**
 * A value that is redone only when `key` changes (and not when the function `make` changes, which is usually
 * new at every render). It is used for a cache or a request that must start from scratch with
 * another comparison or after a merge: the key says when, without "unread" dependencies in a `useMemo`.
 */
export function useKeyed<T>(make: () => T, key: string): T {
  const slot = useRef<{ key: string; value: T } | null>(null);
  if (slot.current === null || slot.current.key !== key) slot.current = { key, value: make() };
  return slot.current.value;
}

/**
 * "Bring row `index` into view": a new object (so a new scroll request for
 * `VirtualList`) at every change of `index` or `trigger`, even if the position stays the same.
 * With a negative `index` there is no request.
 */
export function useRevealRequest(index: number, trigger: string | number): { index: number } | null {
  return useKeyed(() => (index >= 0 ? { index } : null), `${index}:${trigger}`);
}
