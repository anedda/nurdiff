import { useState } from "react";

/**
 * Tells whether the result of asynchronous work still applies: `start()` gives the check to call when the
 * result arrives, `bump()` makes everything started before it stale (new folders, a new comparison, a new read).
 */
export class Generation {
  private n = 0;

  start(): () => boolean {
    const at = this.n;
    return () => this.n !== at;
  }

  bump(): void {
    this.n += 1;
  }
}

/** A `Generation` that lives as long as the component. */
export function useGeneration(): Generation {
  const [generation] = useState(() => new Generation());
  return generation;
}
