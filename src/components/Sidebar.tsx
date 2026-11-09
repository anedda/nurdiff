import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { useT } from "../i18n/context";
import { clampSidebarWidth, type SidebarState, type SidebarView } from "../lib/sidebar";

interface Props {
  state: SidebarState;
  /** The view shown: it can differ from `state.view` when the chosen one is not available in the foreground tab. */
  view: SidebarView;
  /** Views not available right now, with the reason (tooltip of the disabled button). */
  unavailable?: Partial<Record<SidebarView, string>>;
  /** `persist` is false while dragging the edge and true at the end. */
  onChange: (next: SidebarState, persist: boolean) => void;
  children: ReactNode;
}

const VIEWS: { view: SidebarView; labelKey: string; icon: ReactNode }[] = [
  {
    view: "files",
    labelKey: "sidebar.view.files",
    icon: (
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    view: "diffs",
    labelKey: "sidebar.view.diffs",
    icon: (
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M3 5h14M3 10h14M3 15h9" />
      </svg>
    ),
  },
];

/** Sidebar: column of icons to choose the view, panel and edge to drag to resize it. */
export default function Sidebar({ state, view, unavailable = {}, onChange, children }: Props) {
  const t = useT();
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: state.width };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    onChange({ ...state, width: clampSidebarWidth(d.startWidth + e.clientX - d.startX) }, false);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d) onChange({ ...state, width: clampSidebarWidth(d.startWidth + e.clientX - d.startX) }, true);
  };

  return (
    <aside className="sidebar" style={{ width: state.width }} aria-label={t("sidebar.label")}>
      <div className="sb-strip" role="tablist" aria-orientation="vertical">
        {VIEWS.map((v) => {
          const reason = unavailable[v.view];
          return (
            <button
              key={v.view}
              type="button"
              role="tab"
              aria-selected={view === v.view}
              className={view === v.view ? "sb-tab on" : "sb-tab"}
              title={reason ? `${t(v.labelKey)} — ${reason}` : t(v.labelKey)}
              aria-label={t(v.labelKey)}
              disabled={reason !== undefined}
              onClick={() => onChange({ ...state, view: v.view }, true)}
            >
              {v.icon}
            </button>
          );
        })}
      </div>
      <div className="sb-panel">{children}</div>
      <div
        className="sb-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("sidebar.resize")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
      />
    </aside>
  );
}
