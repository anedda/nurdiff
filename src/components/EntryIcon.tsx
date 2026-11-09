import type { EntryKind } from "../types";

/**
 * Icon of a list entry: folder (closed or open), file or symbolic link.
 * Monochrome: it uses `currentColor`, so it takes the colour of the text that contains it.
 * Inline SVG and not emoji, because emoji glyphs change from one system to another.
 */
export default function EntryIcon({ kind, open = false }: { kind: EntryKind; open?: boolean }) {
  const common = {
    className: "entry-icon",
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  if (kind === "dir") {
    return open ? (
      <svg {...common} data-icon="dir-open">
        <path d="M1.8 4.2v8.3h10.9l1.5-5.4H4.6L3.2 12.5" />
        <path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.3 1.5h5v2.6" />
      </svg>
    ) : (
      <svg {...common} data-icon="dir">
        <path d="M1.8 4c0-.6.5-1.1 1.1-1.1h3.2l1.4 1.6h6.6c.6 0 1.1.5 1.1 1.1v6.4c0 .6-.5 1.1-1.1 1.1H2.9c-.6 0-1.1-.5-1.1-1.1z" />
      </svg>
    );
  }
  if (kind === "symlink") {
    return (
      <svg {...common} data-icon="link">
        <path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.4-2.4a2.6 2.6 0 0 0-3.7-3.7l-.8.8" />
        <path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.8-.8" />
      </svg>
    );
  }
  return (
    <svg {...common} data-icon="file">
      <path d="M3.6 1.9h5.4l3.4 3.4v8.2c0 .4-.3.7-.7.7H3.6c-.4 0-.7-.3-.7-.7V2.6c0-.4.3-.7.7-.7z" />
      <path d="M9 1.9v3.4h3.4" />
    </svg>
  );
}
