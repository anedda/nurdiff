import { useT } from "../i18n/context";
import { CollapseAllIcon, ExpandAllIcon, RefreshIcon } from "./icons";

/**
 * The tools of the folder bar: Expand, Collapse and Refresh, all with icon and text (Refresh on
 * the right). They are used by both the comparison and the preview, with different tooltips (in the preview nothing
 * is compared).
 */
export default function DirTools({
  onExpand,
  onCollapse,
  onRefresh,
  busy = false,
  titles,
  offReason,
}: {
  onExpand: () => void;
  onCollapse: () => void;
  onRefresh?: () => void;
  /** Disables Refresh while a comparison is in progress. */
  busy?: boolean;
  titles: { expand: string; collapse: string; refresh: string };
  /** Expand and Collapse do nothing in the current view: they are disabled, and this is the tooltip that says why. */
  offReason?: string;
}) {
  const t = useT();
  return (
    <>
      <div className="dir-tools">
        <button type="button" className="merge-btn" title={offReason ?? titles.expand} aria-label={t("dir.tool.expand")} disabled={offReason !== undefined} onClick={onExpand}>
          <span className="tb-icon"><ExpandAllIcon /></span>
          <span className="tb-label">{t("dir.tool.expand")}</span>
        </button>
        <button type="button" className="merge-btn" title={offReason ?? titles.collapse} aria-label={t("dir.tool.collapse")} disabled={offReason !== undefined} onClick={onCollapse}>
          <span className="tb-icon"><CollapseAllIcon /></span>
          <span className="tb-label">{t("dir.tool.collapse")}</span>
        </button>
      </div>
      <button type="button" className="merge-btn refresh-btn" title={titles.refresh} aria-label={t("tb.refresh")} disabled={busy || !onRefresh} onClick={onRefresh}>
        <span className="tb-icon"><RefreshIcon /></span>
        <span className="tb-label">{t("tb.refresh")}</span>
      </button>
    </>
  );
}
