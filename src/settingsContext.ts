import { createContext, useContext } from "react";
import { DEFAULT_SETTINGS, type Settings } from "./lib/settings";

/** Current settings: whoever opens a tab reads them for the initial values. */
export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS);

export function useSettings(): Settings {
  return useContext(SettingsContext);
}
