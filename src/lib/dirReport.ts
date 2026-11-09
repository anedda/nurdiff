import type { Translate } from "../i18n";
import type { DirDiff, DirEntryDiff, EntryStatus } from "../types";
import { formatDate, formatSize } from "./format";
import { describeMinor } from "./minor";
import { isMinor } from "./tree";

/** The status of an entry in words: for files that differ only in a minor way it also says why. */
export function statusText(e: DirEntryDiff, t: Translate): string {
  if (e.error) return t("dir.unreadable", { reason: e.error });
  return isMinor(e) && e.minor ? t("status.minor", { causes: describeMinor(e.minor, t) }) : t(STATUS_KEY[e.status]);
}

/** Translation key of the status of an entry. */
export const STATUS_KEY: Record<EntryStatus, string> = {
  identical: "status.identical",
  different: "status.different",
  leftOnly: "status.leftOnly",
  rightOnly: "status.rightOnly",
  typeMismatch: "status.typeMismatch",
  notCompared: "status.notCompared",
};

function isContainer(e: DirEntryDiff): boolean {
  return e.leftKind === "dir" && e.rightKind === "dir" && !e.error;
}

/** The entries to report: folders present on both sides only summarize their children and are omitted
 * (unless they could not be read: then they count, as in the summary). */
export function reportEntries(diff: DirDiff, includeIdentical: boolean): DirEntryDiff[] {
  return diff.entries.filter((e) => !isContainer(e) && (includeIdentical || e.status !== "identical"));
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function nameOf(e: DirEntryDiff): string {
  const isDir = e.leftKind === "dir" || e.rightKind === "dir";
  return e.path + (isDir ? "/" : "");
}

/** CSV field with quotes when needed (separator `;`, convenient for Excel in Italian). */
export function csvField(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function dirReportCsv(diff: DirDiff, includeIdentical: boolean, t: Translate): string {
  const head = ["path", "status", "sizeLeft", "sizeRight", "dateLeft", "dateRight"].map((k) => t(`dirReport.col.${k}`));
  const lines = [head.map(csvField).join(";")];
  for (const e of reportEntries(diff, includeIdentical)) {
    lines.push(
      [
        nameOf(e),
        statusText(e, t),
        e.leftSize === null ? "" : String(e.leftSize),
        e.rightSize === null ? "" : String(e.rightSize),
        formatDate(e.leftModified),
        formatDate(e.rightModified),
      ]
        .map(csvField)
        .join(";"),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

const STYLE = `:root{color-scheme:light dark;--bg:#fff;--fg:#1f2328;--muted:#656d76;--border:#d0d7de;--diff:#cf222e;--orphan:#1d4ed8;--warn:#9a6700}
@media(prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e6e8eb;--muted:#9aa3ad;--border:#3a3f47;--diff:#ff7b72;--orphan:#7aa2ff;--warn:#e3b341}}
body{margin:24px;background:var(--bg);color:var(--fg);font:15px system-ui,sans-serif}
h1{font-size:1.3rem;margin:0 0 4px}.meta,.stats,.foot{color:var(--muted);margin:2px 0}
table{border-collapse:collapse;width:100%;margin-top:16px;font-size:13px}
th,td{padding:3px 8px;border-bottom:1px solid var(--border);text-align:left}th{color:var(--muted);font-weight:600}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td.path{font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all}
tr.different td.s,tr.different td.path{color:var(--diff)}tr.leftOnly td.s,tr.rightOnly td.s,tr.leftOnly td.path,tr.rightOnly td.path{color:var(--orphan)}
tr.typeMismatch td.s{color:var(--warn)}tr.identical td{color:var(--muted)}`;

export function dirReportHtml(
  diff: DirDiff,
  left: string,
  right: string,
  includeIdentical: boolean,
  t: Translate,
  lang: string,
  generatedAt: Date = new Date(),
): string {
  const { stats } = diff;
  const rows = reportEntries(diff, includeIdentical)
    .map(
      (e) =>
        `<tr class="${e.status}"><td class="path">${esc(nameOf(e))}</td><td class="s">${esc(statusText(e, t))}</td>` +
        `<td class="num">${esc(formatSize(e.leftSize))}</td><td class="num">${esc(formatDate(e.leftModified))}</td>` +
        `<td class="num">${esc(formatSize(e.rightSize))}</td><td class="num">${esc(formatDate(e.rightModified))}</td></tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NurDiff – ${esc(left)} ↔ ${esc(right)}</title><style>${STYLE}</style></head><body>
<h1>${esc(t("dirReport.title"))}</h1>
<p class="meta">${esc(left)} ↔ ${esc(right)}</p>
<p class="stats">${esc(t("dirReport.stats", { ...stats }))}</p>
<table>
<tr>${["path", "status", "sizeLeft", "dateLeft", "sizeRight", "dateRight"].map((k) => `<th>${esc(t(`dirReport.col.${k}`))}</th>`).join("")}</tr>
${rows}
</table>
<p class="foot">${esc(t("dirReport.generated", { date: formatDate(generatedAt.getTime()) }))}</p>
</body></html>
`;
}
