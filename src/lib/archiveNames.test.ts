import { describe, expect, it } from "vitest";
import { bothAreFolders, looksLikeArchive } from "./archiveNames";

describe("looksLikeArchive", () => {
  it("riconosce le estensioni degli archivi, anche in maiuscolo e dentro un altro archivio", () => {
    for (const p of ["/a/b.zip", "C:\\x\\LIB.JAR", "app.apk", "book.epub", "s.tar", "s.tar.gz", "s.tgz", "/a/outer.zip/inner.zip"]) {
      expect(looksLikeArchive(p), p).toBe(true);
    }
  });

  it("non scambia per archivi i file normali o gli altri formati basati su zip", () => {
    for (const p of ["/a/readme.txt", "doc.docx", "sheet.xlsx", "zip", "archive.zip.txt", "/a/zip/file.rs", ""]) {
      expect(looksLikeArchive(p), p).toBe(false);
    }
  });
});

describe("bothAreFolders", () => {
  it("vale solo se entrambi i percorsi sono cartelle (un archivio conta come cartella)", () => {
    expect(bothAreFolders(["dir", "dir"])).toBe(true);
    expect(bothAreFolders(["dir", "file"])).toBe(false);
    expect(bothAreFolders(["file", "file"])).toBe(false);
    expect(bothAreFolders(["dir", "missing"])).toBe(false);
    expect(bothAreFolders(null)).toBe(false);
    expect(bothAreFolders(["dir"])).toBe(false);
  });
});
