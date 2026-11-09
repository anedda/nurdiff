import { useT } from "../i18n/context";
import type { Side } from "../types";
import { ArrowToLeftIcon, ArrowToRightIcon, CopyIcon } from "./icons";

/**
 * The copy icon at the top right of a pane, while the pane has selected text. It sits in a
 * zero-height "sticky" container (it does not move the rows and does not scroll with them). The click must not clear the
 * selection or the focus, so `mousedown` is stopped.
 */
export default function PaneCopyButton({
  show,
  onCopy,
  range,
}: {
  show: boolean;
  onCopy: () => void;
  /** Next to the icon: copies the selected rows to the other side (the arrow points to it). */
  range?: { side: Side; count: number; onCopy: () => void };
}) {
  const t = useT();
  if (!show) return null;
  return (
    <div className="pane-copy">
      {range && (
        <button
          type="button"
          className="pane-range-btn pane-copy-range"
          title={t(range.side === "left" ? "fd.copyRows.toRight" : "fd.copyRows.toLeft", { count: range.count })}
          aria-label={t(range.side === "left" ? "fd.copyRows.toRight" : "fd.copyRows.toLeft", { count: range.count })}
          onMouseDown={(e) => e.preventDefault()}
          onClick={range.onCopy}
        >
          {range.side === "left" ? <ArrowToRightIcon /> : <ArrowToLeftIcon />}
          <span>{range.count}</span>
        </button>
      )}
      <button
        type="button"
        className="pane-copy-btn"
        title={t("fd.copySelection")}
        aria-label={t("fd.copySelection")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCopy}
      >
        <CopyIcon />
      </button>
    </div>
  );
}
