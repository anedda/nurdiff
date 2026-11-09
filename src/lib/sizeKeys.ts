import type { SizeAction } from "./settings";

/**
 * The size action a key asks for: Ctrl +, Ctrl - and Ctrl 0 (Cmd on the Mac). `+` is often typed with Shift and `=`
 * is the same key without it, so both make the text bigger; Shift does not matter. `null` for anything else.
 */
export function sizeKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): SizeAction | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === "+" || e.key === "=") return "bigger";
  if (e.key === "-" || e.key === "_") return "smaller";
  if (e.key === "0") return "reset";
  return null;
}
