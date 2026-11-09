/** Width of a tab: the same as the pane rows and the core. */
export const TAB_SIZE = 4;

/**
 * Makes spaces and tabs visible: every space becomes `·` and every tab an
 * arrow `→` followed by spaces up to the next column (so the columns stay aligned).
 * `startCol` is the column where the text starts, to process one piece of a row at a time;
 * it also returns the column reached.
 */
export function visibleWhitespace(
  text: string,
  startCol = 0,
  tabSize = TAB_SIZE,
): { text: string; col: number } {
  let out = "";
  let col = startCol;
  for (const ch of text) {
    if (ch === "\t") {
      const width = tabSize - (col % tabSize);
      out += "→" + " ".repeat(width - 1);
      col += width;
    } else if (ch === " ") {
      out += "·";
      col += 1;
    } else {
      out += ch;
      col += ch.length;
    }
  }
  return { text: out, col };
}
