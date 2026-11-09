import { describe, expect, it } from "vitest";
import type { FileInfo } from "../types";
import { describeFile } from "./describeFile";

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key);
const info = (extra: Partial<FileInfo>): FileInfo => ({ lines: 3, encoding: "utf8", eol: "lf", ...extra }) as FileInfo;

describe("describeFile", () => {
  it("i nomi tecnici restano com'è", () => {
    expect(describeFile(info({}), t)).toBe('fd.info {"count":3,"encoding":"UTF-8","eol":"LF"}');
    expect(describeFile(info({ encoding: "utf16Le", eol: "crlf" }), t)).toContain('"encoding":"UTF-16 LE","eol":"CRLF"');
  });

  it("le etichette `fd.*` si traducono", () => {
    const out = describeFile(info({ encoding: "utf8Bom", eol: "mixed" }), t);
    expect(out).toContain('"encoding":"fd.enc.utf8Bom"');
    expect(out).toContain('"eol":"fd.eol.mixed"');
  });
});
