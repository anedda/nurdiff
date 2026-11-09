import { useState } from "react";
import { exportFileReport, fileReportText, inTauri, pickSavePath, writeTextFile } from "../api";
import { copyToClipboard } from "../lib/copySelection";
import { dirReportCsv, dirReportHtml } from "../lib/dirReport";
import type { ReportSource } from "../types";
import { describeError } from "../i18n";
import { useLanguage, useT } from "../i18n/context";
import Modal from "./Modal";

type Format = "html" | "unified" | "csv";

const FORMATS: Record<ReportSource["kind"], { value: Format; labelKey: string; ext: string }[]> = {
  file: [
    { value: "html", labelKey: "report.fmt.html", ext: "html" },
    { value: "unified", labelKey: "report.fmt.unified", ext: "diff" },
  ],
  dirs: [
    { value: "html", labelKey: "report.fmt.html", ext: "html" },
    { value: "csv", labelKey: "report.fmt.csv", ext: "csv" },
  ],
};

/** Saves the result of the comparison of the foreground tab to a file to share. */
export default function ReportDialog({ source, onClose }: { source: ReportSource; onClose: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const formats = FORMATS[source.kind];
  const [format, setFormat] = useState<Format>("html");
  const [context, setContext] = useState<"3" | "10" | "all">("3");
  const [includeIdentical, setIncludeIdentical] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /** The texts of the HTML page of a file report, already translated (the core does not know the languages). */
  const fileLabels = () => ({
    lang,
    title: t("fileReport.title"),
    identical: t("fileReport.identical"),
    stats: t("fileReport.stats", { changed: "{changed}", leftOnly: "{leftOnly}", rightOnly: "{rightOnly}", equal: "{equal}" }),
    skipped: t("fileReport.skipped", { count: "{count}" }),
    generated: t("fileReport.generated", { date: "{date}" }),
    approximate: t("fileReport.approximate"),
  });
  const fileFormat = format === "unified" ? "unified" : "html";
  const fileContext = context === "all" ? null : Number(context);
  /** The report of the folders, composed here. */
  const dirText = (s: Extract<ReportSource, { kind: "dirs" }>) =>
    format === "csv" ? dirReportCsv(s.diff, includeIdentical, t) : dirReportHtml(s.diff, s.left, s.right, includeIdentical, t, lang);

  /** Runs an action with the dialog busy and shows its outcome; a failure shows its message. */
  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await action();
      if (text !== null) setMessage({ ok: true, text });
    } catch (e) {
      setMessage({ ok: false, text: describeError(e, t) });
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    inTauri
      ? run(async () => {
          const ext = formats.find((f) => f.value === format)?.ext ?? "html";
          const path = await pickSavePath(`nurdiff-report.${ext}`, t("report.filterName"), [ext]);
          if (!path) return null; // cancelled
          if (source.kind === "file") await exportFileReport(source.id, fileFormat, fileContext, fileLabels(), path);
          else await writeTextFile(path, dirText(source));
          return t("report.saved", { path });
        })
      : Promise.resolve(setMessage({ ok: false, text: t("report.onlyApp") }));

  /** The same report that is saved, put on the clipboard: to paste it into an email, a ticket or a document. */
  const copy = () =>
    source.kind === "file" && !inTauri
      ? Promise.resolve(setMessage({ ok: false, text: t("report.onlyApp") }))
      : run(async () => {
          const text = source.kind === "file" ? await fileReportText(source.id, fileFormat, fileContext, fileLabels()) : dirText(source);
          // A text, not an Error: `describeError` shows a text as it is.
          if (!(await copyToClipboard(text))) throw t("report.copyFailed");
          return t("report.copied");
        });

  return (
    <Modal title={t("report.title")} onClose={onClose}>
      <p className="muted">
        {source.left} ↔ {source.right}
      </p>
      <fieldset>
        <legend>{t("report.format")}</legend>
        {formats.map((f) => (
          <label className="check" key={f.value}>
            <input type="radio" name="report-format" checked={format === f.value} onChange={() => setFormat(f.value)} />
            {t(f.labelKey)}
          </label>
        ))}
      </fieldset>
      {source.kind === "file" ? (
        <label className="form-row">
          {t("report.context")}
          <select value={context} onChange={(e) => setContext(e.currentTarget.value as "3" | "10" | "all")}>
            <option value="3">3</option>
            <option value="10">10</option>
            <option value="all">{t("report.context.all")}</option>
          </select>
        </label>
      ) : (
        <label className="check">
          <input type="checkbox" checked={includeIdentical} onChange={(e) => setIncludeIdentical(e.currentTarget.checked)} />
          {t("report.includeSame")}
        </label>
      )}
      {source.kind === "file" && (
        <p className="hint">{t("report.hint")}</p>
      )}
      {message && <p className={message.ok ? "notice" : "error"}>{message.text}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {t("common.close")}
        </button>
        <button type="button" disabled={busy} title={t("report.copy.title")} onClick={() => void copy()}>
          {t("report.copy")}
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? t("report.saving") : t("report.save")}
        </button>
      </div>
    </Modal>
  );
}
