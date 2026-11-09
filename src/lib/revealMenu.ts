import type { ContextItem } from "../components/ContextMenu";
import type { Translate } from "../i18n";

/**
 * The "Show in file manager" items of a row of the context menu. `left` and `right` are the
 * full paths of the entry on the two sides, or `null` where it is missing. With the entry on both sides
 * there are two (one per side, the first after a separator row); with one side only there is one,
 * without the indication of the side; if it is on neither side, none.
 */
export function revealItems(
  sides: { left: string | null; right: string | null },
  onReveal: (path: string) => void,
  t: Translate,
): ContextItem[] {
  const { left, right } = sides;
  if (left !== null && right !== null) {
    return [
      { label: t("dir.menu.revealLeft"), separator: true, onSelect: () => onReveal(left) },
      { label: t("dir.menu.revealRight"), onSelect: () => onReveal(right) },
    ];
  }
  const only = left ?? right;
  if (only === null) return [];
  return [{ label: t("dir.menu.reveal"), separator: true, onSelect: () => onReveal(only) }];
}
