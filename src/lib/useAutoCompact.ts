import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useSettings } from "../settingsContext";

/** The bar has wrapped: some child is lower than the first. */
export function isWrapped(bar: HTMLElement): boolean {
  const kids = Array.from(bar.children) as HTMLElement[];
  if (kids.length < 2) return false;
  const top = kids[0].offsetTop;
  return kids.some((k) => k.offsetTop - top > 8);
}

/**
 * Switches by itself to the compact bar when the normal one does not fit on one row. It is not based on a
 * fixed width (fonts change from system to system): when the normal bar wraps it remembers
 * the width at which it happened and goes back to the normal one only beyond that (with a little margin, so as not to
 * oscillate). With `enabled` false (the compact one is already chosen, or there is no bar) it does nothing.
 */
export function useAutoCompact(bar: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [auto, setAuto] = useState(false);
  const [limit, setLimit] = useState(0);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || !enabled) return;
    const check = () => {
      const width = el.getBoundingClientRect().width;
      if (!auto && isWrapped(el)) {
        setLimit(width);
        setAuto(true);
      } else if (auto && width > limit + 24) {
        setAuto(false);
      }
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [bar, enabled, auto, limit]);
  return enabled && auto;
}

/**
 * The compact toolbar of a screen: chosen from the View menu (`compactToolbar`) or,
 * if the normal one does not fit on one row, adopted by itself. Returns the reference to put on the bar
 * and whether to show it compact.
 */
export function useCompactToolbar() {
  const setting = useSettings().compactToolbar;
  const barRef = useRef<HTMLDivElement>(null);
  const auto = useAutoCompact(barRef, !setting);
  return { barRef, compact: setting || auto };
}
