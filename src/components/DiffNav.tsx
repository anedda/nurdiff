import { useT } from "../i18n/context";
import { ChevronDownIcon, ChevronUpIcon } from "./icons";

/**
 * Navigation between differences: [↑] [ 3 of 9 ] [↓]. The number is that of the current difference
 * (a block of contiguous rows), "–" until one is chosen. First and Last remain on the keyboard
 * (Alt+Home, Alt+End) and in the list of blocks in the sidebar.
 */
export default function DiffNav({
  current,
  total,
  summary,
  onPrev,
  onNext,
}: {
  /** Index of the current difference, or -1 if none is chosen. */
  current: number;
  total: number;
  /** The counter in words ("Difference 3 of 9"), for screen readers. */
  summary: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useT();
  return (
    <div className="tb-cluster diff-nav" role="group" aria-label={t("fd.tb.diffs")}>
      <div className="cluster-row">
        <button
          type="button"
          className="tb-square"
          title={t("fd.tb.prev.title")}
          aria-label={t("fd.tb.prev")}
          disabled={total === 0}
          onClick={onPrev}
        >
          <span className="tb-icon"><ChevronUpIcon /></span>
        </button>
        <span
          className="counter nav-count"
          role="status"
          aria-label={summary}
          title={`${t("fd.tb.first.title")} · ${t("fd.tb.last.title")}`}
        >
          <strong aria-hidden="true">{current >= 0 ? current + 1 : total === 0 ? 0 : "–"}</strong>
          <span className="nav-of" aria-hidden="true">{t("fd.nav.of", { total })}</span>
        </span>
        <button
          type="button"
          className="tb-square"
          title={t("fd.tb.next.title")}
          aria-label={t("fd.tb.next")}
          disabled={total === 0}
          onClick={onNext}
        >
          <span className="tb-icon"><ChevronDownIcon /></span>
        </button>
      </div>
    </div>
  );
}
