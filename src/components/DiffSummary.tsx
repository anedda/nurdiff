import { useT } from "../i18n/context";
import { barSegments, type RowStats } from "../lib/summaryBar";

const ORDER = ["changed", "leftOnly", "rightOnly"] as const;

/**
 * The summary of the file comparison, in the same form as that of the folders (`DirSummary`): one pill
 * per kind of row (modified, only on the left, only on the right) with a dot in the colour of the rows in the
 * file, the number and the word. The number of blocks is not there: the navigation counter already says it ("3 of 9"). No proportional bar: the share
 * of each kind is in the tooltip. The words are in `.tb-label`: the compact bar hides them.
 */
export default function DiffSummary({ stats }: { stats: RowStats }) {
  const t = useT();
  const segments = barSegments(stats);
  const label = t("fd.summary.aria", { changed: stats.changed, left: stats.leftOnly, right: stats.rightOnly });
  const titleOf = (key: (typeof ORDER)[number]) => {
    const seg = segments.find((s) => s.key === key);
    return t(`fd.stat.${key}`, { count: stats[key], pct: seg?.pct ?? 0 });
  };
  return (
    <div className="diff-summary dir-pills file-pills" role="group" aria-label={label}>
      {ORDER.map((key) => (
        <span key={key} className={`stat ${key}`} title={titleOf(key)} aria-label={`${stats[key]} ${t(`fd.pill.${key}`)}`}>
          <i className="dot" aria-hidden="true" />
          <strong>{stats[key]}</strong> <span className="tb-label">{t(`fd.pill.${key}`)}</span>
        </span>
      ))}
    </div>
  );
}
