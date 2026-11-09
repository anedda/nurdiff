import { createContext, useContext, useMemo, type ReactNode } from "react";
import { FALLBACK_LANGUAGE, makeT, type Translate } from "./index";

interface I18n {
  lang: string;
  t: Translate;
}

const I18nContext = createContext<I18n>({ lang: FALLBACK_LANGUAGE, t: makeT(FALLBACK_LANGUAGE) });

export function I18nProvider({ lang, children }: { lang: string; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: makeT(lang) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The translation function for the current language: the components redraw if the language changes. */
export function useT(): Translate {
  return useContext(I18nContext).t;
}

export function useLanguage(): string {
  return useContext(I18nContext).lang;
}
