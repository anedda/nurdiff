import { describe, expect, it } from "vitest";
import { DEFAULT_SIDEBAR, SIDEBAR_MAX, SIDEBAR_MIN, clampSidebarWidth, parseSidebar, sidebarUnavailable } from "./sidebar";

describe("parseSidebar", () => {
  it("senza dati o con dati rotti dà i predefiniti", () => {
    expect(parseSidebar(null)).toEqual(DEFAULT_SIDEBAR);
    expect(parseSidebar("{rotto")).toEqual(DEFAULT_SIDEBAR);
    expect(parseSidebar("42")).toEqual(DEFAULT_SIDEBAR);
  });

  it("è chiusa di default", () => {
    expect(DEFAULT_SIDEBAR.open).toBe(false);
  });

  it("legge i valori validi e scarta gli altri", () => {
    expect(parseSidebar(JSON.stringify({ open: true, width: 300, view: "files" }))).toEqual({
      open: true,
      width: 300,
      view: "files",
    });
    const s = parseSidebar(JSON.stringify({ open: "sì", width: "larga", view: "altro" }));
    expect(s).toEqual(DEFAULT_SIDEBAR);
  });

  it("la larghezza resta nei limiti", () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX);
    expect(parseSidebar(JSON.stringify({ width: 5000 })).width).toBe(SIDEBAR_MAX);
  });
});

describe("sidebarUnavailable", () => {
  it("sulla Home con la barra chiusa il pulsante non si può usare; con la barra aperta serve a chiuderla", () => {
    const closed = { ...DEFAULT_SIDEBAR, open: false };
    const open = { ...DEFAULT_SIDEBAR, open: true };
    expect(sidebarUnavailable(true, closed)).toBe(true);
    expect(sidebarUnavailable(true, open)).toBe(false);
  });

  it("su un tab di confronto si usa sempre", () => {
    expect(sidebarUnavailable(false, { ...DEFAULT_SIDEBAR, open: false })).toBe(false);
    expect(sidebarUnavailable(false, { ...DEFAULT_SIDEBAR, open: true })).toBe(false);
  });
});
