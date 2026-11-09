import { readStored, writeStored } from "./configStore";

/** Sidebar: which view it shows, whether it is open and how wide it is. It is remembered between launches. */
export type SidebarView = "diffs" | "files";

export interface SidebarState {
  open: boolean;
  width: number;
  view: SidebarView;
}

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 520;
export const SIDEBAR_DEFAULT = 280;

export const DEFAULT_SIDEBAR: SidebarState = { open: false, width: SIDEBAR_DEFAULT, view: "diffs" };

/**
 * The sidebar button has nothing to open on the Home: it stays in its place but is disabled while the bar is closed
 * (if the bar is open, the button closes it). The same rule holds for Ctrl+B and the View menu.
 */
export function sidebarUnavailable(onHome: boolean, sidebar: SidebarState): boolean {
  return onHome && !sidebar.open;
}

export function clampSidebarWidth(n: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(n)));
}

/** Reads the saved state: every invalid or missing value goes back to the default. */
export function parseSidebar(text: string | null): SidebarState {
  const out = { ...DEFAULT_SIDEBAR };
  if (!text) return out;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return out;
  }
  if (typeof data !== "object" || data === null) return out;
  const d = data as Record<string, unknown>;
  if (typeof d.open === "boolean") out.open = d.open;
  if (typeof d.width === "number" && Number.isFinite(d.width)) out.width = clampSidebarWidth(d.width);
  if (d.view === "diffs" || d.view === "files") out.view = d.view;
  return out;
}

export function loadSidebar(): SidebarState {
  return parseSidebar(readStored("state"));
}

export function saveSidebar(state: SidebarState): void {
  writeStored("state", JSON.stringify(state, null, 2));
}
