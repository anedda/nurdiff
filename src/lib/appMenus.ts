import type { Menu } from "../components/MenuBar";
import type { TabCommands } from "./commands";
import type { Translate } from "../i18n";
import type { Mode } from "../types";
import { CODE_SIZE_DEFAULT, CODE_SIZE_MAX, CODE_SIZE_MIN, nextCodeSize, type Settings, type SizeAction, type Theme } from "./settings";
import { sidebarUnavailable, type SidebarState } from "./sidebar";

export type DialogName = "options" | "report" | "shortcuts" | "about";

/** What is needed to build the title bar menus: the state they depend on and the actions they launch. */
export interface AppMenuInput {
  t: Translate;
  settings: Settings;
  sidebar: SidebarState;
  /** The foreground tab: the Home cannot be closed, the report only exists after a comparison. */
  activeTab: { home?: boolean; report?: unknown } | undefined;
  /** What the foreground tab can do (undo, find, merge), or `null` if it offers nothing: the Edit menu is then off. */
  commands: TabCommands | null;
  onNewTab: (mode?: Mode) => void;
  onCloseTab: () => void;
  onSettings: (next: Settings) => void;
  onSidebar: (next: SidebarState) => void;
  onDialog: (dialog: DialogName) => void;
}

/** The File, Edit, View, Tools and Help menus. */
export function buildMenus(o: AppMenuInput): Menu[] {
  const { t, settings, sidebar, activeTab, commands } = o;
  const command = (name: keyof TabCommands) => ({ disabled: !commands?.[name].enabled, onSelect: () => commands?.[name].run() });
  const setTheme = (theme: Theme) => o.onSettings({ ...settings, theme });
  const resize = (action: SizeAction) => o.onSettings({ ...settings, codeSize: nextCodeSize(settings.codeSize, action) });
  return [
    {
      label: t("menu.file"),
      items: [
        { label: t("menu.newFiles"), shortcut: t("menu.newFiles.key"), onSelect: () => o.onNewTab("files") },
        { label: t("menu.newDirs"), shortcut: t("menu.newDirs.key"), onSelect: () => o.onNewTab("dirs") },
        { label: t("menu.newTab"), shortcut: "Ctrl+T", onSelect: () => o.onNewTab(), separator: true },
        { label: t("menu.closeTab"), shortcut: "Ctrl+W", disabled: !activeTab || !!activeTab.home, onSelect: o.onCloseTab },
      ],
    },
    {
      label: t("menu.edit"),
      items: [
        { label: t("menu.undo"), shortcut: "Ctrl+Z", ...command("undo") },
        { label: t("menu.find"), shortcut: "Ctrl+F", ...command("find") },
        { label: t("menu.applyRight"), shortcut: "Alt+→", separator: true, ...command("applyToRight") },
        { label: t("menu.applyLeft"), shortcut: "Alt+←", ...command("applyToLeft") },
      ],
    },
    {
      label: t("menu.view"),
      items: [
        {
          label: t("menu.theme"),
          submenu: [
            { label: t("options.theme.auto"), checked: settings.theme === "auto", onSelect: () => setTheme("auto") },
            { label: t("options.theme.light"), checked: settings.theme === "light", onSelect: () => setTheme("light") },
            { label: t("options.theme.dark"), checked: settings.theme === "dark", onSelect: () => setTheme("dark") },
          ],
        },
        { label: t("menu.compactToolbar"), checked: settings.compactToolbar, onSelect: () => o.onSettings({ ...settings, compactToolbar: !settings.compactToolbar }) },
        {
          label: t("sidebar.label"),
          shortcut: "Ctrl+B",
          checked: sidebar.open,
          disabled: sidebarUnavailable(!!activeTab?.home, sidebar),
          onSelect: () => o.onSidebar({ ...sidebar, open: !sidebar.open }),
        },
        { label: t("menu.textBigger"), shortcut: "Ctrl++", disabled: settings.codeSize >= CODE_SIZE_MAX, onSelect: () => resize("bigger"), separator: true },
        { label: t("menu.textSmaller"), shortcut: "Ctrl+-", disabled: settings.codeSize <= CODE_SIZE_MIN, onSelect: () => resize("smaller") },
        { label: t("menu.textReset"), shortcut: "Ctrl+0", disabled: settings.codeSize === CODE_SIZE_DEFAULT, onSelect: () => resize("reset") },
      ],
    },
    {
      label: t("menu.tools"),
      items: [
        { label: t("menu.report"), disabled: !activeTab?.report, onSelect: () => o.onDialog("report") },
        { label: t("menu.options"), onSelect: () => o.onDialog("options"), separator: true },
      ],
    },
    {
      label: t("menu.help"),
      items: [
        { label: t("shortcuts.title"), onSelect: () => o.onDialog("shortcuts") },
        { label: t("about.title"), onSelect: () => o.onDialog("about") },
      ],
    },
  ];
}
