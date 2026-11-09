import { useT } from "../i18n/context";
import type { RowFilter } from "../types";

const FILTERS: { value: RowFilter; labelKey: string; titleKey: string }[] = [
  { value: "all", labelKey: "fd.rows.label.all", titleKey: "fd.rows.all" },
  { value: "diffs", labelKey: "fd.rows.label.diffs", titleKey: "fd.rows.diffs" },
  { value: "context", labelKey: "fd.rows.label.context", titleKey: "fd.rows.context" },
];

/** Which rows to show in the file comparison, as a segmented control: All, Differences, With context. */
export default function RowFilterBar({
  value,
  onChange,
  disabled = false,
  showLabel = true,
}: {
  value: RowFilter;
  onChange: (filter: RowFilter) => void;
  disabled?: boolean;
  /** "Show" in front of the control (the compact bar removes it). */
  showLabel?: boolean;
}) {
  const t = useT();
  return (
    <div className="row-filter">
      {showLabel && <span className="row-filter-label" aria-hidden="true">{t("fd.rows.show")}</span>}
      <div className="seg" role="group" aria-label={t("fd.tb.rows")}>
      {FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          className="seg-btn"
          aria-pressed={value === f.value}
          title={t(f.titleKey)}
          disabled={disabled}
          onClick={() => onChange(f.value)}
        >
          {t(f.labelKey)}
        </button>
      ))}
      </div>
    </div>
  );
}
