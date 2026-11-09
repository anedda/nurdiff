import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "../test/renderHook";
import { DEFAULT_SETTINGS } from "./settings";
import { DEFAULT_SIDEBAR } from "./sidebar";

const titleBar = vi.fn();
// Outside Tauri: the settings are in the browser storage (the `configStore` fallback), which the test fakes below.
vi.mock("../api", () => ({
  inTauri: false,
  setSystemTitleBar: (v: boolean) => titleBar(v),
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  backupConfig: vi.fn(),
  configPath: vi.fn(),
}));

const { useAppSettings, useSidebarState } = await import("./useAppSettings");
const { initConfigStore, resetConfigStore } = await import("./configStore");

/** A minimal page: the root element with attributes and style, and an in-memory `localStorage`. */
let root: { attrs: Record<string, string>; vars: Record<string, string>; lang: string };
let store: Map<string, string>;
beforeEach(() => {
  resetConfigStore();
  titleBar.mockClear();
  root = { attrs: {}, vars: {}, lang: "" };
  store = new Map();
  vi.stubGlobal("document", {
    documentElement: {
      removeAttribute: (k: string) => delete root.attrs[k],
      setAttribute: (k: string, v: string) => (root.attrs[k] = v),
      style: { setProperty: (k: string, v: string) => (root.vars[k] = v) },
      set lang(v: string) {
        root.lang = v;
      },
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("useAppSettings", () => {
  it("applica le impostazioni alla pagina, la lingua e il titolo di sistema", () => {
    renderHook(() => useAppSettings(), undefined);
    expect(root.vars["--code-size"]).toBe(`${DEFAULT_SETTINGS.codeSize}px`);
    expect(titleBar).toHaveBeenCalledWith(DEFAULT_SETTINGS.systemTitleBar);
    expect(root.lang).not.toBe("");
  });

  it("cambiare le impostazioni le salva e le applica subito", () => {
    const h = renderHook(() => useAppSettings(), undefined);
    act(() => h.current.changeSettings({ ...h.current.settings, theme: "dark", codeSize: 16 }));
    expect(root.attrs["data-theme"]).toBe("dark");
    expect(root.vars["--code-size"]).toBe("16px");
    expect(JSON.parse([...store.values()][0])).toMatchObject({ theme: "dark", codeSize: 16 });
  });

  it("la lingua scelta cambia il traduttore e quello recente è in trRef", () => {
    const h = renderHook(() => useAppSettings(), undefined);
    act(() => h.current.changeSettings({ ...h.current.settings, language: "en" }));
    expect(h.current.lang).toBe("en");
    expect(root.lang).toBe("en");
    const en = h.current.tr("sidebar.label");
    act(() => h.current.changeSettings({ ...h.current.settings, language: "it" }));
    expect(h.current.tr("sidebar.label")).not.toBe(en);
    expect(h.current.trRef.current).toBe(h.current.tr);
  });

  it("con l'opzione della barra di sistema la rimette", () => {
    const h = renderHook(() => useAppSettings(), undefined);
    titleBar.mockClear();
    act(() => h.current.changeSettings({ ...h.current.settings, systemTitleBar: true }));
    expect(titleBar).toHaveBeenCalledWith(true);
  });

  it("riparte dalle impostazioni salvate", async () => {
    store.set("nurdiff.settings", JSON.stringify({ theme: "light", codeSize: 15 }));
    await initConfigStore(); // as at the start of the app: the files are read before the first frame
    const h = renderHook(() => useAppSettings(), undefined);
    expect(h.current.settings).toMatchObject({ theme: "light", codeSize: 15 });
  });
});

describe("useSidebarState", () => {
  it("parte dal predefinito e salva i cambiamenti (non durante il trascinamento del bordo)", () => {
    const h = renderHook(() => useSidebarState(), undefined);
    expect(h.current.sidebar).toEqual(DEFAULT_SIDEBAR);
    act(() => h.current.changeSidebar({ ...DEFAULT_SIDEBAR, width: 300 }, false));
    expect(store.size).toBe(0);
    act(() => h.current.changeSidebar({ ...DEFAULT_SIDEBAR, width: 320, open: true }));
    expect(JSON.parse(store.get("nurdiff.sidebar")!)).toMatchObject({ width: 320, open: true });
    expect(h.current.sidebarRef.current.width).toBe(320);
  });

  it("riparte dalla barra salvata", async () => {
    store.set("nurdiff.sidebar", JSON.stringify({ open: true, width: 400, view: "files" }));
    await initConfigStore();
    const h = renderHook(() => useSidebarState(), undefined);
    expect(h.current.sidebar).toEqual({ open: true, width: 400, view: "files" });
  });
});
