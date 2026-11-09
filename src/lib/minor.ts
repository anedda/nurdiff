import type { Translate } from "../i18n";
import type { MinorCauses } from "../types";

const KEYS: [keyof MinorCauses, string][] = [
  ["eol", "minor.eol"],
  ["encoding", "minor.encoding"],
  ["trailingSpace", "minor.trailingSpace"],
  ["whitespace", "minor.whitespace"],
  ["case", "minor.case"],
];

/** The causes of a minor difference, translated and separated by commas ("line ending, trailing spaces"). */
export function describeMinor(causes: MinorCauses, t: Translate): string {
  return KEYS.filter(([k]) => causes[k]).map(([, key]) => t(key)).join(", ");
}
