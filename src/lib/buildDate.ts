/** The build date, in the format of the interface: "17 October 2026, 10:07". */
export function formatBuildDate(iso: string, lang = "it", timeZone?: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone })
    .format(d)
    .replace(" alle ore ", ", ")
    .replace(" alle ", ", ")
    .replace(" at ", ", ");
}
