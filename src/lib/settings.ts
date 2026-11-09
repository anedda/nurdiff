import type { Algorithm, Whitespace } from "../types";
import { readStored, writeStored } from "./configStore";
import type { DirFilter } from "./tree";

export type Theme = "auto" | "light" | "dark";

export interface Settings {
  /** Language of the interface: "auto" (like the system) or the code of a language with a catalogue. */
  language: string;
  theme: Theme;
  /** Size of the text in the file panes, in pixels. */
  codeSize: number;
  /** Initial values of the options of a new file comparison. */
  ignoreCase: boolean;
  ignoreWhitespace: Whitespace;
  /** Algorithm a new file comparison opens with. */
  algorithm: Algorithm;
  /** Filter the list of a folder comparison opens with. */
  dirFilter: DirFilter;
  /** After a drag or "Browse…" it compares right away, instead of waiting for "Compare". */
  compareOnDrop: boolean;
  /** Two files chosen (drag, "Browse…", recents): they are compared right away. */
  compareFilesOnDrop: boolean;
  /** Use the system title bar instead of NurDiff's own with the menus. */
  systemTitleBar: boolean;
  /** In the folder comparison, consecutive rows with slightly different backgrounds. */
  dirStripes: boolean;
  /** Compact file comparison bar: a single row with icons only, summary in the bar and an "Options" menu. Changed from the View menu. */
  compactToolbar: boolean;
}

export const CODE_SIZE_MIN = 11;
export const CODE_SIZE_MAX = 16; // beyond that it does not fit in the 20 px row
export const CODE_SIZE_DEFAULT = 13;

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  theme: "auto",
  codeSize: CODE_SIZE_DEFAULT,
  ignoreCase: false,
  ignoreWhitespace: "none",
  algorithm: "myers",
  dirFilter: "all",
  compareOnDrop: false,
  compareFilesOnDrop: true,
  systemTitleBar: false,
  dirStripes: true,
  compactToolbar: false,
};

/** What the size keys and menu items ask for. */
export type SizeAction = "bigger" | "smaller" | "reset";

/** The size of the text in the files after an action (always within the limits). */
export function nextCodeSize(current: number, action: SizeAction): number {
  if (action === "reset") return CODE_SIZE_DEFAULT;
  return clampCodeSize(current + (action === "bigger" ? 1 : -1));
}

export function clampCodeSize(n: number): number {
  return Math.max(CODE_SIZE_MIN, Math.min(CODE_SIZE_MAX, Math.round(n)));
}

/** Reads the saved settings: every invalid or missing value goes back to the default. */
export function parseSettings(text: string | null): Settings {
  const out = { ...DEFAULT_SETTINGS };
  if (!text) return out;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return out;
  }
  if (typeof data !== "object" || data === null) return out;
  const d = data as Record<string, unknown>;
  if (typeof d.language === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]+)*$/.test(d.language)) out.language = d.language;
  if (d.theme === "auto" || d.theme === "light" || d.theme === "dark") out.theme = d.theme;
  if (typeof d.codeSize === "number" && Number.isFinite(d.codeSize)) out.codeSize = clampCodeSize(d.codeSize);
  if (typeof d.ignoreCase === "boolean") out.ignoreCase = d.ignoreCase;
  // It used to be a yes/no ("all spaces"): settings already saved stay valid.
  if (typeof d.ignoreWhitespace === "boolean") out.ignoreWhitespace = d.ignoreWhitespace ? "all" : "none";
  else if (d.ignoreWhitespace === "none" || d.ignoreWhitespace === "trailing" || d.ignoreWhitespace === "amount" || d.ignoreWhitespace === "all") out.ignoreWhitespace = d.ignoreWhitespace;
  if (d.algorithm === "myers" || d.algorithm === "patience" || d.algorithm === "histogram") out.algorithm = d.algorithm;
  if (d.dirFilter === "all" || d.dirFilter === "diffs" || d.dirFilter === "same") out.dirFilter = d.dirFilter;
  if (typeof d.compareOnDrop === "boolean") out.compareOnDrop = d.compareOnDrop;
  if (typeof d.compareFilesOnDrop === "boolean") out.compareFilesOnDrop = d.compareFilesOnDrop;
  if (typeof d.systemTitleBar === "boolean") out.systemTitleBar = d.systemTitleBar;
  if (typeof d.dirStripes === "boolean") out.dirStripes = d.dirStripes;
  if (typeof d.compactToolbar === "boolean") out.compactToolbar = d.compactToolbar;
  return out;
}

export function loadSettings(): Settings {
  return parseSettings(readStored("settings"));
}

export function saveSettings(settings: Settings): void {
  writeStored("settings", JSON.stringify(settings, null, 2));
}

/** Applies theme and text size to the page (attribute and CSS variable on the root element). */
export function applySettings(settings: Settings, root: HTMLElement = document.documentElement): void {
  if (settings.theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", settings.theme);
  root.style.setProperty("--code-size", `${settings.codeSize}px`);
}

/** Does the comparison start by itself after choosing the paths? It depends on the type. */
export function runsOnPick(s: Pick<Settings, "compareOnDrop" | "compareFilesOnDrop">, mode: "files" | "dirs" | null): boolean {
  return mode === "dirs" ? s.compareOnDrop : s.compareFilesOnDrop;
}
