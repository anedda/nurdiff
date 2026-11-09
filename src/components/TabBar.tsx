import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useT } from "../i18n/context";
import type { TabDrag } from "../lib/useTabDrag";

/** A tab, as far as needed to draw it. */
export interface BarTab {
  id: number;
  title: string;
  dirty: boolean;
  /** The Home is the first tab and cannot be closed. */
  home?: boolean;
}

interface TabBarProps {
  tabs: BarTab[];
  activeId: number;
  sidebarOpen: boolean;
  /** The button stays in place but cannot be used (on the Home, with the bar closed). */
  sidebarDisabled: boolean;
  onToggleSidebar: () => void;
  onActivate: (id: number) => void;
  onClose: (id: number) => void;
  onAdd: () => void;
  /** The dragging (see `useTabDrag`). */
  barRef: RefObject<HTMLDivElement>;
  drag: TabDrag | null;
  suppressClick: RefObject<boolean>;
  registerTab: (id: number) => (el: HTMLDivElement | null) => void;
  onTabPointerDown: (e: ReactPointerEvent<HTMLDivElement>, tab: BarTab) => void;
}

/** The tab bar: the sidebar button, one tab per comparison with its ×, and "+". */
export default function TabBar({
  tabs,
  activeId,
  sidebarOpen,
  sidebarDisabled,
  onToggleSidebar,
  onActivate,
  onClose,
  onAdd,
  barRef,
  drag,
  suppressClick,
  registerTab,
  onTabPointerDown,
}: TabBarProps) {
  const tr = useT();
  return (
    <div className="doctabs" role="tablist" aria-label={tr("tab.list")} ref={barRef}>
      <button
        type="button"
        className="sb-toggle"
        aria-label={tr("sidebar.label")}
        aria-pressed={sidebarOpen}
        disabled={sidebarDisabled}
        title={tr(sidebarDisabled ? "sidebar.toggle.home" : "sidebar.toggle")}
        onClick={onToggleSidebar}
      >
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
          <path d="M8 3.5v13" />
        </svg>
      </button>
      {tabs.map((t) => (
        <div
          key={t.id}
          ref={registerTab(t.id)}
          className={`doctab${t.id === activeId ? " active" : ""}${drag?.id === t.id ? " dragging" : ""}`}
          style={drag?.id === t.id ? { transform: `translateX(${drag.dx}px)` } : undefined}
          onPointerDown={(e) => onTabPointerDown(e, t)}
        >
          <button
            type="button"
            role="tab"
            aria-selected={t.id === activeId}
            className="doctab-label"
            title={t.title || tr("tab.new")}
            onClick={() => {
              if (!suppressClick.current) onActivate(t.id);
            }}
          >
            {t.dirty && <span className="dirty">● </span>}
            {t.title || tr("tab.new")}
          </button>
          {!t.home && (
            <button type="button" className="doctab-close" aria-label={tr("tab.close", { title: t.title || tr("tab.new") })} onClick={() => onClose(t.id)}>
              ×
            </button>
          )}
        </div>
      ))}
      {drag && <div className="doctab-mark" style={{ left: drag.mark }} aria-hidden="true" />}
      <button type="button" className="doctab-add" aria-label={tr("menu.newTab")} title={tr("tab.add.title")} onClick={onAdd}>
        +
      </button>
    </div>
  );
}
