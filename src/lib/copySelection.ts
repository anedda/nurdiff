/**
 * The text selected in the panes of the file comparison, without the row numbers and the signs (`+`/`−`):
 * one line per row, with the first and last cut where the selection ends. The rows are the ones
 * drawn (`.vrow` with its `.code`), because the others are not in the DOM. With visible spaces, whole
 * rows are copied from the real text (`data-text`), not from the one with the dots. `null` if nothing is selected
 * in `root` (then the browser copies as usual).
 */
export function selectedCodeText(root: ParentNode, selection: Selection | null): string | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const lines: string[] = [];
  for (const row of root.querySelectorAll<HTMLElement>(".vrow")) {
    if (!range.intersectsNode(row)) continue;
    const code = row.querySelector<HTMLElement>(".code");
    if (!code) continue;
    if (selection.containsNode(code, false)) {
      lines.push(code.dataset.text ?? code.textContent ?? "");
      continue;
    }
    // Cut row: only the part of the text that falls inside the selection.
    const part = document.createRange();
    part.selectNodeContents(code);
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
    // An empty row reached by the selection counts as a row (its line break is in the selection, as in a normal copy).
    if (!part.collapsed || !code.textContent) lines.push(part.toString());
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * The rows of the side-by-side panes the selection takes (`data-row`, the index among the rows shown): the first and the last. A
 * row counts when the selection takes some of its text, or when it is empty and the selection goes through it,
 * as for the copy. `null` if nothing is selected in `root`.
 */
export function selectedRows(root: ParentNode, selection: Selection | null): { first: number; last: number } | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  let first = Infinity;
  let last = -Infinity;
  for (const row of root.querySelectorAll<HTMLElement>(".vrow[data-row]")) {
    if (!range.intersectsNode(row)) continue;
    const code = row.querySelector<HTMLElement>(".code");
    if (!code) continue;
    let counts = selection.containsNode(code, false);
    if (!counts) {
      const part = document.createRange();
      part.selectNodeContents(code);
      if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
      if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
      counts = !part.collapsed || !code.textContent;
    }
    if (!counts) continue;
    const index = Number(row.dataset.row);
    first = Math.min(first, index);
    last = Math.max(last, index);
  }
  return first <= last ? { first, last } : null;
}

/** Puts some text on the clipboard. True if it worked (with a fallback for engines that lack the async API). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback: a temporary text field and the copy command.
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }
}
