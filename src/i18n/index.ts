/**
 * Translations of the interface. Each language is a flat file `locales/<code>.json` (key → text):
 * to add one just copy `en.json`, translate it and change `lang.name`; no code to touch.
 *
 * - `{name}` in the text is a placeholder, filled by the parameters of `t("key", { name: … })`.
 * - With the `count` parameter the text is chosen according to the plural rule of the language
 *   (`Intl.PluralRules`): `key_one`, `key_other`, and for languages that have them `_zero`, `_two`, `_few`, `_many`.
 * - A key that is missing in a language is read in English; if it is missing there too the key is shown.
 */
export type Params = Record<string, string | number>;
export type Translate = (key: string, params?: Params) => string;
/** A message still to be translated: the functions of `lib` return it, the interface translates it. */
export interface Message {
  key: string;
  params?: Params;
}
export const msg = (key: string, params?: Params): Message => ({ key, params });
export const renderMessage = (t: Translate, m: Message): string => t(m.key, m.params);
type Catalog = Record<string, string>;

export const FALLBACK_LANGUAGE = "en";
/** Value of the setting that follows the system language. */
export const AUTO_LANGUAGE = "auto";

const modules = import.meta.glob("./locales/*.json", { eager: true, import: "default" }) as Record<string, Catalog>;

export const catalogs: Record<string, Catalog> = {};
for (const [path, catalog] of Object.entries(modules)) {
  const code = path.replace(/^.*\//, "").replace(/\.json$/, "");
  catalogs[code] = catalog;
}

export interface LanguageInfo {
  code: string;
  /** Name of the language in the language itself. */
  name: string;
}

export function availableLanguages(): LanguageInfo[] {
  return Object.keys(catalogs)
    .map((code) => ({ code, name: catalogs[code]["lang.name"] ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The language to use: the chosen one, or (with "auto") the first system language for which there is a
 * catalogue, comparing the full code ("pt-BR") first and then the language ("pt").
 */
export function resolveLanguage(preference: string, systemLanguages: readonly string[]): string {
  if (preference !== AUTO_LANGUAGE) return preference in catalogs ? preference : FALLBACK_LANGUAGE;
  for (const tag of systemLanguages) {
    const lower = tag.toLowerCase();
    const exact = Object.keys(catalogs).find((c) => c.toLowerCase() === lower);
    if (exact) return exact;
    const base = lower.split("-")[0];
    const byBase = Object.keys(catalogs).find((c) => c.toLowerCase() === base);
    if (byBase) return byBase;
  }
  return FALLBACK_LANGUAGE;
}

export function systemLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}

function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

function pluralKey(lang: string, key: string, count: number): string[] {
  let rule = "other";
  try {
    rule = new Intl.PluralRules(lang).select(count);
  } catch {
    /* language unknown to the browser: "other" */
  }
  return [`${key}_${rule}`, `${key}_other`, key];
}

export function translate(lang: string, key: string, params?: Params): string {
  const candidates = typeof params?.count === "number" ? pluralKey(lang, key, params.count) : [key];
  for (const catalog of [catalogs[lang], catalogs[FALLBACK_LANGUAGE]]) {
    if (!catalog) continue;
    for (const k of candidates) {
      if (k in catalog) return fill(catalog[k], params);
    }
  }
  return key;
}

export function makeT(lang: string): Translate {
  return (key, params) => translate(lang, key, params);
}

/**
 * The text of an error that came from Rust: an object `{ code, params }` (translated) or, for everything
 * else (system, browser errors), the text as it is.
 */
export function describeError(e: unknown, t: Translate): string {
  if (typeof e === "object" && e !== null && typeof (e as { code?: unknown }).code === "string") {
    const { code, params } = e as { code: string; params?: Record<string, string | number> };
    const text = t(code, params);
    if (text !== code) return text;
    return params && Object.keys(params).length > 0 ? `${code} ${JSON.stringify(params)}` : code;
  }
  return String(e);
}
