import { describe, expect, it } from "vitest";
import { sizeKey } from "./sizeKeys";

const press = (key: string, extra: Partial<Parameters<typeof sizeKey>[0]> = {}) => sizeKey({ key, ctrlKey: true, metaKey: false, altKey: false, ...extra });

describe("sizeKey", () => {
  it("Ctrl più (anche «=», senza Maiusc) ingrandisce, Ctrl meno riduce, Ctrl zero ripristina", () => {
    expect(press("+")).toBe("bigger");
    expect(press("=")).toBe("bigger");
    expect(press("-")).toBe("smaller");
    expect(press("_")).toBe("smaller");
    expect(press("0")).toBe("reset");
  });

  it("anche con Cmd, e non senza Ctrl o Cmd né con Alt", () => {
    expect(press("+", { ctrlKey: false, metaKey: true })).toBe("bigger");
    expect(press("+", { ctrlKey: false })).toBeNull();
    expect(press("-", { altKey: true })).toBeNull();
  });

  it("gli altri tasti non c'entrano", () => {
    for (const key of ["a", "1", "Enter", "ArrowUp", "t"]) expect(press(key)).toBeNull();
  });
});
