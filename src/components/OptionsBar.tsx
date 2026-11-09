import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/context";
import { ChevronDownIcon, OptionsIcon, PilcrowIcon } from "./icons";
import { ALGORITHMS, WHITESPACES } from "../types";
import type { Algorithm, Whitespace } from "../types";

/**
 * The options of the file comparison, in a group: ¶ (visible spaces), Aa (case), the menu of the
 * spaces to ignore and that of the algorithm; below, the label "Options". The two icons are
 * square toggles, the menus show the chosen value with an arrow (the real `select` sits on top, transparent: the control is as wide as the value, not as the longest item).
 */
export default function OptionsBar({
  showSpaces,
  onToggleSpaces,
  ignoreCase,
  onToggleIgnoreCase,
  ignoreWhitespace,
  onWhitespace,
  algorithm,
  onAlgorithm,
  busy,
  compact = false,
}: {
  showSpaces: boolean;
  onToggleSpaces: () => void;
  ignoreCase: boolean;
  onToggleIgnoreCase: () => void;
  ignoreWhitespace: Whitespace;
  onWhitespace: (value: Whitespace) => void;
  algorithm: Algorithm;
  onAlgorithm: (value: Algorithm) => void;
  busy: boolean;
  /** Compact bar: the two menus are in an "Options" panel. */
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div className="tb-cluster options-bar" role="group" aria-label={t("fd.tb.options")}>
      <div className="cluster-row">
        <button
          type="button"
          className="tb-square"
          title={t("fd.tb.visible.title")}
          aria-label={t("fd.tb.visible.name")}
          aria-pressed={showSpaces}
          onClick={onToggleSpaces}
        >
          <span className="tb-icon"><PilcrowIcon /></span>
        </button>
        <button
          type="button"
          className="tb-square"
          title={t("fd.tb.case.title")}
          aria-label={t("opt.ignoreCase")}
          aria-pressed={ignoreCase}
          disabled={busy}
          onClick={onToggleIgnoreCase}
        >
          <span className="tb-icon tb-text">Aa</span>
        </button>
        {compact ? (
          <OptionsPopup
            nonDefault={ignoreWhitespace !== "none" || algorithm !== "myers"}
            ignoreWhitespace={ignoreWhitespace}
            onWhitespace={onWhitespace}
            algorithm={algorithm}
            onAlgorithm={onAlgorithm}
            busy={busy}
          />
        ) : (
          <>
            <label className="opt-select" title={t("fd.tb.space.title")}>
              <span className="opt-name">{t("fd.tb.space.label")}</span>
              <span className="opt-value" aria-hidden="true">{t(WHITESPACES.find((o) => o.value === ignoreWhitespace)?.shortKey ?? "ws.none.short")}</span>
              <select aria-label={t("opt.ignoreWhitespace")} value={ignoreWhitespace} disabled={busy} onChange={(e) => onWhitespace(e.currentTarget.value as Whitespace)}>
                {WHITESPACES.map((o) => (
                  <option key={o.value} value={o.value} title={t(o.titleKey)}>
                    {t(o.shortKey)}
                  </option>
                ))}
              </select>
              <span className="opt-chevron" aria-hidden="true">▾</span>
            </label>
            <label className="opt-select" title={t("fd.tb.algo.title")}>
              <span className="opt-name">{t("fd.tb.algo.label")}</span>
              <span className="opt-value" aria-hidden="true">{ALGORITHMS.find((a) => a.value === algorithm)?.label}</span>
              <select aria-label={t("fd.tb.algo")} value={algorithm} disabled={busy} onChange={(e) => onAlgorithm(e.currentTarget.value as Algorithm)}>
                {ALGORITHMS.map((a) => (
                  <option key={a.value} value={a.value} title={t(a.titleKey)}>
                    {a.label}
                  </option>
                ))}
              </select>
              <span className="opt-chevron" aria-hidden="true">▾</span>
            </label>
          </>
        )}
      </div>
    </div>
  );
}

/** "Options ▾" of the compact bar: a panel with the menus of the spaces and of the algorithm; a dot says that one differs from the default. */
function OptionsPopup({
  nonDefault,
  ignoreWhitespace,
  onWhitespace,
  algorithm,
  onAlgorithm,
  busy,
}: {
  nonDefault: boolean;
  ignoreWhitespace: Whitespace;
  onWhitespace: (value: Whitespace) => void;
  algorithm: Algorithm;
  onAlgorithm: (value: Algorithm) => void;
  busy: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
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
  return (
    <div className="menu opts-popup" ref={ref}>
      <button
        type="button"
        className="opt-select opts-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={nonDefault ? `${t("fd.opts.title")} (${t("fd.opts.nonDefault")})` : t("fd.opts.title")}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="tb-icon"><OptionsIcon /></span>
        <span className="opt-value">{t("fd.opts.button")}</span>
        {nonDefault && <span className="opts-dot" role="img" aria-label={t("fd.opts.nonDefault")} />}
        <span className="tb-icon"><ChevronDownIcon /></span>
      </button>
      {open && (
        <div className="menu-panel opts-panel" role="dialog" aria-label={t("fd.opts.popup")}>
          <strong>{t("fd.opts.title")}</strong>
          <label>
            {t("fd.tb.space.label")}
            <select aria-label={t("opt.ignoreWhitespace")} value={ignoreWhitespace} disabled={busy} onChange={(e) => onWhitespace(e.currentTarget.value as Whitespace)}>
              {WHITESPACES.map((o) => (
                <option key={o.value} value={o.value} title={t(o.titleKey)}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("fd.tb.algo.label")}
            <select aria-label={t("fd.tb.algo")} value={algorithm} disabled={busy} onChange={(e) => onAlgorithm(e.currentTarget.value as Algorithm)}>
              {ALGORITHMS.map((a) => (
                <option key={a.value} value={a.value} title={t(a.titleKey)}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
