import type { KeyboardEvent, RefObject } from "react";
import { useT } from "../i18n/context";
import type { Side } from "../types";
import { ChevronDownIcon, ChevronUpIcon, ClearIcon, SearchIcon } from "./icons";

interface Props {
  query: string;
  onQuery: (text: string) => void;
  caseSensitive: boolean;
  onCaseSensitive: (on: boolean) => void;
  side: Side;
  onSide: (side: Side) => void;
  /** Number of matches, the position of the current one (-1 = none) and whether the core stopped looking. */
  total: number;
  current: number;
  truncated: boolean;
  /** An answer is awaited: it is not "no results" yet. */
  searching: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement>;
}

/** The bar of the text search in one side of the file comparison. */
export default function SearchBar({ query, onQuery, caseSensitive, onCaseSensitive, side, onSide, total, current, truncated, searching, onNext, onPrev, onClose, inputRef }: Props) {
  const t = useT();
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    }
  };
  const totalText = truncated ? `${total.toLocaleString()}+` : total.toLocaleString();
  const none = query !== "" && total === 0 && !searching;
  const count = query === "" || searching ? "" : none ? t("fd.search.none") : t("fd.search.count", { n: current + 1, total: totalText });
  return (
    <div className="searchbar" role="search" aria-label={t("fd.search.label")} onKeyDown={onKeyDown}>
      <div className="seg" role="group" aria-label={t("fd.search.side")}>
        {(["left", "right"] as const).map((s) => (
          <button key={s} type="button" className="seg-btn" aria-pressed={side === s} onClick={() => onSide(s)}>
            {/* The colour of the side, the same as the dots before the two paths. */}
            <i className={`sb-dot ${s}`} aria-hidden="true" />
            {t(s === "left" ? "fd.search.left" : "fd.search.right")}
          </button>
        ))}
      </div>
      {/* The counter is inside the field, next to what is typed; the border says if there are results. */}
      <div className={`search-field${none ? " none" : ""}`}>
        <SearchIcon />
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          onChange={(e) => onQuery(e.currentTarget.value)}
          placeholder={t("fd.search.placeholder")}
          aria-label={t("fd.search.placeholder")}
          spellCheck={false}
        />
        <span className="search-count" role="status">
          {count}
        </span>
        {query !== "" && (
          <button
            type="button"
            className="search-clear"
            title={t("fd.search.clear")}
            aria-label={t("fd.search.clear")}
            onClick={() => {
              onQuery("");
              inputRef.current?.focus();
            }}
          >
            <ClearIcon />
          </button>
        )}
      </div>
      {/* With words, not "Aa": the bar above has an "Aa" that does the opposite (ignores the case in the comparison). */}
      <div className="seg">
        <button type="button" className="seg-btn" aria-pressed={caseSensitive} title={t("fd.search.case.title")} onClick={() => onCaseSensitive(!caseSensitive)}>
          {t("fd.search.case")}
        </button>
      </div>
      <div className="search-nav">
        <button type="button" className="tb-square" title={t("fd.search.prev")} aria-label={t("fd.search.prev")} disabled={total === 0} onClick={onPrev}>
          <ChevronUpIcon />
        </button>
        <button type="button" className="tb-square" title={t("fd.search.next")} aria-label={t("fd.search.next")} disabled={total === 0} onClick={onNext}>
          <ChevronDownIcon />
        </button>
      </div>
      <button type="button" className="tb-square search-close" title={t("fd.search.close")} aria-label={t("fd.search.close")} onClick={onClose}>
        ×
      </button>
    </div>
  );
}
