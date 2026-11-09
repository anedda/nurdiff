import type { Translate } from "../i18n";

/** The text of the confirmation before closing NurDiff, or null if there is nothing to lose. */
export function discardMessage(dirtyTitles: string[], t: Translate): string | null {
  if (dirtyTitles.length === 0) return null;
  const names = dirtyTitles.map((title) => `«${title}»`).join(", ");
  return t("app.confirm.closeApp", { names });
}
