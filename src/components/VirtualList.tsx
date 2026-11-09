import { useEffect, useRef, useState, type ReactNode } from "react";
import { visibleRange } from "../lib/virtual";

interface Props {
  count: number;
  /** Fixed height of each row, in pixels. */
  rowHeight: number;
  renderRow: (index: number) => ReactNode;
  className?: string;
  /** Brings the given row into view (the new object, even with the same index, redoes the scroll). */
  reveal?: { index: number } | null;
}

/** List with a fixed row height that draws only the visible rows. */
export default function VirtualList({ count, rowHeight, renderRow, className, reveal }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !reveal) return;
    const top = reveal.index * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + rowHeight - el.clientHeight;
    }
  }, [reveal, rowHeight]);

  const [start, end] = visibleRange(scrollTop, height, rowHeight, count);
  const rows: ReactNode[] = [];
  for (let i = start; i < end; i++) {
    rows.push(
      <div key={i} className="vl-row" style={{ top: i * rowHeight, height: rowHeight }}>
        {renderRow(i)}
      </div>,
    );
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ overflowY: "auto" }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ position: "relative", height: count * rowHeight }}>{rows}</div>
    </div>
  );
}
