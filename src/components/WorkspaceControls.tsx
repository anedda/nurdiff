import { Fragment } from "react";
import { useT } from "../i18n/context";
import type { FileOptions } from "../lib/useFileOps";
import { ALGORITHMS, WHITESPACES } from "../types";
import type { Algorithm, Mode, Side, Whitespace } from "../types";

const svg = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function FolderIcon() {
  return (
    <svg {...svg}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg {...svg}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg {...svg}>
      <path d="M4 8h15m-4-4 4 4-4 4" />
      <path d="M20 16H5m4-4-4 4 4 4" />
    </svg>
  );
}

/** The blue button: compares the chosen row, or the two paths, or is not there. */
export type ControlsAction = { kind: "row"; rel: string } | { kind: "compare" } | null;

/**
 * The state of a comparison: none in progress, in progress, or in progress for long enough that it
 * can be cancelled (the blue button becomes "Cancel").
 */
export type CompareState = "idle" | "running" | "cancellable";

interface Props {
  mode: Mode;
  left: string;
  right: string;
  onLeft: (path: string) => void;
  onRight: (path: string) => void;
  /** Compares the two typed paths (also with Enter in the fields). */
  onRun: () => void;
  onBrowse: (side: Side) => void;
  /** Swaps the two paths (and the comparison or preview shown, if any). */
  onSwap: () => void;
  busy: boolean;
  action: ControlsAction;
  onCompareRow: (rel: string) => void;
  compare: CompareState;
  onCancel: () => void;
  /** The options of a file comparison not yet made; nothing for folders or once the comparison is made. */
  options: FileOptions | null;
}

/** The paths bar (with the "Browse…" icon inside the field and the swap between the two), the compare button and, before a file comparison, the options. */
export default function WorkspaceControls({ mode, left, right, onLeft, onRight, onRun, onBrowse, onSwap, busy, action, onCompareRow, compare, onCancel, options }: Props) {
  const t = useT();
  return (
    <form
      className="controls"
      onSubmit={(e) => {
        e.preventDefault();
        onRun();
      }}
    >
      <div className="paths">
        {(["left", "right"] as const).map((side) => (
          <Fragment key={side}>
            {side === "right" && (
              <button type="button" className="swap-btn" title={t("ws.swap.title")} aria-label={t("ws.swap")} disabled={busy} onClick={onSwap}>
                <SwapIcon />
              </button>
            )}
            <div className="path-field">
              <i className={`side-dot ${side}`} aria-hidden="true" />
              <button type="button" className="browse-btn" title={t("ws.browse")} aria-label={t("ws.browse")} onClick={() => onBrowse(side)}>
                {mode === "dirs" ? <FolderIcon /> : <FileIcon />}
              </button>
              <input
                value={side === "left" ? left : right}
                onChange={(e) => (side === "left" ? onLeft : onRight)(e.currentTarget.value)}
                onKeyDown={(e) => {
                  // Enter in the fields always compares the two typed paths, even when the
                  // button has become "Compare selection" (and so is no longer the submit one).
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onRun();
                  }
                }}
                placeholder={t(`ws.path.${mode}.${side}`)}
                aria-label={t(side === "left" ? "side.left" : "side.right")}
              />
            </div>
          </Fragment>
        ))}
        {/* Every version has its own `key`: so it is never the same element that changes role (from "submit" to
           "cancel") during its own click, which would start a new comparison. */}
        {action && compare === "cancellable" ? (
          // The comparison takes long: the same spot cancels it (Esc does the same).
          <button key="cancel" type="button" className="primary" title={t("ws.cancel.title")} onClick={onCancel}>
            {t("ws.cancel")}
          </button>
        ) : action && compare === "running" ? (
          <button key="running" type="button" className="primary" disabled title={t("ws.compare.title")}>
            {t("ws.comparing")}
          </button>
        ) : action?.kind === "row" ? (
          <button
            key="row"
            type="button"
            className="primary"
            disabled={busy}
            title={t("ws.rowSelection.title", { path: action.rel })}
            onClick={() => onCompareRow(action.rel)}
          >
            {t("ws.selection")}
          </button>
        ) : action?.kind === "compare" ? (
          <button key="compare" type="submit" className="primary" disabled={busy} title={t("ws.compare.title")}>
            {busy ? t("ws.comparing") : t("ws.compare")}
          </button>
        ) : null}
      </div>
      {options && (
        <div className="options">
          <label className="check">
            <input type="checkbox" checked={options.ignoreCase} onChange={(e) => options.setIgnoreCase(e.currentTarget.checked)} />
            {t("opt.ignoreCase")}
          </label>
          <label>
            {t("opt.ignoreWhitespace")}
            <select value={options.ignoreWhitespace} onChange={(e) => options.setIgnoreWhitespace(e.currentTarget.value as Whitespace)}>
              {WHITESPACES.map((o) => (
                <option key={o.value} value={o.value} title={t(o.titleKey)}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("opt.algorithm")}
            <select value={options.algorithm} onChange={(e) => options.setAlgorithm(e.currentTarget.value as Algorithm)}>
              {ALGORITHMS.map((a) => (
                <option key={a.value} value={a.value} title={t(a.titleKey)}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </form>
  );
}
