import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/context";
import type { DirFilter } from "../lib/tree";
import { ChevronDownIcon, MENU_FILTER_TONE, MenuFilterIcon } from "./icons";

export const FILTERS: { value: DirFilter; label: string; title: string }[] = [
  { value: "all", label: "dir.fl.all", title: "dir.f.all" },
  { value: "diffs", label: "dir.fl.diffs", title: "dir.f.diffs" },
  { value: "same", label: "dir.fl.same", title: "dir.f.same" },
  { value: "minor", label: "dir.fl.minor", title: "dir.f.minor" },
];

/**
 * "More filters": the filters that are not among the buttons (orphans, newer on one side).
 * All, Diffs and Same are only in the segmented control, they are not repeated here.
 */
export const FILTER_MENU: { value: MenuFilterIcon; label: string; title: string }[] = [
  { value: "noOrphans", label: "dir.fm.noOrphans", title: "dir.f.noOrphans" },
  { value: "diffsNoOrphans", label: "dir.fm.diffsNoOrphans", title: "dir.f.diffsNoOrphans" },
  { value: "orphans", label: "dir.fm.orphans", title: "dir.f.orphans" },
  { value: "leftNewer", label: "dir.fm.leftNewer", title: "dir.f.leftNewer" },
  { value: "rightNewer", label: "dir.fm.rightNewer", title: "dir.f.rightNewer" },
  { value: "leftOrphans", label: "dir.fm.leftOrphans", title: "dir.f.leftOrphans" },
  { value: "rightOrphans", label: "dir.fm.rightOrphans", title: "dir.f.rightOrphans" },
];

/**
 * The folder filters: All, Diffs, Same, Minor and the "More filters" menu for the others. They are used by the
 * comparison and the preview; in the preview the filters that need the contents (`unavailable`)
 * are disabled, with `unavailableTitle` as the tooltip.
 */
export default function DirFilterBar({
  filter,
  onFilter,
  unavailable,
  unavailableTitle,
}: {
  filter: DirFilter;
  onFilter: (filter: DirFilter) => void;
  unavailable?: (filter: DirFilter) => boolean;
  unavailableTitle?: string;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setMenuOpen(false); }
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc, true);
    };
  }, [menuOpen]);

  const off = (f: DirFilter) => !!unavailable?.(f);
  const titleOf = (f: DirFilter, key: string) => (off(f) && unavailableTitle ? unavailableTitle : t(key));

  return (
    <div className="dir-filters" role="group" aria-label={t("dir.filter")}>
      <div className="seg">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className="seg-btn"
            aria-pressed={filter === f.value}
            disabled={off(f.value)}
            title={titleOf(f.value, f.title)}
            onClick={() => onFilter(f.value)}
          >
            {t(f.label)}
          </button>
        ))}
      </div>
      <div className="menu" ref={menuRef}>
        <button
          type="button"
          className={`opt-select opts-button${FILTERS.some((f) => f.value === filter) ? "" : " on"}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("dir.moreFilters")}
          title={t("dir.moreFilters.title")}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="opt-value">{t("dir.moreFilters")}</span>
          <span className="tb-icon"><ChevronDownIcon /></span>
        </button>
        {menuOpen && (
          <div className="menu-panel" role="menu">
            {FILTER_MENU.map((f) => (
              <button
                key={f.value}
                type="button"
                role="menuitemradio"
                aria-checked={filter === f.value}
                disabled={off(f.value)}
                title={titleOf(f.value, f.title)}
                onClick={() => { onFilter(f.value); setMenuOpen(false); }}
              >
                <span className={`tb-icon fi-${MENU_FILTER_TONE[f.value]}`} aria-hidden="true"><MenuFilterIcon filter={f.value} /></span>
                <span className="menu-label">{t(f.label)}</span>
                {/* The mark of the chosen one is at the end: a column for it before the icons would push them away from the edge. */}
                <span className="check-end" aria-hidden="true">{filter === f.value ? "✓" : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
