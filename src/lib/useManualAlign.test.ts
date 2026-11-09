import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import type { ContextItem } from "../components/ContextMenu";
import type { Cell, Row, Side } from "../types";
import { act, renderHook, stubWindow } from "../test/renderHook";
import type { LineEdit } from "./useLineEditing";
import { alignMenuItems, useManualAlign, type PendingAlign } from "./useManualAlign";

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key);
const cell = (number: number): Cell => ({ number, text: "x", marks: [] }) as Cell;
const row = (extra: Partial<Row> = {}): Row => ({ kind: "changed", left: cell(3), right: cell(7), gap: false, aligned: false, ...extra }) as Row;
const noop = () => {};
const handlers = { onAlignWith: noop, onMark: noop, onUnmark: noop, onRemoveOne: noop, onRemoveAll: noop };
const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("alignMenuItems", () => {
  it("senza riga segnata c'è solo «segna»", () => {
    const items = alignMenuItems({ t, side: "left", row: row(), pending: null, alignCount: 0, ...handlers });
    expect(labels(items)).toEqual(['fd.menu.mark {"n":3,"side":"fd.side.left"}']);
  });

  it("con una riga segnata dall'altro lato si può affiancare, e togliere il segno", () => {
    const items = alignMenuItems({ t, side: "right", row: row(), pending: { side: "left", number: 3 }, alignCount: 0, ...handlers });
    expect(labels(items)).toEqual([
      'fd.menu.align {"n":3,"side":"fd.side.left"}',
      'fd.menu.mark {"n":7,"side":"fd.side.right"}',
      "fd.menu.unmark",
    ]);
  });

  it("segnata dallo stesso lato: non c'è «affianca»", () => {
    const items = alignMenuItems({ t, side: "left", row: row(), pending: { side: "left", number: 1 }, alignCount: 0, ...handlers });
    expect(labels(items)).toEqual(['fd.menu.mark {"n":3,"side":"fd.side.left"}', "fd.menu.unmark"]);
  });

  it("una riga vuota è disattivata; i comandi di rimozione dipendono dall'allineamento", () => {
    const empty = alignMenuItems({ t, side: "right", row: row({ right: null }), pending: null, alignCount: 2, ...handlers });
    expect(empty[0]).toMatchObject({ label: "fd.menu.noRow", disabled: true });
    expect(empty[1]).toMatchObject({ label: 'fd.menu.removeAll {"n":2}', separator: true });
    const aligned = alignMenuItems({ t, side: "left", row: row({ aligned: true }), pending: null, alignCount: 1, ...handlers });
    expect(labels(aligned).slice(-2)).toEqual(["fd.menu.removeOne", 'fd.menu.removeAll {"n":1}']);
    expect(aligned[aligned.length - 2]).toMatchObject({ separator: true });
    expect(aligned[aligned.length - 1].separator).toBe(false);
  });
});

// --- The hook: choose, place side by side, Esc ---

interface Opts {
  rows?: (Row | undefined)[];
  busy?: boolean;
  alignOk?: boolean;
  active?: boolean;
  extra?: ContextItem[];
}

function setupHook(o: Opts = {}) {
  const log: string[] = [];
  const rows = o.rows ?? [row()];
  const state: { items: ContextItem[]; note: boolean[] } = { items: [], note: [] };
  const h = renderHook(() => {
    const [pendingAlign, setPendingAlign] = useState<PendingAlign | null>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; items: ContextItem[] } | null>(null);
    if (menu) state.items = menu.items;
    const editingRef = useRef<LineEdit | null>(null);
    const api = useManualAlign({
      t,
      active: o.active ?? true,
      busy: o.busy ?? false,
      editingRef,
      rowAt: (i) => rows[i],
      selectRow: (side: Side, r: number, reveal?: boolean) => void log.push(`select:${side}:${r}:${reveal ?? false}`),
      pendingAlign,
      setPendingAlign,
      menu,
      setMenu,
      setAlignNote: (v) => void state.note.push(v),
      alignCount: 2,
      onAlign: async (l, r) => {
        log.push(`align:${l}:${r}`);
        return o.alignOk ?? true;
      },
      onUnalign: async (l) => {
        log.push(`unalign:${l}`);
        return true;
      },
      onClearAligns: async () => {
        log.push("clear");
        return true;
      },
      onLocate: async () => 12,
      centerRow: (r) => void log.push(`center:${r}`),
      extraItems: o.extra ? () => o.extra! : undefined,
    });
    return { pendingAlign, menu, setMenu, editingRef, ...api };
  }, undefined);
  const pick = (prefix: string) => state.items.find((i) => i.label.startsWith(prefix))!;
  return { h, log, state, pick };
}

describe("useManualAlign (hook)", () => {
  let win: ReturnType<typeof stubWindow>;
  beforeEach(() => {
    win = stubWindow();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("il clic destro sceglie la riga e apre il menu nel punto del clic", () => {
    const { h, log } = setupHook();
    act(() => h.current.openMenu("left", 0, 10, 20));
    expect(log).toEqual(["select:left:0:false"]);
    expect(h.current.menu).toMatchObject({ x: 10, y: 20 });
    expect(h.current.menu!.items.length).toBeGreaterThan(1);
  });

  it("le voci in più (per esempio «Copia») stanno in testa, separate da quelle dell'allineamento", () => {
    const { h } = setupHook({ extra: [{ label: "Copia", onSelect: () => {} }] });
    act(() => h.current.openMenu("left", 0, 0, 0));
    const items = h.current.menu!.items;
    expect(items[0].label).toBe("Copia");
    expect(items[1].label.startsWith("fd.menu.mark")).toBe(true);
    expect(items[1].separator).toBe(true);
  });

  it("con del testo selezionato (voci in più) il clic destro non sposta la riga selezionata", () => {
    const withText = setupHook({ extra: [{ label: "Copia", onSelect: () => {} }] });
    act(() => withText.h.current.openMenu("left", 0, 0, 0));
    expect(withText.log).toEqual([]);
    const without = setupHook({ extra: [] });
    act(() => without.h.current.openMenu("left", 0, 0, 0));
    expect(without.log).toEqual(["select:left:0:false"]);
  });

  it("senza voci in più il menu è quello di prima", () => {
    const { h } = setupHook({ extra: [] });
    act(() => h.current.openMenu("left", 0, 0, 0));
    expect(h.current.menu!.items[0].label.startsWith("fd.menu.mark")).toBe(true);
    expect(h.current.menu!.items[0].separator).toBeFalsy();
  });

  it("non apre il menu se occupato o con la riga non ancora arrivata", () => {
    for (const o of [{ busy: true }, { rows: [] }]) {
      const { h, log } = setupHook(o);
      act(() => h.current.openMenu("left", 0, 1, 1));
      expect(h.current.menu).toBeNull();
      expect(log).toEqual([]);
    }
  });

  it("non apre il menu mentre si modifica una riga", () => {
    const { h, log } = setupHook();
    h.current.editingRef.current = { text: "x" } as LineEdit;
    act(() => h.current.openMenu("left", 0, 1, 1));
    expect(h.current.menu).toBeNull();
    expect(log).toEqual([]);
  });

  it("segna una riga, poi sull'altro lato affianca: i numeri vanno a sinistra e a destra giusti", async () => {
    const { h, log, state, pick } = setupHook({ rows: [row(), row({ left: cell(8), right: cell(9) })] });
    act(() => h.current.openMenu("left", 0, 0, 0)); // row 3 on the left
    act(() => void pick("fd.menu.mark").onSelect!());
    expect(h.current.pendingAlign).toEqual({ side: "left", number: 3 });
    act(() => h.current.openMenu("right", 1, 0, 0)); // row 9 on the right
    await act(async () => void pick("fd.menu.align").onSelect!());
    expect(log).toContain("align:3:9");
    expect(h.current.pendingAlign).toBeNull();
    expect(state.note).toEqual([false]);
    expect(log.slice(-2)).toEqual(["select:left:12:true", "center:12"]); // brings the aligned row into view
  });

  it("segnata a destra e poi la sinistra: l'ordine resta (sinistra, destra)", async () => {
    const { h, log, pick } = setupHook({ rows: [row({ left: cell(4), right: cell(6) })] });
    act(() => h.current.openMenu("right", 0, 0, 0));
    act(() => void pick("fd.menu.mark").onSelect!());
    act(() => h.current.openMenu("left", 0, 0, 0));
    await act(async () => void pick("fd.menu.align").onSelect!());
    expect(log).toContain("align:4:6");
  });

  it("un allineamento rifiutato non cambia la vista", async () => {
    const { h, log, pick } = setupHook({ alignOk: false });
    act(() => h.current.openMenu("left", 0, 0, 0));
    act(() => void pick("fd.menu.mark").onSelect!());
    act(() => h.current.openMenu("right", 0, 0, 0));
    await act(async () => void pick("fd.menu.align").onSelect!());
    expect(log.some((l) => l.startsWith("center"))).toBe(false);
  });

  it("rimuovere un allineamento o tutti chiama il comando", async () => {
    const { h, log, pick } = setupHook({ rows: [row({ aligned: true })] });
    act(() => h.current.openMenu("left", 0, 0, 0));
    await act(async () => void pick("fd.menu.removeOne").onSelect!());
    await act(async () => void pick("fd.menu.removeAll").onSelect!());
    expect(log).toContain("unalign:3");
    expect(log).toContain("clear");
  });

  describe("Esc", () => {
    function marked(o: Opts = {}) {
      const s = setupHook(o);
      act(() => s.h.current.openMenu("left", 0, 0, 0));
      act(() => void s.pick("fd.menu.mark").onSelect!());
      return s;
    }

    it("toglie la riga segnata quando il menu è chiuso", () => {
      const { h } = marked();
      act(() => h.current.setMenu(null));
      win.press("Escape");
      expect(h.current.pendingAlign).toBeNull();
    });

    it("con il menu aperto non tocca il segno (Esc chiude il menu)", () => {
      const { h } = marked();
      win.press("Escape");
      expect(h.current.pendingAlign).not.toBeNull();
    });

    it("mentre si modifica una riga non tocca il segno", () => {
      const { h } = marked();
      act(() => h.current.setMenu(null));
      h.current.editingRef.current = { text: "x" } as LineEdit;
      win.press("Escape");
      expect(h.current.pendingAlign).not.toBeNull();
    });

    it("un tab in secondo piano non risponde", () => {
      const { h } = marked({ active: false });
      act(() => h.current.setMenu(null));
      win.press("Escape");
      expect(h.current.pendingAlign).not.toBeNull();
    });
  });
});
