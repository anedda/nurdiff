import { describe, expect, it } from "vitest";
import { formatDate, formatSize } from "./format";

describe("formatSize", () => {
  it("gestisce assenza e byte", () => {
    expect(formatSize(null)).toBe("");
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("converte nelle unità successive", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(10 * 1024)).toBe("10 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatSize(3 * 1024 ** 3)).toBe("3.0 GB");
  });

  it("si ferma ai TB", () => {
    expect(formatSize(2048 * 1024 ** 4)).toBe("2048 TB");
  });
});

describe("formatDate", () => {
  it("data e ora locali, con gli zeri", () => {
    expect(formatDate(new Date(2026, 9, 16, 14, 5).getTime())).toBe("2026-10-16 14:05");
    expect(formatDate(new Date(2026, 0, 3, 0, 0).getTime())).toBe("2026-01-03 00:00");
  });
  it("senza data niente", () => {
    expect(formatDate(null)).toBe("");
  });
});
