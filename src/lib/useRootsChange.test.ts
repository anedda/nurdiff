import { describe, expect, it } from "vitest";
import { renderHook } from "../test/renderHook";
import { useRootsChange } from "./useRootsChange";

function setup(left: string, right: string) {
  const calls: string[] = [];
  const h = renderHook(
    ({ left, right }) => useRootsChange(left, right, () => calls.push("swapped"), () => calls.push("replaced")),
    { left, right },
  );
  return { calls, h };
}

describe("useRootsChange", () => {
  it("all'avvio le cartelle sono «sostituite» (si parte da zero)", () => {
    expect(setup("/a", "/b").calls).toEqual(["replaced"]);
  });

  it("scambiare i lati chiama onSwapped, cambiarne uno chiama onReplaced", () => {
    const { calls, h } = setup("/a", "/b");
    h.rerender({ left: "/b", right: "/a" });
    h.rerender({ left: "/c", right: "/a" });
    expect(calls).toEqual(["replaced", "swapped", "replaced"]);
  });

  it("senza cambiamenti non chiama nulla", () => {
    const { calls, h } = setup("/a", "/b");
    h.rerender({ left: "/a", right: "/b" });
    expect(calls).toEqual(["replaced"]);
  });
});
