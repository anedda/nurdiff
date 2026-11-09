import type { StatusKind } from "../lib/tree";

/** The icons of the file comparison toolbar: all 16 px SVGs with the same stroke, in the text colour. */
const SVG = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function UndoIcon() {
  return (
    <svg {...SVG}>
      <path d="M5.5 2.5 2.5 5.5l3 3" />
      <path d="M2.5 5.5H10a3.5 3.5 0 0 1 0 7H5" />
    </svg>
  );
}

export function SaveIcon() {
  return (
    <svg {...SVG}>
      <path d="M3 2.5h7.5L13 5v8.5H3z" />
      <path d="M5.5 2.5v3h4v-3" />
      <path d="M5 13.5v-4h6v4" />
    </svg>
  );
}

export function PilcrowIcon() {
  return (
    <svg {...SVG}>
      <path d="M10.5 3v10M7.5 3v10M10.5 3h2.5M7.5 3a3 3 0 0 0 0 6" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg {...SVG}>
      <path d="M13 8a5 5 0 1 1-1.5-3.5" />
      <path d="M13 2.5v3h-3" />
    </svg>
  );
}

export function ChevronUpIcon() {
  return (
    <svg {...SVG}>
      <path d="m4 10 4-4 4 4" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg {...SVG}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

/** Arrow towards a bar: copy to the right (→|). */
export function ArrowToRightIcon() {
  return (
    <svg {...SVG}>
      <path d="M2.5 8h8m-3-3 3 3-3 3M13.5 3v10" />
    </svg>
  );
}

/** Copy to the left (|←). */
export function ArrowToLeftIcon() {
  return (
    <svg {...SVG}>
      <path d="M13.5 8h-8m3-3-3 3 3 3M2.5 3v10" />
    </svg>
  );
}

/** Sliders (two lines with a dot): the comparison options. */
export function OptionsIcon() {
  return (
    <svg {...SVG}>
      <path d="M2.5 5h6m3 0h2M2.5 11h2m3 0h6" />
      <circle cx="10" cy="5" r="1.5" />
      <circle cx="6" cy="11" r="1.5" />
    </svg>
  );
}

/** Funnel: the file filter by extension. */
export function FunnelIcon() {
  return (
    <svg {...SVG}>
      <path d="M2.5 3h11L9.5 8v4.5l-3 1.5V8z" />
    </svg>
  );
}

/** Opens all the folders: two chevrons moving apart. */
export function ExpandAllIcon() {
  return (
    <svg {...SVG}>
      <path d="m4.5 6 3.5-3 3.5 3M4.5 10 8 13l3.5-3" />
    </svg>
  );
}

/** Closes all the folders: two chevrons moving closer. */
export function CollapseAllIcon() {
  return (
    <svg {...SVG}>
      <path d="m4.5 3 3.5 3 3.5-3M4.5 13 8 10l3.5 3" />
    </svg>
  );
}

/** A document with lines: a file. */
export function FileIcon() {
  return (
    <svg {...SVG}>
      <path d="M4 1.5h5L12.5 5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-12A.5.5 0 0 1 4 1.5Z" />
      <path d="M9 1.5V5h3.5M5.5 8.5h5M5.5 11h5" />
    </svg>
  );
}

/** A folder. */
export function FolderIcon() {
  return (
    <svg {...SVG}>
      <path d="M1.5 4a1 1 0 0 1 1-1h3.2l1.4 1.5h6.4a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

/** A folder with a plus: compare folders. */
export function FolderPlusIcon() {
  return (
    <svg {...SVG}>
      <path d="M1.5 4a1 1 0 0 1 1-1h3.2l1.4 1.5h6.4a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z" />
      <path d="M8 6.8v3.6M6.2 8.6h3.6" />
    </svg>
  );
}

/** An arrow up from a tray: drop here. */
export function UploadIcon() {
  return (
    <svg {...SVG}>
      <path d="M8 10.5v-8M5 5.3 8 2.3l3 3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...SVG}>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L12 4M6.5 6.5v5M9.5 6.5v5" />
    </svg>
  );
}

/** A cross: take away. */
export function CloseIcon() {
  return (
    <svg {...SVG}>
      <path d="m4 4 8 8m0-8-8 8" />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg {...SVG}>
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

/** The round "x" that clears a field. */
export function ClearIcon() {
  return (
    <svg {...SVG}>
      <circle cx="8" cy="8" r="6" />
      <path d="m5.8 5.8 4.4 4.4m0-4.4-4.4 4.4" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...SVG}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}

/**
 * Status of an entry in the folder comparison (unified view): different shapes, not only colours.
 * `different` ≠, `minor` ≈, `identical` =, `leftOnly` arrow to the left against a bar,
 * `rightOnly` its mirror, `typeMismatch` two opposite arrows.
 */
export function StatusIcon({ status }: { status: StatusKind }) {
  switch (status) {
    case "different":
      return (
        <svg {...SVG}>
          <path d="M3.5 6h9M3.5 10h9M10 2.5 6 13.5" />
        </svg>
      );
    case "minor":
      return (
        <svg {...SVG}>
          <path d="M2.5 6.5c1.5-1.8 3-1.8 5.5 0s4 1.8 5.5 0M2.5 10.5c1.5-1.8 3-1.8 5.5 0s4 1.8 5.5 0" />
        </svg>
      );
    case "identical":
      return (
        <svg {...SVG}>
          <path d="M3.5 6h9M3.5 10h9" />
        </svg>
      );
    case "leftOnly":
      return (
        <svg {...SVG}>
          <path d="M13.5 8H5M8.5 4.5 5 8l3.5 3.5M2.5 3.5v9" />
        </svg>
      );
    case "rightOnly":
      return (
        <svg {...SVG}>
          <path d="M2.5 8H11M7.5 4.5 11 8l-3.5 3.5M13.5 3.5v9" />
        </svg>
      );
    case "typeMismatch":
      return (
        <svg {...SVG}>
          <path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13" />
        </svg>
      );
    case "notCompared":
      return (
        <svg {...SVG}>
          <path d="M3.5 4.5h2M8 4.5h2M12.5 4.5h.5M3.5 8h.5M6.5 8h2M11 8h2M3.5 11.5h2M8 11.5h2M12.5 11.5h.5" />
        </svg>
      );
  }
}

/** The items of the "More filters" menu: the class gives the colour (status or side), the drawing distinguishes it from the others. */
export type MenuFilterIcon =
  | "noOrphans"
  | "diffsNoOrphans"
  | "orphans"
  | "leftNewer"
  | "rightNewer"
  | "leftOrphans"
  | "rightOrphans";

/** The colour of a filter icon: red for differences, the side colours for left and right, neutral for the rest. */
export const MENU_FILTER_TONE: Record<MenuFilterIcon, "neutral" | "different" | "left" | "right"> = {
  noOrphans: "neutral",
  diffsNoOrphans: "different",
  orphans: "neutral",
  leftNewer: "left",
  rightNewer: "right",
  leftOrphans: "left",
  rightOrphans: "right",
};

export function MenuFilterIcon({ filter }: { filter: MenuFilterIcon }) {
  switch (filter) {
    case "noOrphans":
      // The entry is on both sides: two joined halves.
      return (
        <svg {...SVG}>
          <path d="M2.5 4.5h4.5v7H2.5zM9 4.5h4.5v7H9zM7 8h2" />
        </svg>
      );
    case "diffsNoOrphans":
      return <StatusIcon status="different" />;
    case "orphans":
      // An entry on one side only, left or right: the two arrows against the edge.
      return (
        <svg {...SVG}>
          <path d="M2.5 3.5v9M13.5 3.5v9M7 8H4.5M6 6.5 4.5 8 6 9.5M9 8h2.5M10 6.5 11.5 8 10 9.5" />
        </svg>
      );
    case "leftOrphans":
      return <StatusIcon status="leftOnly" />;
    case "rightOrphans":
      return <StatusIcon status="rightOnly" />;
    case "leftNewer":
      // A clock with the arrow from the more recent side.
      return (
        <svg {...SVG}>
          <path d="M4.5 4.5 2 8l2.5 3.5M10 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10 5.8V8l1.6 1" />
        </svg>
      );
    case "rightNewer":
      return (
        <svg {...SVG}>
          <path d="M11.5 4.5 14 8l-2.5 3.5M6 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM6 5.8V8l1.6 1" />
        </svg>
      );
  }
}

/** Copy: two overlapping sheets. */
export function CopyIcon() {
  return (
    <svg {...SVG}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </svg>
  );
}
