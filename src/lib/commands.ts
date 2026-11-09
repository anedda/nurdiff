import { createContext, useContext, useEffect, useRef } from "react";

/** One thing the foreground tab can do: whether it can be done now and how. */
export interface TabCommand {
  enabled: boolean;
  run: () => void;
}

/** What the menus can ask of the foreground tab (a file comparison). */
export interface TabCommands {
  undo: TabCommand;
  find: TabCommand;
  applyToRight: TabCommand;
  applyToLeft: TabCommand;
}

/**
 * Where the foreground tab says what it can do, so the menus (which live above the tabs) can offer it. It holds a
 * function, not a value: the state of the tab is read when the menu opens, without making the application redraw
 * at every change of the tab.
 */
export class CommandRegistry {
  private source: object | null = null;
  private get: (() => TabCommands) | null = null;

  /** `source` identifies who registers: a tab that stops being in the foreground only removes its own. */
  set(source: object, get: () => TabCommands): void {
    this.source = source;
    this.get = get;
  }

  clear(source: object): void {
    if (this.source !== source) return;
    this.source = null;
    this.get = null;
  }

  /** What the foreground tab can do now, or `null` if it offers nothing (Home, folders, no comparison yet). */
  current(): TabCommands | null {
    return this.get ? this.get() : null;
  }
}

export const CommandsContext = createContext<CommandRegistry | null>(null);

/** Offers the commands of this view while it is in the foreground (`active`). `get` is read at the time of use. */
export function useRegisterCommands(active: boolean, get: () => TabCommands): void {
  const registry = useContext(CommandsContext);
  const source = useRef({}).current;
  const latest = useRef(get);
  latest.current = get;
  useEffect(() => {
    if (!registry || !active) return;
    registry.set(source, () => latest.current());
    return () => registry.clear(source);
  }, [registry, active, source]);
}
