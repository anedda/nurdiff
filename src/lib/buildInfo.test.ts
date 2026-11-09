import { describe, expect, it } from "vitest";
import { makeT } from "../i18n";
import { describeBuild, describeRuntime } from "./buildInfo";

const it_ = makeT("it");
const en = makeT("en");
const base = { version: "0.1.0", commit: "a1b2c3d", date: "2026-10-18T15:42:00.000Z", dev: false };

describe("describeBuild", () => {
  it("versione, commit e data con l'orario", () => {
    expect(describeBuild(base, it_, "it", "Europe/Rome")).toBe("Versione 0.1.0 · a1b2c3d · compilata il 18 ottobre 2026, 17:42");
  });
  it("l'asterisco delle modifiche non committate resta attaccato al commit", () => {
    expect(describeBuild({ ...base, commit: "a1b2c3d*" }, it_, "it", "Europe/Rome")).toContain("· a1b2c3d* ·");
  });
  it("in sviluppo lo dice", () => {
    expect(describeBuild({ ...base, dev: true }, it_, "it", "Europe/Rome")).toMatch(/^Versione 0\.1\.0 \(sviluppo\) · /);
  });
  it("le parti non note si omettono", () => {
    expect(describeBuild({ ...base, commit: "", date: "" }, it_, "it")).toBe("Versione 0.1.0");
    expect(describeBuild({ ...base, date: "" }, it_, "it")).toBe("Versione 0.1.0 · a1b2c3d");
  });
  it("in inglese", () => {
    expect(describeBuild(base, en, "en", "UTC")).toMatch(/^Version 0\.1\.0 · a1b2c3d · built on .*2026/);
  });
});

describe("describeRuntime", () => {
  it("WebKitGTK (Linux)", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(describeRuntime(ua)).toEqual({ engine: "WebKit 605.1.15", system: "X11; Linux x86_64" });
  });
  it("WebView2 (Windows)", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.67";
    expect(describeRuntime(ua)).toEqual({ engine: "Edge WebView2 124.0.2478.67", system: "Windows NT 10.0; Win64; x64" });
  });
  it("Chromium", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.6367.29 Safari/537.36";
    expect(describeRuntime(ua).engine).toBe("Chromium 124.0.6367.29");
  });
  it("uno user agent sconosciuto non rompe nulla", () => {
    expect(describeRuntime("")).toEqual({ engine: "", system: "" });
  });
});
