import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import type { Hunk } from "./hunks";
import type { MergeDirection, OpenedDiff, Side } from "../types";
import { act, renderHook, stubWindow } from "../test/renderHook";
import type { EditEnd } from "./useLineEditing";
import { typingInField, useHunkNavigation } from "./useHunkNavigation";

const hunk = (start: number, end: number): Hunk => ({ start, end, kind: "changed", leftAt: 0, rightAt: 0 }) as Hunk;
const diffOf = (extra: Partial<OpenedDiff> = {}): OpenedDiff =>
  ({
    id: 1,
    revision: 0,
    leftDirty: false,
    rightDirty: false,
    canUndo: false,
    leftReadOnly: false,
    rightReadOnly: false,
    totalRows: 100,
    hunks: [hunk(10, 12), hunk(40, 41), hunk(80, 83)],
    aligns: [],
    ...extra,
  }) as OpenedDiff;

interface Props {
  diff: OpenedDiff;
  busy?: boolean;
  active?: boolean;
}

/** The fake operations: they record the calls and answer as the test says. */
function setup(props: Props, answers: { merge?: boolean; undo?: boolean; save?: boolean } = {}) {
  const calls: string[] = [];
  const alignNote: boolean[] = [];
  const scroller = { scrollTop: 0, clientHeight: 400 };
  const refs: { pendingSelect: { current: number | null }; merged: { current: number[] }; saveAfter: { current: boolean }; editing: { current: unknown } } = {
    pendingSelect: { current: null },
    merged: { current: [] },
    saveAfter: { current: false },
    editing: { current: null },
  };
  const endEdit = vi.fn(async (_how: EditEnd) => {});
  const h = renderHook((p: Props) => {
    const [current, setCurrent] = useState(-1);
    const rightRef = useRef(scroller as unknown as HTMLDivElement);
    const endEditRef = useRef(endEdit);
    const nav = useHunkNavigation({
      diff: p.diff,
      vHunks: p.diff.hunks,
      vTotal: p.diff.totalRows,
      rowHeight: 20,
      busy: p.busy ?? false,
      active: p.active ?? true,
      rightRef,
      current,
      setCurrent,
      pendingSelect: refs.pendingSelect,
      merged: refs.merged,
      saveAfter: refs.saveAfter,
      editingRef: refs.editing as never,
      endEditRef,
      setAlignNote: (v) => alignNote.push(v),
      onMerge: async (i: number, d: MergeDirection) => {
        calls.push(`merge:${i}:${d}`);
        return answers.merge ?? true;
      },
      onUndo: async () => {
        calls.push("undo");
        return answers.undo ?? true;
      },
      onSave: async (side: Side) => {
        calls.push(`save:${side}`);
        return answers.save ?? true;
      },
    });
    return { nav, current };
  }, props);
  return { h, calls, alignNote, scroller, refs, endEdit };
}

let win: ReturnType<typeof stubWindow>;
beforeEach(() => {
  win = stubWindow();
});
afterEach(() => vi.unstubAllGlobals());

describe("useHunkNavigation", () => {
  it("goTo sceglie il blocco e porta la riga a centro finestra", () => {
    const { h, scroller } = setup({ diff: diffOf() });
    act(() => h.current.nav.goTo(1));
    expect(h.current.current).toBe(1);
    expect(scroller.scrollTop).toBe(40 * 20 - (400 - 20) / 2); // 610
  });

  it("step va al blocco seguente o precedente, con giro completo", () => {
    const { h } = setup({ diff: diffOf() });
    act(() => h.current.nav.step(1));
    expect(h.current.current).toBe(0);
    act(() => h.current.nav.step(-1));
    expect(h.current.current).toBe(2); // from 0 backwards: the last one
  });

  it("merge: niente senza blocco scelto o con il lato di arrivo in sola lettura", async () => {
    const a = setup({ diff: diffOf() });
    await act(async () => a.h.current.nav.merge("leftToRight"));
    expect(a.calls).toEqual([]);
    const b = setup({ diff: diffOf({ rightReadOnly: true }) });
    act(() => b.h.current.nav.goTo(0));
    await act(async () => b.h.current.nav.merge("leftToRight"));
    expect(b.calls).toEqual([]);
    await act(async () => b.h.current.nav.merge("rightToLeft")); // the other direction is allowed
    expect(b.calls).toEqual(["merge:0:rightToLeft"]);
  });

  it("merge riuscita: ricorda il blocco, avvisa se c'erano allineamenti", async () => {
    const { h, calls, alignNote, refs } = setup({ diff: diffOf({ aligns: [[1, 2]] }) });
    act(() => h.current.nav.goTo(1));
    await act(async () => h.current.nav.merge("leftToRight"));
    expect(calls).toEqual(["merge:1:leftToRight"]);
    expect(refs.merged.current).toEqual([1]);
    expect(refs.pendingSelect.current).toBe(1);
    expect(alignNote).toEqual([true]);
  });

  it("merge fallita: nessuna selezione da fare e niente in cronologia", async () => {
    const { h, refs, alignNote } = setup({ diff: diffOf() }, { merge: false });
    act(() => h.current.nav.goTo(0));
    await act(async () => h.current.nav.merge("leftToRight"));
    expect(refs.pendingSelect.current).toBeNull();
    expect(refs.merged.current).toEqual([]);
    expect(alignNote).toEqual([]);
  });

  it("la cronologia ricorda al massimo 100 operazioni", async () => {
    const { h, refs } = setup({ diff: diffOf() });
    act(() => h.current.nav.goTo(0));
    for (let i = 0; i < 105; i++) await act(async () => void (await h.current.nav.tracked(i, async () => true)));
    expect(refs.merged.current).toHaveLength(100);
    expect(refs.merged.current[0]).toBe(5);
  });

  it("undo: riseleziona l'ultimo blocco toccato e lo toglie dalla cronologia", async () => {
    const { h, refs, calls } = setup({ diff: diffOf({ canUndo: true }) });
    refs.merged.current = [2, 0];
    await act(async () => h.current.nav.undo());
    expect(calls).toEqual(["undo"]);
    expect(refs.pendingSelect.current).toBe(0);
    expect(refs.merged.current).toEqual([2]);
  });

  it("undo senza cronologia (o fallito) non lascia selezioni in sospeso", async () => {
    const a = setup({ diff: diffOf({ canUndo: true }) });
    await act(async () => a.h.current.nav.undo());
    expect(a.refs.pendingSelect.current).toBe(-1); // none to reselect
    const b = setup({ diff: diffOf({ canUndo: true }) }, { undo: false });
    b.refs.merged.current = [1];
    await act(async () => b.h.current.nav.undo());
    expect(b.refs.pendingSelect.current).toBeNull();
    expect(b.refs.merged.current).toEqual([1]);
    const c = setup({ diff: diffOf({ canUndo: false }) });
    await act(async () => c.h.current.nav.undo());
    expect(c.calls).toEqual([]);
  });

  it("saveAll salva i lati modificati e scrivibili, nell'ordine, e si ferma al primo errore", async () => {
    const a = setup({ diff: diffOf({ leftDirty: true, rightDirty: true }) });
    await act(async () => a.h.current.nav.saveAll());
    expect(a.calls).toEqual(["save:left", "save:right"]);
    const b = setup({ diff: diffOf({ leftDirty: true, rightDirty: true, rightReadOnly: true }) });
    await act(async () => b.h.current.nav.saveAll());
    expect(b.calls).toEqual(["save:left"]);
    const c = setup({ diff: diffOf({ leftDirty: true, rightDirty: true }) }, { save: false });
    await act(async () => c.h.current.nav.saveAll());
    expect(c.calls).toEqual(["save:left"]);
  });

  it("arrivato il risultato di un'unione, la selezione passa al blocco che ne prende il posto", async () => {
    const { h, refs } = setup({ diff: diffOf() });
    act(() => h.current.nav.goTo(2));
    refs.pendingSelect.current = 2; // as after a merge on a block
    h.rerender({ diff: diffOf({ revision: 1, hunks: [hunk(10, 12), hunk(40, 41)] }) }); // two remain
    expect(h.current.current).toBe(1); // min(2, 2 - 1)
    expect(refs.pendingSelect.current).toBeNull();
  });

  it("se non restano blocchi, o l'indice è -1, non c'è nessuna selezione", () => {
    const a = setup({ diff: diffOf() });
    act(() => a.h.current.nav.goTo(0));
    a.refs.pendingSelect.current = 0;
    a.h.rerender({ diff: diffOf({ revision: 1, hunks: [] }) });
    expect(a.h.current.current).toBe(-1);
    const b = setup({ diff: diffOf() });
    act(() => b.h.current.nav.goTo(1));
    b.refs.pendingSelect.current = -1; // a row edit
    b.h.rerender({ diff: diffOf({ revision: 1 }) });
    expect(b.h.current.current).toBe(-1);
  });

  it("senza richieste in sospeso un nuovo risultato non cambia il blocco", () => {
    const { h } = setup({ diff: diffOf() });
    act(() => h.current.nav.goTo(1));
    h.rerender({ diff: diffOf({ revision: 1 }) });
    expect(h.current.current).toBe(1);
  });

  it("Ctrl+S durante la modifica conferma la riga e, col nuovo risultato, salva", async () => {
    const { h, calls, refs, endEdit } = setup({ diff: diffOf({ leftDirty: true }) });
    refs.editing.current = { text: "x" };
    const e = win.press("s", { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(endEdit).toHaveBeenCalledWith("confirm");
    expect(refs.saveAfter.current).toBe(true);
    refs.editing.current = null;
    await act(async () => h.rerender({ diff: diffOf({ revision: 1, leftDirty: true }) }));
    expect(calls).toEqual(["save:left"]);
    expect(refs.saveAfter.current).toBe(false);
  });

  it("le scorciatoie: Alt+frecce e Alt+Home/Fine navigano, Alt+→ e Alt+← uniscono", async () => {
    const { h, calls } = setup({ diff: diffOf() });
    win.press("ArrowDown", { altKey: true });
    expect(h.current.current).toBe(0);
    win.press("End", { altKey: true });
    expect(h.current.current).toBe(2);
    win.press("Home", { altKey: true });
    expect(h.current.current).toBe(0);
    await act(async () => void win.press("ArrowRight", { altKey: true }));
    await act(async () => void win.press("ArrowLeft", { altKey: true }));
    expect(calls).toEqual(["merge:0:leftToRight", "merge:0:rightToLeft"]);
  });

  it("Ctrl+S salva e Ctrl+Z annulla, ma non in un campo di testo; con il tab in secondo piano nulla", async () => {
    const { calls } = setup({ diff: diffOf({ leftDirty: true, canUndo: true }) });
    await act(async () => void win.press("s", { ctrlKey: true }));
    expect(calls).toEqual(["save:left"]);
    await act(async () => void win.press("z", { ctrlKey: true }));
    expect(calls).toEqual(["save:left", "undo"]);
    const InputClass = (globalThis as { HTMLInputElement: new () => object }).HTMLInputElement;
    const field = Object.assign(new Event("keydown", { cancelable: true }), { key: "z", ctrlKey: true, altKey: false, metaKey: false, shiftKey: false });
    Object.defineProperty(field, "target", { value: new InputClass() });
    await act(async () => void (window as unknown as EventTarget).dispatchEvent(field));
    expect(calls).toEqual(["save:left", "undo"]); // Ctrl+Z in the field does not undo the merges
    const idle = setup({ diff: diffOf({ leftDirty: true }) }, {});
    idle.h.rerender({ diff: diffOf({ leftDirty: true }), active: false });
    await act(async () => void win.press("s", { ctrlKey: true }));
    expect(idle.calls).toEqual([]); // the background tab does not respond (the active one above does)
  });

  it("typingInField riconosce i campi di testo", () => {
    const Input = (globalThis as { HTMLInputElement: new () => object }).HTMLInputElement;
    expect(typingInField(new Input() as EventTarget)).toBe(true);
    expect(typingInField({} as EventTarget)).toBe(false);
    expect(typingInField(null)).toBe(false);
  });
});
