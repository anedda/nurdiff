import { useCallback, useEffect, useRef, useState } from "react";
import { windowCommand } from "../api";
import { describeError } from "../i18n";
import { useT } from "../i18n/context";
import { items, linesOf, nextUnresolved, RESOLUTION_KEYS, stepConflict, textOf, type Conflict } from "../lib/conflictView";
import { useConflicts } from "../lib/useConflicts";
import type { Resolution } from "../types";

interface Props {
  /** The file with the conflict markers (`git mergetool`). */
  path: string;
  /** The tab is the visible one: only then do the shortcuts apply. */
  active: boolean;
  onInfo: (info: { title: string; dirty: boolean }) => void;
}

/** The lines of one side of a conflict (or of the result), with a heading. */
function Side({ kind, title, lines }: { kind: string; title: string; lines: string[] }) {
  return (
    <div className={`mg-side ${kind}`}>
      <div className="mg-side-title">{title}</div>
      <pre className="mg-code">{lines.length === 0 ? " " : lines.join("\n")}</pre>
    </div>
  );
}

/**
 * The resolution of the conflicts of a file written by `git mergetool`: the file with its conflicts one after the other
 * (the lines around them, the rest folded), and for each one the choice of the local side, the remote one, both, or a
 * text written by hand. Saving writes the result over the file; the exit code of the app tells git whether it is done.
 */
export default function MergeView({ path, active, onInfo }: Props) {
  const t = useT();
  const { view, error, busy, resolve, undo, save, clearError } = useConflicts(path);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [current, setCurrent] = useState(-1);
  const [saved, setSaved] = useState(false);
  const refs = useRef(new Map<number, HTMLElement>());

  const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dirty = view?.dirty ?? false;
  const info = useRef(onInfo);
  info.current = onInfo;
  useEffect(() => {
    info.current({ title: name, dirty });
  }, [name, dirty]);

  // A change after the save takes the "saved" notice away.
  useEffect(() => {
    if (view?.dirty) setSaved(false);
  }, [view?.dirty]);

  const goTo = useCallback((index: number | null) => {
    if (index === null) return;
    setCurrent(index);
    refs.current.get(index)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, []);

  const choose = async (index: number, resolution: Resolution) => {
    setEditing(null);
    if (await resolve(index, resolution) && view) {
      // The next conflict still to be resolved comes into view.
      const next = nextUnresolved({ ...view, segments: view.segments }, index + 1);
      if (next !== null && next !== index) setCurrent(next);
    }
  };

  const saveFile = useCallback(async () => {
    if (await save()) setSaved(true);
  }, [save]);

  const saveAndClose = async () => {
    if (await save()) void windowCommand("close");
  };

  useEffect(() => {
    if (!active || !view) return;
    const onKey = (e: KeyboardEvent) => {
      const inText = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
      if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        goTo(stepConflict(view, current, e.key === "ArrowDown" ? 1 : -1));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey && !inText && view.canUndo) {
        e.preventDefault();
        void undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, view, current, goTo, saveFile, undo]);

  if (!view) {
    return (
      <div className="merge-view">
        {error ? <p className="error" role="alert">{describeError(error, t)}</p> : <p className="muted">{t("merge.loading")}</p>}
      </div>
    );
  }

  const allDone = view.total > 0 && view.unresolved === 0;

  const card = (c: Conflict) => {
    const isEditing = editing?.index === c.index;
    const state = c.resolution.kind;
    return (
      <section
        key={`c${c.index}`}
        ref={(el) => {
          if (el) refs.current.set(c.index, el);
          else refs.current.delete(c.index);
        }}
        className={`mg-conflict ${state === "unresolved" ? "pending" : "done"}${c.index === current ? " current" : ""}`}
        aria-label={t("merge.conflict", { n: c.index + 1 })}
        onClick={() => setCurrent(c.index)}
      >
        <header className="mg-head">
          <span className="mg-title">
            {t("merge.conflict", { n: c.index + 1 })} <span className="muted">· {t("merge.fromLine", { n: c.start })}</span>
          </span>
          <span className={`mg-state ${state}`}>{t(RESOLUTION_KEYS[state])}</span>
        </header>
        <div className="mg-sides">
          <Side kind="ours" title={`${t("merge.ours")} (${c.oursLabel || "HEAD"})`} lines={c.ours} />
          {c.base && <Side kind="base" title={t("merge.base")} lines={c.base} />}
          <Side kind="theirs" title={`${t("merge.theirs")} (${c.theirsLabel})`} lines={c.theirs} />
        </div>
        {state !== "unresolved" && !isEditing && <Side kind="result" title={t("merge.result")} lines={c.result} />}
        {isEditing ? (
          <div className="mg-edit">
            <textarea
              aria-label={t("merge.result")}
              value={editing.text}
              spellCheck={false}
              autoFocus
              rows={Math.max(3, Math.min(14, linesOf(editing.text).length + 1))}
              onChange={(e) => setEditing({ index: c.index, text: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditing(null);
                }
              }}
            />
            <div className="mg-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void choose(c.index, { kind: "custom", lines: linesOf(editing.text) })}>
                {t("merge.apply")}
              </button>
              <button type="button" onClick={() => setEditing(null)}>
                {t("merge.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="mg-actions">
            <button type="button" className="mg-ours" disabled={busy} onClick={() => void choose(c.index, { kind: "ours" })}>
              {t("merge.takeOurs")}
            </button>
            <button type="button" className="mg-theirs" disabled={busy} onClick={() => void choose(c.index, { kind: "theirs" })}>
              {t("merge.takeTheirs")}
            </button>
            <button type="button" disabled={busy} onClick={() => void choose(c.index, { kind: "both" })}>
              {t("merge.takeBoth")}
            </button>
            <button type="button" disabled={busy} onClick={() => void choose(c.index, { kind: "bothReversed" })}>
              {t("merge.takeBothReversed")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing({ index: c.index, text: textOf(state === "unresolved" ? c.ours : c.result) })}
            >
              {t("merge.edit")}
            </button>
            {state !== "unresolved" && (
              <button type="button" disabled={busy} onClick={() => void choose(c.index, { kind: "unresolved" })}>
                {t("merge.reopen")}
              </button>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="merge-view">
      <div className="mg-bar">
        <div className="mg-file" title={path}>
          <span className="mg-name">{name}</span>
          <span className="muted mg-status" role="status">
            {view.total === 0
              ? t("merge.status.none")
              : allDone
                ? t("merge.status.done")
                : t("merge.status.pending", { count: view.unresolved, total: view.total })}
          </span>
        </div>
        <div className="mg-tools">
          <button type="button" disabled={view.total === 0} title={t("merge.prev")} aria-label={t("merge.prev")} onClick={() => goTo(stepConflict(view, current, -1))}>
            ↑
          </button>
          <button type="button" disabled={view.total === 0} title={t("merge.next")} aria-label={t("merge.next")} onClick={() => goTo(stepConflict(view, current, 1))}>
            ↓
          </button>
          <button type="button" disabled={!view.canUndo || busy} title="Ctrl+Z" onClick={() => void undo()}>
            {t("merge.undo")}
          </button>
          <button type="button" disabled={!view.dirty || busy} title="Ctrl+S" onClick={() => void saveFile()}>
            {t("merge.save")}
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => void saveAndClose()}>
            {view.dirty || !allDone ? t("merge.saveClose") : t("merge.close")}
          </button>
        </div>
      </div>
      {error != null && (
        <p className="error" role="alert">
          {describeError(error, t)}{" "}
          <button type="button" className="link-button" onClick={clearError}>
            {t("common.close")}
          </button>
        </p>
      )}
      {saved && !view.dirty && (
        <p className="notice" role="status">
          {allDone ? t("merge.saved.done") : t("merge.saved.partial", { count: view.unresolved })}
        </p>
      )}
      <div className="mg-body">
        {view.total === 0 && <p className="notice">{t("merge.noConflicts")}</p>}
        {items(view.segments, open).map((item) => {
          if (item.type === "conflict") return card(item.conflict);
          if (item.type === "gap") {
            return (
              <button key={item.key} type="button" className="mg-gap" onClick={() => setOpen(new Set(open).add(item.key))}>
                {t("merge.gap", { count: item.count })}
              </button>
            );
          }
          return (
            <div key={item.key} className="mg-lines">
              {item.lines.map((line, i) => (
                <div key={i} className="mg-line">
                  <span className="mg-num">{item.start + i}</span>
                  <span className="mg-text">{line || " "}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
