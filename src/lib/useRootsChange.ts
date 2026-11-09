import { useEffect, useRef } from "react";
import { isSwap, type Roots } from "./previewTree";

/**
 * Calls `onSwapped` when the two folders swap sides and `onReplaced` when they really
 * change (and at start). The handlers are those of the last render, so they see the current
 * state without having to be among the dependencies of an effect.
 */
export function useRootsChange(left: string, right: string, onSwapped: () => void, onReplaced: () => void) {
  const handlers = useRef({ onSwapped, onReplaced });
  handlers.current = { onSwapped, onReplaced };
  const prev = useRef<Roots>({ left, right });
  useEffect(() => {
    const before = prev.current;
    prev.current = { left, right };
    if (isSwap(before, { left, right })) handlers.current.onSwapped();
    else handlers.current.onReplaced();
  }, [left, right]);
}
