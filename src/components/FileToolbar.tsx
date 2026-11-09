import type { RefObject } from "react";
import { useT } from "../i18n/context";
import type { Algorithm, MergeDirection, OpenedDiff, RowFilter, Whitespace } from "../types";
import DiffNav from "./DiffNav";
import DiffSummary from "./DiffSummary";
import { RefreshIcon } from "./icons";
import MergeBar from "./MergeBar";
import OptionsBar from "./OptionsBar";
import RowFilterBar from "./RowFilterBar";
import TbSep from "./TbSep";
import ViewSwitch from "./ViewSwitch";
import type { ViewMode } from "./ViewSwitch";

interface FileToolbarProps {
  /** The bar, to measure when to switch to the compact version. */
  barRef: RefObject<HTMLDivElement>;
  compact: boolean;
  diff: OpenedDiff;
  busy: boolean;
  /** The current block (-1 = none) and the text of the counter. */
  current: number;
  counter: string;
  onStep: (direction: 1 | -1) => void;
  onMerge: (direction: MergeDirection) => void;
  onUndo: () => void;
  onSave: () => void;
  view: ViewMode;
  onSwitchView: (mode: ViewMode) => void;
  showSpaces: boolean;
  onToggleSpaces: () => void;
  ignoreCase: boolean;
  onToggleIgnoreCase: () => void;
  ignoreWhitespace: Whitespace;
  onWhitespace: (whitespace: Whitespace) => void;
  algorithm: Algorithm;
  onAlgorithm: (algorithm: Algorithm) => void;
  rowFilter: RowFilter;
  onFilter: (filter: RowFilter) => void;
  onRefresh: () => void;
}

/** The file comparison bar (navigation, merge, view, options) and the summary row below it. */
export default function FileToolbar({
  barRef,
  compact,
  diff,
  busy,
  current,
  counter,
  onStep,
  onMerge,
  onUndo,
  onSave,
  view,
  onSwitchView,
  showSpaces,
  onToggleSpaces,
  ignoreCase,
  onToggleIgnoreCase,
  ignoreWhitespace,
  onWhitespace,
  algorithm,
  onAlgorithm,
  rowFilter,
  onFilter,
  onRefresh,
}: FileToolbarProps) {
  const t = useT();
  return (
    <>
    <div ref={barRef} className={`dirbar tb-card${compact ? " tb-compact" : ""}`} role="toolbar" aria-label={t("toolbar.label")}>
      <DiffNav current={current} total={diff.hunks.length} summary={counter} onPrev={() => onStep(-1)} onNext={() => onStep(1)} />
      <TbSep />
      <MergeBar
        toRight={{
          disabled: current < 0 || busy || diff.rightReadOnly,
          title: current < 0 ? t("fd.tb.pickFirst") : t("fd.tb.fromLeft.title"),
          onClick: () => onMerge("leftToRight"),
        }}
        toLeft={{
          disabled: current < 0 || busy || diff.leftReadOnly,
          title: current < 0 ? t("fd.tb.pickFirst") : t("fd.tb.fromRight.title"),
          onClick: () => onMerge("rightToLeft"),
        }}
        undo={{ disabled: !diff.canUndo || busy, onClick: onUndo }}
        save={{
          disabled: busy || !((diff.leftDirty && !diff.leftReadOnly) || (diff.rightDirty && !diff.rightReadOnly)),
          onClick: onSave,
        }}
      />
      <TbSep />
      <ViewSwitch enabled={["split", "unified"]} value={view} onChange={onSwitchView} />
      <TbSep />
      <OptionsBar
        showSpaces={showSpaces}
        onToggleSpaces={onToggleSpaces}
        ignoreCase={ignoreCase}
        onToggleIgnoreCase={onToggleIgnoreCase}
        ignoreWhitespace={ignoreWhitespace}
        onWhitespace={onWhitespace}
        algorithm={algorithm}
        onAlgorithm={onAlgorithm}
        busy={busy}
        compact={compact}
      />
      {compact && (
        <div className="tb-summary">
          {diff.identical ? <strong>{t("fd.identical")}</strong> : <DiffSummary stats={diff.stats} />}
          <RowFilterBar value={rowFilter} onChange={onFilter} disabled={busy} showLabel={false} />
        </div>
      )}
      <button type="button" className="merge-btn refresh-btn" title={t("fd.tb.refresh.title")} aria-label={t("tb.refresh")} disabled={busy} onClick={onRefresh}>
        <span className="tb-icon"><RefreshIcon /></span>
        <span className="tb-label">{t("tb.refresh")}</span>
      </button>
    </div>
    {!compact && (
      <div className="toolbar summary-row">
        <div className="summary">
          {diff.identical ? (
            <strong>{t("fd.identical")}</strong>
          ) : (
            <DiffSummary stats={diff.stats} />
          )}
        </div>
        <RowFilterBar value={rowFilter} onChange={onFilter} disabled={busy} />
      </div>
    )}
    </>
  );
}
