import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  /** Shortcut to show next to the item (handled by whoever uses the menu). */
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Single-choice item: it shows the mark if active. */
  checked?: boolean;
  /** A separator row before the item. */
  separator?: boolean;
  /** The item opens a submenu (one level) instead of doing something: `onSelect` and `shortcut` do not apply. */
  submenu?: MenuItem[];
}

export interface Menu {
  label: string;
  items: MenuItem[];
}

/**
 * Drop-down menu bar, at the top of the window. `menus` can be a function: it is asked at every redraw (opening a
 * menu is one), so the items can say what the foreground tab can do at that moment.
 */
export default function MenuBar({ menus: source }: { menus: Menu[] | (() => Menu[]) }) {
  const menus = typeof source === "function" ? source() : source;
  const [open, setOpen] = useState<number | null>(null);
  // The submenu that is open in the open menu (by the label of its item), and whether the keyboard must enter it.
  const [sub, setSub] = useState<string | null>(null);
  const enterSub = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Another menu or none: no submenu stays open.
  useEffect(() => setSub(null), [open]);

  const focusFirstInSub = () => root.current?.querySelector<HTMLButtonElement>(".menu-panel.submenu button:not(:disabled)")?.focus();
  /** The keyboard asks to enter the submenu: if it is already open (the mouse opened it) the focus goes in, otherwise it opens first. */
  const enter = (label: string) => {
    if (sub === label) focusFirstInSub();
    else {
      enterSub.current = true;
      setSub(label);
    }
  };
  // Opened with the right arrow: the focus goes to its first item.
  useEffect(() => {
    if (sub === null || !enterSub.current) return;
    enterSub.current = false;
    focusFirstInSub();
  }, [sub]);

  // Arrows: ←/→ change menu (→ enters a submenu, ← leaves it), ↑/↓ move through the items of the open panel.
  function onKeyDown(e: React.KeyboardEvent) {
    if (open === null) return;
    const focused = document.activeElement as HTMLElement | null;
    const inSub = !!focused?.closest(".menu-panel.submenu");
    const move = (delta: number) => {
      const panel = focused?.closest(".menu-panel") ?? root.current?.querySelector(".menu-panel");
      // Only the buttons of this panel: those of an open submenu are inside its own panel.
      const buttons = Array.from(panel?.querySelectorAll<HTMLButtonElement>(":scope > div > button:not(:disabled)") ?? []);
      if (buttons.length === 0) return;
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(i + delta + buttons.length) % buttons.length].focus();
    };
    const parent = focused?.dataset.submenu;
    if (e.key === "ArrowRight" && parent !== undefined) enter(parent);
    else if (e.key === "ArrowRight" && !inSub) setOpen((open + 1) % menus.length);
    else if (e.key === "ArrowLeft" && inSub) {
      const label = sub;
      setSub(null);
      root.current?.querySelector<HTMLButtonElement>(`button[data-submenu="${CSS.escape(label ?? "")}"]`)?.focus();
    } else if (e.key === "ArrowLeft") setOpen((open + menus.length - 1) % menus.length);
    else if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else return;
    e.preventDefault();
  }

  const leaf = (item: MenuItem) => (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => {
        setOpen(null);
        item.onSelect?.();
      }}
    >
      <span className="check">{item.checked ? "✓" : ""}</span>
      <span className="menu-label">{item.label}</span>
      {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
    </button>
  );

  const entry = (item: MenuItem) => (
    // The mouse over an item closes the submenu of another one, and opens its own.
    <div key={item.label} className="menu-item" onMouseEnter={() => setSub(item.submenu ? item.label : null)}>
      {item.separator && <hr />}
      {item.submenu ? (
        <>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={sub === item.label}
            data-submenu={item.label}
            disabled={item.disabled}
            // A click only opens: the mouse over the item has already opened it, and a click then must not close it.
            // Enter or Space (a click without a pointer) also enters.
            onClick={(e) => (e.detail === 0 ? enter(item.label) : setSub(item.label))}
          >
            <span className="check" />
            <span className="menu-label">{item.label}</span>
            <span className="menu-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          {sub === item.label && (
            <div className="menu-panel submenu" role="menu">
              {item.submenu.map((subItem) => (
                <div key={subItem.label}>
                  {subItem.separator && <hr />}
                  {leaf(subItem)}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        leaf(item)
      )}
    </div>
  );

  return (
    <div className="menubar" role="menubar" ref={root} onKeyDown={onKeyDown}>
      {menus.map((menu, i) => (
        <div className="menu" key={menu.label}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            className={open === i ? "menu-title open" : "menu-title"}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {menu.label}
          </button>
          {open === i && (
            <div className="menu-panel" role="menu">
              {menu.items.map(entry)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
