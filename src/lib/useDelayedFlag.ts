import { useEffect, useState } from "react";

/**
 * True only after `on` has stayed true for `ms` milliseconds in a row; it goes back to false immediately when
 * `on` goes back to false. It is used to avoid showing "Cancel" for short comparisons (and to avoid it being hit
 * by mistake with the second click of a double click on "Compare").
 */
export function useDelayedFlag(on: boolean, ms: number): boolean {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!on) {
      setFlag(false);
      return;
    }
    const id = setTimeout(() => setFlag(true), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return on && flag;
}
