import { describe, expect, it } from "vitest";
import { buildMenus, type AppMenuInput } from "./appMenus";
import { CODE_SIZE_DEFAULT, CODE_SIZE_MAX, CODE_SIZE_MIN, DEFAULT_SETTINGS } from "./settings";
import { DEFAULT_SIDEBAR } from "./sidebar";

const t = (key: string) => key;
const base = (extra: Partial<AppMenuInput> = {}): AppMenuInput => ({
  t,
  settings: DEFAULT_SETTINGS,
  sidebar: DEFAULT_SIDEBAR,
  activeTab: { home: true },
  commands: null,
  onNewTab: () => {},
  onCloseTab: () => {},
  onSettings: () => {},
  onSidebar: () => {},
  onDialog: () => {},
  ...extra,
});
const item = (menus: ReturnType<typeof buildMenus>, menu: string, label: string) =>
  menus.find((m) => m.label === menu)!.items.find((i) => i.label === label)!;

describe("buildMenus", () => {
  it("i cinque menu, nell'ordine", () => {
    expect(buildMenus(base()).map((m) => m.label)).toEqual(["menu.file", "menu.edit", "menu.view", "menu.tools", "menu.help"]);
  });

  it("senza comandi dal tab in primo piano (Home, cartelle) le voci di Modifica sono spente", () => {
    const edit = buildMenus(base()).find((m) => m.label === "menu.edit")!;
    expect(edit.items.map((i) => [i.label, i.disabled])).toEqual([
      ["menu.undo", true],
      ["menu.find", true],
      ["menu.applyRight", true],
      ["menu.applyLeft", true],
    ]);
    expect(() => edit.items.forEach((i) => i.onSelect?.())).not.toThrow();
  });

  it("le voci di Modifica seguono i comandi del tab e li eseguono, con le scorciatoie", () => {
    const calls: string[] = [];
    const on = (name: string) => ({ enabled: true, run: () => calls.push(name) });
    const off = { enabled: false, run: () => calls.push("off") };
    const menus = buildMenus(base({ commands: { undo: off, find: on("find"), applyToRight: on("right"), applyToLeft: off } }));
    expect(item(menus, "menu.edit", "menu.undo")).toMatchObject({ disabled: true, shortcut: "Ctrl+Z" });
    expect(item(menus, "menu.edit", "menu.applyLeft").disabled).toBe(true);
    item(menus, "menu.edit", "menu.find").onSelect?.();
    item(menus, "menu.edit", "menu.applyRight").onSelect?.();
    expect(calls).toEqual(["find", "right"]);
    expect(item(menus, "menu.edit", "menu.find")).toMatchObject({ disabled: false, shortcut: "Ctrl+F" });
    expect(item(menus, "menu.edit", "menu.applyRight").shortcut).toBe("Alt+→");
  });

  it("la Home non si chiude e il report c'è solo dopo un confronto", () => {
    expect(item(buildMenus(base()), "menu.file", "menu.closeTab").disabled).toBe(true);
    expect(item(buildMenus(base({ activeTab: {} })), "menu.file", "menu.closeTab").disabled).toBe(false);
    expect(item(buildMenus(base()), "menu.tools", "menu.report").disabled).toBe(true);
    expect(item(buildMenus(base({ activeTab: { report: {} } })), "menu.tools", "menu.report").disabled).toBe(false);
  });

  it("le azioni chiamano ciò che ricevono", () => {
    const calls: string[] = [];
    const menus = buildMenus(
      base({
        onNewTab: (mode) => calls.push(`tab:${mode ?? "-"}`),
        onSidebar: (s) => calls.push(`sidebar:${s.open}`),
        onSettings: (s) => calls.push(`theme:${s.theme}`),
        onDialog: (d) => calls.push(`dialog:${d}`),
      }),
    );
    item(menus, "menu.file", "menu.newFiles").onSelect?.();
    item(menus, "menu.file", "menu.newTab").onSelect?.();
    item(menus, "menu.view", "sidebar.label").onSelect?.();
    item(menus, "menu.view", "menu.theme").submenu!.find((i) => i.label === "options.theme.dark")!.onSelect?.();
    item(menus, "menu.help", "about.title").onSelect?.();
    expect(calls).toEqual(["tab:files", "tab:-", "sidebar:true", "theme:dark", "dialog:about"]);
  });
});

describe("sottomenu del tema", () => {
  it("le tre scelte stanno nel sottomenu «Tema» di Vista, con la spunta su quella attiva", () => {
    const menus = buildMenus(base({ settings: { ...DEFAULT_SETTINGS, theme: "light" } }));
    const theme = item(menus, "menu.view", "menu.theme");
    expect(theme.submenu!.map((i) => [i.label, !!i.checked])).toEqual([
      ["options.theme.auto", false],
      ["options.theme.light", true],
      ["options.theme.dark", false],
    ]);
    expect(theme.onSelect).toBeUndefined();
    expect(menus.find((m) => m.label === "menu.view")!.items.some((i) => i.label === "options.theme.dark")).toBe(false);
  });

  it("la dimensione del testo: scorciatoie sulle voci, e spente ai limiti o già normale", () => {
    const at = (codeSize: number) => buildMenus(base({ settings: { ...DEFAULT_SETTINGS, codeSize } }));
    const big = item(at(CODE_SIZE_DEFAULT), "menu.view", "menu.textBigger");
    expect(big.shortcut).toBe("Ctrl++");
    expect(item(at(CODE_SIZE_DEFAULT), "menu.view", "menu.textSmaller").shortcut).toBe("Ctrl+-");
    expect(item(at(CODE_SIZE_DEFAULT), "menu.view", "menu.textReset")).toMatchObject({ shortcut: "Ctrl+0", disabled: true });
    expect(item(at(CODE_SIZE_MAX), "menu.view", "menu.textBigger").disabled).toBe(true);
    expect(item(at(CODE_SIZE_MIN), "menu.view", "menu.textSmaller").disabled).toBe(true);
    expect(item(at(CODE_SIZE_MAX), "menu.view", "menu.textReset").disabled).toBe(false);
  });

  it("le voci della dimensione cambiano le impostazioni", () => {
    const seen: number[] = [];
    const menus = buildMenus(base({ settings: { ...DEFAULT_SETTINGS, codeSize: 15 }, onSettings: (s) => seen.push(s.codeSize) }));
    item(menus, "menu.view", "menu.textBigger").onSelect?.();
    item(menus, "menu.view", "menu.textSmaller").onSelect?.();
    item(menus, "menu.view", "menu.textReset").onSelect?.();
    expect(seen).toEqual([16, 14, CODE_SIZE_DEFAULT]);
  });

  it("la voce della barra laterale è spenta sulla Home con la barra chiusa, accesa altrove", () => {
    const sidebar = (menus: ReturnType<typeof buildMenus>) => item(menus, "menu.view", "sidebar.label");
    expect(sidebar(buildMenus(base({ activeTab: { home: true }, sidebar: { ...DEFAULT_SIDEBAR, open: false } }))).disabled).toBe(true);
    expect(sidebar(buildMenus(base({ activeTab: { home: true }, sidebar: { ...DEFAULT_SIDEBAR, open: true } }))).disabled).toBe(false);
    expect(sidebar(buildMenus(base({ activeTab: { home: false }, sidebar: { ...DEFAULT_SIDEBAR, open: false } }))).disabled).toBe(false);
  });
});
