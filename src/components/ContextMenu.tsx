import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextItem {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** A separator row before the item. */
  separator?: boolean;
}

interface Props {
  /** Where it was clicked (window coordinates). */
  x: number;
  y: number;
  items: ContextItem[];
  onClose: () => void;
  /**
   * The menu does not take focus: it stays where it is (for example in the pane with selected text, which would otherwise
   * lose its highlighting). It is used with the mouse: Esc closes, the arrows do not, and a click on an item does not move the focus.
   */
  keepFocus?: boolean;
}

/**
 * Context menu: it appears where it was clicked, stays inside the window and closes with a click
 * outside, Esc, the wheel or a resize. Up/down arrows and Enter work.
 */
export default function ContextMenu({ x, y, items, onClose, keepFocus = false }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  // Where the focus was before the menu took it (read only once, before the first `focus()`).
  const focusBefore = useRef<HTMLElement | null>(null);

  // Once the menu is measured, it is moved if it would leave the window.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - height - 4)),
    });
    if (focusBefore.current === null) focusBefore.current = document.activeElement as HTMLElement | null;
    if (!keepFocus) el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y, items, keepFocus]);

  // On closing the focus goes back to where it was (the pane, the row): otherwise it stays on the page body and the arrows do nothing.
  useEffect(
    () => () => {
      const before = focusBefore.current;
      if (before && before !== document.body && before.isConnected) before.focus({ preventScroll: true });
    },
    [],
  );

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    // Without focus in the menu, Esc is listened to on the window.
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    if (keepFocus) window.addEventListener("keydown", onEsc, true);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onEsc, true);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose, keepFocus]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (buttons.length === 0) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + delta + buttons.length) % buttons.length].focus();
  }

  return createPortal(
    <div
      className="ctx-menu menu-panel"
      role="menu"
      ref={root}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
      // With `keepFocus` a click on an item must not move the focus (and with it the highlighting of the selection).
      onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && <hr />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect?.();
            }}
          >
            <span className="menu-label">{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
