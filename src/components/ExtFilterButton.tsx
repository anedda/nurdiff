import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/context";
import { filterFromDraft, formatExtList, isExtFilterActive, EMPTY_EXT_FILTER } from "../lib/extFilter";
import type { ExtFilter } from "../types";
import { ChevronDownIcon, FunnelIcon } from "./icons";

/**
 * "Types ▾": the file filter by extension. The panel has two fields (include only / exclude),
 * each with the checkbox for files without an extension; "Apply" (or Enter) makes it effective.
 * The button stays highlighted as long as the filter is active.
 */
export default function ExtFilterButton({
  filter,
  onApply,
  disabled = false,
  hint,
}: {
  filter: ExtFilter;
  onApply: (filter: ExtFilter) => void;
  disabled?: boolean;
  /** A line below the fields: what happens when applying. */
  hint: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [include, setInclude] = useState("");
  const [includeNone, setIncludeNone] = useState(false);
  const [exclude, setExclude] = useState("");
  const [excludeNone, setExcludeNone] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      // It always opens with the current filter.
      setInclude(formatExtList(filter.includeExts));
      setIncludeNone(filter.includeNone);
      setExclude(formatExtList(filter.excludeExts));
      setExcludeNone(filter.excludeNone);
    }
    setOpen((o) => !o);
  }

  function apply(next: ExtFilter) {
    setOpen(false);
    onApply(next);
  }
  const draft = () => filterFromDraft({ include, includeNone, exclude, excludeNone });

  return (
    <div className="menu" ref={ref}>
        <button
          type="button"
          className={`opt-select opts-button${isExtFilterActive(filter) ? " on" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={t("extFilter.button.title")}
          aria-label={t("extFilter.name")}
          disabled={disabled}
          onClick={toggle}
        >
          <span className="tb-icon"><FunnelIcon /></span>
          <span className="opt-value tb-label">{t("extFilter.name")}</span>
          <span className="tb-icon"><ChevronDownIcon /></span>
        </button>
        {open && (
          <form
            className="menu-panel ext-filter"
            role="dialog"
            aria-label={t("extFilter.popup")}
            onSubmit={(e) => {
              e.preventDefault();
              apply(draft());
            }}
          >
            <label>
              {t("extFilter.include")}
              <input
                autoFocus
                value={include}
                placeholder={t("extFilter.placeholder")}
                onChange={(e) => setInclude(e.currentTarget.value)}
              />
            </label>
            <label className="check-row">
              <input type="checkbox" aria-label={`${t("extFilter.none")} (${t("extFilter.include")})`} checked={includeNone} onChange={(e) => setIncludeNone(e.currentTarget.checked)} />
              {t("extFilter.none")}
            </label>
            <label>
              {t("extFilter.exclude")}
              <input value={exclude} placeholder={t("extFilter.placeholder")} onChange={(e) => setExclude(e.currentTarget.value)} />
            </label>
            <label className="check-row">
              <input type="checkbox" aria-label={`${t("extFilter.none")} (${t("extFilter.exclude")})`} checked={excludeNone} onChange={(e) => setExcludeNone(e.currentTarget.checked)} />
              {t("extFilter.none")}
            </label>
            <p className="ext-filter-hint">{hint}</p>
            <div className="ext-filter-buttons">
              <button type="button" onClick={() => apply(EMPTY_EXT_FILTER)} disabled={!isExtFilterActive(filter) && !include && !exclude && !includeNone && !excludeNone}>
                {t("extFilter.clear")}
              </button>
              <button type="submit" className="primary">
                {t("extFilter.apply")}
              </button>
            </div>
          </form>
        )}
    </div>
  );
}
