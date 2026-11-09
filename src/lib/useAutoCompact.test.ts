import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, stubResizeObserver } from "../test/renderHook";
import { isWrapped, useAutoCompact } from "./useAutoCompact";

/** A fake bar: the width and, for each child, at what height it is (`top`). */
function bar(width: number, tops: number[]) {
  const el = {
    width,
    children: tops.map((t) => ({ offsetTop: t })),
    getBoundingClientRect: () => ({ width: el.width }),
  };
  return el;
}

describe("isWrapped", () => {
  it("la barra è a capo se qualche figlio sta più in basso del primo (oltre 8 px)", () => {
    expect(isWrapped(bar(500, [0, 0, 0]) as unknown as HTMLElement)).toBe(false);
    expect(isWrapped(bar(500, [0, 4, 8]) as unknown as HTMLElement)).toBe(false); // tolerance
    expect(isWrapped(bar(500, [0, 0, 40]) as unknown as HTMLElement)).toBe(true);
  });

  it("con meno di due figli non può andare a capo", () => {
    expect(isWrapped(bar(500, [0]) as unknown as HTMLElement)).toBe(false);
    expect(isWrapped(bar(500, []) as unknown as HTMLElement)).toBe(false);
  });
});

describe("useAutoCompact", () => {
  let ro: ReturnType<typeof stubResizeObserver>;
  beforeEach(() => {
    ro = stubResizeObserver();
  });
  afterEach(() => vi.unstubAllGlobals());

  const mount = (el: ReturnType<typeof bar>, enabled = true) => {
    const ref = { current: el as unknown as HTMLElement };
    return renderHook((p: { enabled: boolean }) => useAutoCompact(ref, p.enabled), { enabled });
  };

  it("una barra che sta su una riga resta normale", () => {
    expect(mount(bar(900, [0, 0, 0])).current).toBe(false);
  });

  it("quando va a capo passa alla compatta e ricorda la larghezza", () => {
    const el = bar(800, [0, 0, 40]);
    const h = mount(el);
    expect(h.current).toBe(true);
  });

  it("torna alla normale solo oltre la larghezza ricordata più un margine", () => {
    const el = bar(800, [0, 0, 40]);
    const h = mount(el);
    expect(h.current).toBe(true);
    el.children = [{ offsetTop: 0 }, { offsetTop: 0 }]; // in the compact one it fits on one row
    el.width = 820; // within the margin (800 + 24): it does not oscillate
    ro.trigger();
    expect(h.current).toBe(true);
    el.width = 830;
    ro.trigger();
    expect(h.current).toBe(false);
  });

  it("disattivata (la compatta è già scelta) non fa nulla e non osserva", () => {
    const h = mount(bar(800, [0, 0, 40]), false);
    expect(h.current).toBe(false);
    expect(ro.count()).toBe(0);
  });

  it("smontando smette di osservare", () => {
    const h = mount(bar(900, [0, 0]));
    expect(ro.count()).toBe(1);
    h.unmount();
    expect(ro.count()).toBe(0);
  });
});
