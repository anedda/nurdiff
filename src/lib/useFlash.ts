import { useCallback, useEffect, useRef, useState } from "react";

/** A notice that turns on and off by itself after `ms` milliseconds: `[on, turnOn]`. */
export function useFlash(ms = 1800): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | null>(null);
  const show = useCallback(() => {
    setOn(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), ms);
  }, [ms]);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  return [on, show];
}
