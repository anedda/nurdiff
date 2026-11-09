import { useT } from "../i18n/context";
import { describeFile } from "../lib/describeFile";
import { describeMinor } from "../lib/minor";
import type { OpenedDiff, Side } from "../types";

interface FileMetaProps {
  diff: OpenedDiff;
  /** An operation is running: the save buttons are disabled. */
  busy: boolean;
  onSave: (side: Side) => Promise<boolean>;
}

/**
 * The line under the toolbar of a file comparison: what each file is (lines, encoding, line ending), its state (read
 * only, unsaved, with a Save button) and the notes about the comparison: approximate result, differences that are only
 * minor, or encoding and line ending that differ.
 */
export default function FileMeta({ diff, busy, onSave }: FileMetaProps) {
  const t = useT();
  const { left, right } = diff;
  const metaDiffers = left.encoding !== right.encoding || left.eol !== right.eol;

  /** The text of one side with its state. */
  const side = (which: Side) => {
    const info = which === "left" ? left : right;
    const readOnly = which === "left" ? diff.leftReadOnly : diff.rightReadOnly;
    const dirty = which === "left" ? diff.leftDirty : diff.rightDirty;
    return (
      <span>
        {describeFile(info, t)}
        {readOnly && <em className="readonly"> · {t("fd.readonly")}</em>}
        {dirty && <strong className="dirty"> · ● {t("fd.dirty")}</strong>}
        {dirty && !readOnly && (
          <button type="button" className="meta-save" title={t(which === "left" ? "fd.tb.saveLeft.title" : "fd.tb.saveRight.title")} aria-label={t(which === "left" ? "fd.tb.saveLeft.name" : "fd.tb.saveRight.name")} disabled={busy} onClick={() => void onSave(which)}>
            {t("fd.tb.save")}
          </button>
        )}
      </span>
    );
  };

  return (
    <>
      <div className="file-meta">
        {side("left")}
        {side("right")}
      </div>
      {diff.approximate && (
        <p className="notice approximate-note" role="status" title={t("fd.approximate.hint")}>
          {t("fd.approximate")}
        </p>
      )}
      {diff.minor ? (
        <p className="notice minor-note" role="status">
          {t(diff.identical ? "fd.minor.identical" : "fd.minor.different", { causes: describeMinor(diff.minor, t) })}
        </p>
      ) : (
        metaDiffers && <p className="notice">{t("fd.metaDiffers")}</p>
      )}
    </>
  );
}
