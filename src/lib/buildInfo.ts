import type { Translate } from "../i18n";
import { formatBuildDate } from "./buildDate";

export interface BuildInfo {
  version: string;
  /** Short commit, with "*" if there were uncommitted changes; empty if unknown. */
  commit: string;
  /** Build date in ISO format; empty if unknown. */
  date: string;
  dev: boolean;
}

/** The Home line: "Version 0.1.0 · a1b2c3d* · built on 18 October 2026, 17:42" (unknown parts are omitted). */
export function describeBuild(info: BuildInfo, t: Translate, lang: string, timeZone?: string): string {
  const parts = [t("home.version", { version: info.version }) + (info.dev ? ` (${t("home.dev")})` : "")];
  if (info.commit) parts.push(info.commit);
  const built = formatBuildDate(info.date, lang, timeZone);
  if (built) parts.push(t("home.built", { date: built }));
  return parts.join(" · ");
}

/**
 * From the "user agent", the engine of the window and the system. The engine number is the one declared
 * by the engine itself (WebKit keeps it fixed: it is not the version of WebKitGTK).
 */
export function describeRuntime(ua: string): { engine: string; system: string } {
  const system = /\(([^)]*)\)/.exec(ua)?.[1]?.trim() ?? "";
  const edge = /\bEdg\/([\d.]+)/.exec(ua);
  if (edge) return { engine: `Edge WebView2 ${edge[1]}`, system };
  const chrome = /Chrome\/([\d.]+)/.exec(ua); // also "HeadlessChrome"
  if (chrome) return { engine: `Chromium ${chrome[1]}`, system };
  const webkit = /\bAppleWebKit\/([\d.]+)/.exec(ua);
  if (webkit) return { engine: `WebKit ${webkit[1]}`, system };
  return { engine: "", system };
}
