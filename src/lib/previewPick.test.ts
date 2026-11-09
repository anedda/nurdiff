import { describe, expect, it } from "vitest";
import { pairKind } from "./previewPick";

describe("pairKind", () => {
  it("due file o due cartelle si confrontano", () => {
    expect(pairKind("file", "file")).toBe("file");
    expect(pairKind("dir", "dir")).toBe("dir");
  });
  it("un lato mancante, tipi diversi o collegamenti no", () => {
    expect(pairKind("file", null)).toBeNull();
    expect(pairKind(null, "dir")).toBeNull();
    expect(pairKind("file", "dir")).toBeNull();
    expect(pairKind("symlink", "symlink")).toBeNull();
  });
});
