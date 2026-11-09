import type { Translate } from "../i18n";
import type { Encoding, Eol, FileInfo } from "../types";

const ENCODING_LABEL: Record<Encoding, string> = {
  utf8: "UTF-8",
  utf8Bom: "fd.enc.utf8Bom",
  utf16Le: "UTF-16 LE",
  utf16Be: "UTF-16 BE",
  latin1: "Latin-1",
};

const EOL_LABEL: Record<Eol, string> = {
  lf: "LF",
  crlf: "CRLF",
  cr: "CR",
  mixed: "fd.eol.mixed",
  none: "fd.eol.none",
};

/** The `fd.*` keys are translated, the other names (UTF-8, LF…) stay as they are. */
const label = (t: Translate, v: string) => (v.startsWith("fd.") ? t(v) : v);

export function describeFile(info: FileInfo, t: Translate) {
  return t("fd.info", { count: info.lines, encoding: label(t, ENCODING_LABEL[info.encoding]), eol: label(t, EOL_LABEL[info.eol]) });
}
