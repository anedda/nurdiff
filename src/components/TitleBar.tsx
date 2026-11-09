import Logo from "./Logo";
import { useEffect, useState } from "react";
import { windowCommand, watchMaximized, type ResizeEdge } from "../api";
import { useT } from "../i18n/context";
import MenuBar, { type Menu } from "./MenuBar";

interface Props {
  /** The menus, or a function that gives them when they are drawn (see `MenuBar`). */
  menus: Menu[] | (() => Menu[]);
  title: string;
  /** True: the window has no system bar and we draw it ourselves (title, dragging, buttons). */
  custom: boolean;
  /** Closing the window: whoever uses it decides whether to ask for confirmation. */
  onCloseWindow: () => void;
}

const EDGES: { edge: ResizeEdge; className: string }[] = [
  { edge: "North", className: "rz n" },
  { edge: "South", className: "rz s" },
  { edge: "West", className: "rz w" },
  { edge: "East", className: "rz e" },
  { edge: "NorthWest", className: "rz nw" },
  { edge: "NorthEast", className: "rz ne" },
  { edge: "SouthWest", className: "rz sw" },
  { edge: "SouthEast", className: "rz se" },
];

/** Bar at the top of the window: the menus and, without a system bar, also the title and the window buttons. */
export default function TitleBar({ menus, title, custom, onCloseWindow }: Props) {
  const t = useT();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!custom) return;
    let stop = () => {};
    let gone = false;
    void watchMaximized(setMaximized).then((off) => {
      if (gone) off();
      else stop = off;
    });
    return () => {
      gone = true;
      stop();
    };
  }, [custom]);

  if (!custom) {
    return (
      <div className="titlebar">
        <MenuBar menus={menus} />
      </div>
    );
  }

  return (
    <>
      <div className="titlebar custom">
        <Logo className="tb-logo" size={18} data-tauri-drag-region />
        <MenuBar menus={menus} />
        <div
          className="titledrag"
          data-tauri-drag-region
          onDoubleClick={() => void windowCommand("toggleMaximize")}
        >
          {title}
        </div>
        <div className="winctl">
          <button type="button" aria-label={t("win.minimize")} title={t("win.minimize")} onClick={() => void windowCommand("minimize")}>
            <svg viewBox="0 0 10 10" width="10" height="10"><path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
          </button>
          <button
            type="button"
            aria-label={t(maximized ? "win.restore" : "win.maximize")}
            title={t(maximized ? "win.restore" : "win.maximize")}
            onClick={() => void windowCommand("toggleMaximize")}
          >
            {maximized ? (
              <svg viewBox="0 0 10 10" width="10" height="10"><path d="M2.5 2.5v-2h7v7h-2M.5 2.5h7v7h-7z" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
            ) : (
              <svg viewBox="0 0 10 10" width="10" height="10"><rect x=".5" y=".5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
            )}
          </button>
          <button type="button" className="close" aria-label={t("win.closeWindow")} title={t("common.close")} onClick={onCloseWindow}>
            <svg viewBox="0 0 10 10" width="10" height="10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
          </button>
        </div>
      </div>
      {!maximized &&
        EDGES.map(({ edge, className }) => (
          <div key={edge} className={className} aria-hidden onMouseDown={(e) => {
            if (e.button === 0) {
              e.preventDefault();
              void windowCommand({ resize: edge });
            }
          }} />
        ))}
    </>
  );
}
