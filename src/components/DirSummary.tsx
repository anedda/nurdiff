import { useT } from "../i18n/context";
import { dirBarSegments } from "../lib/summaryBar";
import type { DirStats } from "../types";

/**
 * The summary of the folder comparison: one pill per status, with a dot in the same colour
 * as the mark in the central column and the names (red different, yellow minor, blue only on the left, purple only
 * on the right, teal different type, grey identical, empty dot not compared), without a proportional bar. It counts the whole
 * comparison, not only what the filters let you see. The words
 * are in `.tb-label`: the compact bar hides them and the dot and the number remain (name and tooltip stay).
 */
export default function DirSummary({
  stats,
  notCompared = null,
  scanning = false,
  truncatedAt = null,
}: {
  stats: DirStats;
  /** Pairs of files not yet compared: only in the preview (`null` in a finished comparison). */
  notCompared?: number | null;
  /** The scan that counts all the entries is in progress: the numbers are those of the entries already read. */
  scanning?: boolean;
  /** The scan stopped at this number of entries: the counts are partial. */
  truncatedAt?: number | null;
}) {
  const t = useT();
  const segments = dirBarSegments(stats);
  // Before the comparison nobody knows how many are identical or different: "0 identical" or "0 different" would be
  // false statements, since the pairs not compared can be either. Each pill appears when some are known (rows compared
  // in place) and always in the finished comparison. What the listings say (only on one side, a different type) is
  // always known.
  const showSame = notCompared === null || stats.identical > 0;
  const showChanged = notCompared === null || stats.different > 0;
  const ariaKey = showChanged ? (showSame ? "dir.summary.aria" : "dir.summary.ariaNoSame") : showSame ? "dir.summary.ariaNoChanged" : "dir.summary.ariaKnown";
  const base = t(ariaKey, {
    changed: stats.different,
    left: stats.leftOnly,
    right: stats.rightOnly,
    mismatch: stats.typeMismatch,
    same: stats.identical,
  });
  const label = notCompared !== null && notCompared > 0 ? `${base}, ${t("dir.summary.ariaNot", { count: notCompared })}` : base;
  const count = { changed: stats.different, leftOnly: stats.leftOnly, rightOnly: stats.rightOnly, typeMismatch: stats.typeMismatch };
  const titleOf = (key: keyof typeof count) => {
    const base = t(`dir.stat.${key}`, { count: count[key], pct: segments.find((s) => s.key === key)?.pct ?? 0 });
    return key === "changed" && stats.minor > 0 ? `${base}; ${t("dir.stat.minor", { count: stats.minor })}` : base;
  };
  return (
    <div className="diff-summary dir-pills" role="group" aria-label={label}>
      {showChanged && (
        <span className="stat changed" title={titleOf("changed")} aria-label={`${stats.different} ${t("dir.pill.changed")}`}>
          <i className="dot" aria-hidden="true" />
          <strong>{stats.different}</strong> <span className="tb-label">{t("dir.pill.changed")}</span>
          {stats.minor > 0 && (
            <span className="stat-minor tb-label">
              {" · "}
              <strong>{stats.minor}</strong> {t("dir.pill.minor")}
            </span>
          )}
        </span>
      )}
      <span className="stat leftOnly" title={titleOf("leftOnly")} aria-label={`${stats.leftOnly} ${t("dir.pill.leftOnly")}`}>
        <i className="dot" aria-hidden="true" />
        <strong>{stats.leftOnly}</strong> <span className="tb-label">{t("dir.pill.leftOnly")}</span>
      </span>
      <span className="stat rightOnly" title={titleOf("rightOnly")} aria-label={`${stats.rightOnly} ${t("dir.pill.rightOnly")}`}>
        <i className="dot" aria-hidden="true" />
        <strong>{stats.rightOnly}</strong> <span className="tb-label">{t("dir.pill.rightOnly")}</span>
      </span>
      {stats.typeMismatch > 0 && (
        <span className="stat typeMismatch" title={titleOf("typeMismatch")} aria-label={`${stats.typeMismatch} ${t("dir.pill.typeMismatch")}`}>
          <i className="dot" aria-hidden="true" />
          <strong>{stats.typeMismatch}</strong> <span className="tb-label">{t("dir.pill.typeMismatch")}</span>
        </span>
      )}
      {showSame && (
        <span className="stat identical" title={t("dir.stat.identical", { count: stats.identical })} aria-label={`${stats.identical} ${t("dir.pill.identical")}`}>
          <i className="dot" aria-hidden="true" />
          <strong>{stats.identical}</strong> <span className="tb-label">{t("dir.pill.identical")}</span>
        </span>
      )}
      {scanning && <span className="scan-note">{t("dir.scanning")}</span>}
      {truncatedAt !== null && <span className="scan-note">{t("dir.scanTruncated", { n: truncatedAt })}</span>}
      {notCompared !== null && notCompared > 0 && (
        <span className="stat notCompared" title={t("dir.stat.notCompared", { count: notCompared })} aria-label={`${notCompared} ${t("dir.pill.notCompared")}`}>
          <i className="dot" aria-hidden="true" />
          <strong>{notCompared}</strong> <span className="tb-label">{t("dir.pill.notCompared")}</span>
        </span>
      )}
    </div>
  );
}
