import { useT } from "../i18n/context";
import { ArrowToLeftIcon, ArrowToRightIcon, SaveIcon, UndoIcon } from "./icons";

/**
 * The merge in the file comparison bar: "Apply to right" and "Apply to left" (the frequent actions,
 * with text), Undo and Save (icon only). Save saves all the modified files, like Ctrl+S; to
 * save just one there is the button next to "modified" below the bar.
 */
export default function MergeBar({
  toRight,
  toLeft,
  undo,
  save,
}: {
  /** Copies the selected difference from left to right. */
  toRight: { disabled: boolean; title: string; onClick: () => void };
  /** Copies the selected difference from right to left. */
  toLeft: { disabled: boolean; title: string; onClick: () => void };
  undo: { disabled: boolean; onClick: () => void };
  save: { disabled: boolean; onClick: () => void };
}) {
  const t = useT();
  return (
    <div className="tb-cluster merge-bar" role="group" aria-label={t("fd.tb.merge")}>
      <div className="cluster-row">
        <button type="button" className="merge-btn" title={toRight.title} aria-label={t("fd.tb.applyRight")} disabled={toRight.disabled} onClick={toRight.onClick}>
          <span className="tb-icon"><ArrowToRightIcon /></span>
          <span className="tb-label">{t("fd.tb.applyRight")}</span>
        </button>
        <button type="button" className="merge-btn" title={toLeft.title} aria-label={t("fd.tb.applyLeft")} disabled={toLeft.disabled} onClick={toLeft.onClick}>
          <span className="tb-icon"><ArrowToLeftIcon /></span>
          <span className="tb-label">{t("fd.tb.applyLeft")}</span>
        </button>
        <button type="button" className="tb-square" title={t("fd.tb.undo.title")} aria-label={t("fd.tb.undo")} disabled={undo.disabled} onClick={undo.onClick}>
          <span className="tb-icon"><UndoIcon /></span>
        </button>
        <button type="button" className="tb-square" title={t("fd.tb.save.title")} aria-label={t("fd.tb.save")} disabled={save.disabled} onClick={save.onClick}>
          <span className="tb-icon"><SaveIcon /></span>
        </button>
      </div>
    </div>
  );
}
