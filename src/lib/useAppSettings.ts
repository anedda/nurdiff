import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeT, resolveLanguage, systemLanguages } from "../i18n";
import { setSystemTitleBar } from "../api";
import { applySettings, loadSettings, saveSettings, type Settings } from "./settings";
import { loadSidebar, saveSidebar, type SidebarState } from "./sidebar";

/**
 * The app settings: they are applied to the page at every change and saved. The language depends on them
 * (the chosen one or, with "auto", that of the system) and the translator `tr`; `trRef` gives its latest value to
 * events registered only once.
 */
export function useAppSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  useEffect(() => {
    applySettings(settings);
  }, [settings]);
  // The window is created without the system bar (tauri.conf.json): the option puts it back.
  useEffect(() => {
    void setSystemTitleBar(settings.systemTitleBar);
  }, [settings.systemTitleBar]);
  const lang = resolveLanguage(settings.language, systemLanguages());
  const tr = useMemo(() => makeT(lang), [lang]);
  const trRef = useRef(tr);
  trRef.current = tr;
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const changeSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);
  return { settings, changeSettings, lang, tr, trRef };
}

/** The sidebar: open or not, how wide, which view. It is remembered between launches. */
export function useSidebarState() {
  const [sidebar, setSidebar] = useState<SidebarState>(loadSidebar);
  /** `persist` is false while dragging the edge and true at the end. */
  const changeSidebar = useCallback((next: SidebarState, persist = true) => {
    setSidebar(next);
    if (persist) saveSidebar(next);
  }, []);
  const sidebarRef = useRef(sidebar);
  sidebarRef.current = sidebar;
  return { sidebar, changeSidebar, sidebarRef };
}
