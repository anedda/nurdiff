import { useRef, useState } from "react";
import { describeError, type Translate } from "../i18n";

/**
 * One operation at a time (comparison, merge, save): `exclusive` runs the work if no other is in
 * progress, marks the application as busy (`busy`) and shows any error (`error`). `working` is the same
 * state in a reference, for whoever reads it from an event registered only once.
 */
export function useExclusive(t: Translate) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = useRef(false);

  /** Runs an operation that occupies the application and shows any error. */
  async function exclusive<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (working.current) return undefined;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (e) {
      // The errors of the Tauri commands arrive as a string
      setError(describeError(e, t));
      return undefined;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return { busy, error, setError, working, exclusive };
}
