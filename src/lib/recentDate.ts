import type { Translate } from "../i18n";
import { formatDate } from "./format";

/**
 * When a recent comparison was made, for the Home: «Today · 21:57», «Yesterday · 21:57» and, for older ones,
 * the date and the time. The days are those of the calendar of the user, not 24-hour periods.
 */
export function describeRecentDate(at: number, now: number, t: Translate, lang: string): string {
  const when = new Date(at);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(when)) / 86_400_000);
  if (days !== 0 && days !== 1) return formatDate(at);
  const time = when.toLocaleTimeString(lang === "auto" ? undefined : lang, { hour: "2-digit", minute: "2-digit" });
  return `${t(days === 0 ? "home.today" : "home.yesterday")} · ${time}`;
}
