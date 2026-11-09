import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** A wider window (a long list, like the shortcuts). */
  wide?: boolean;
}

/** Dialog window above the rest: it closes with Esc, with a click outside or with "Close". */
export default function Modal({ title, onClose, children, wide = false }: ModalProps) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    box.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? "modal wide" : "modal"} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={box}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
