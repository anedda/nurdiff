import { describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import type { Row, Side } from "../types";
import type { Hunk } from "./hunks";
import { act, renderHook } from "../test/renderHook";
import { useLineEditing, type LineEdit } from "./useLineEditing";

const cell = (number: number, text: string) => ({ number, text, marks: [] });
const rowOf = (l: ReturnType<typeof cell> | null, r: ReturnType<typeof cell> | null): Row =>
  ({ kind: "changed", left: l, right: r, gap: false, aligned: false }) as Row;
const hunk = (start: number, end: number, leftAt: number, rightAt: number): Hunk => ({ start, end, kind: "changed", leftAt, rightAt }) as Hunk;

interface Opts {
  rows?: (Row | undefined)[];
  hunks?: Hunk[];
  busy?: boolean;
  readOnly?: { left: boolean; right: boolean };
  locate?: number | null;
  runOk?: boolean;
}

function setup(o: Opts = {}) {
  const edits: string[] = [];
  const revealed: number[] = [];
  const rows = o.rows ?? [rowOf(cell(1, "uno"), cell(1, "UNO")), rowOf(cell(2, "due"), null)];
  const h = renderHook(() => {
    const [editing, setEditing] = useState<LineEdit | null>(null);
    const editingRef = useRef<LineEdit | null>(null);
    editingRef.current = editing;
    const api = useLineEditing({
      setEditing,
      editingRef,
      busy: o.busy ?? false,
      readOnly: o.readOnly ?? { left: false, right: false },
      hunks: o.hunks ?? [hunk(0, 2, 0, 0)],
      rowAt: (i) => rows[i],
      runEdit: async (side: Side, at: number, remove: number, lines: string[]) => {
        edits.push(`${side}:${at}:${remove}:${JSON.stringify(lines)}`);
        return o.runOk ?? true;
      },
      onLocate: async () => (o.locate === undefined ? 5 : o.locate),
      revealRow: (row) => revealed.push(row),
    });
    return { editing, editingRef, setEditing, ...api };
  }, undefined);
  return { h, edits, revealed };
}

describe("useLineEditing: aprire la modifica", () => {
  it("su una riga con testo: si modifica quella riga", () => {
    const { h } = setup();
    act(() => h.current.startEdit("left", 0));
    expect(h.current.editing).toEqual({ side: "left", row: 0, at: 0, insert: false, text: "uno", original: "uno" });
  });

  it("su una riga vuota: si inserisce dopo l'ultima riga che il lato aveva prima", () => {
    const rows = [rowOf(cell(1, "a"), cell(1, "a")), rowOf(cell(2, "b"), null), rowOf(cell(3, "c"), null)];
    const { h } = setup({ rows, hunks: [hunk(0, 3, 0, 0)] });
    act(() => h.current.startEdit("right", 2));
    // on the right, before row 2 there is row 0 (number 1): it is inserted after it, that is at index 1
    expect(h.current.editing).toMatchObject({ side: "right", row: 2, at: 1, insert: true, text: "" });
  });

  it("senza righe prima nel blocco, usa il punto del blocco", () => {
    const rows = [rowOf(cell(1, "x"), null)];
    const { h } = setup({ rows, hunks: [hunk(0, 1, 0, 7)] });
    act(() => h.current.startEdit("right", 0));
    expect(h.current.editing).toMatchObject({ insert: true, at: 7 });
  });

  it("non apre se occupato, in sola lettura, riga non arrivata, o se ce n'è già una in modifica", () => {
    const busy = setup({ busy: true });
    act(() => busy.h.current.startEdit("left", 0));
    expect(busy.h.current.editing).toBeNull();
    const ro = setup({ readOnly: { left: true, right: false } });
    act(() => ro.h.current.startEdit("left", 0));
    expect(ro.h.current.editing).toBeNull();
    const missing = setup({ rows: [] });
    act(() => missing.h.current.startEdit("left", 0));
    expect(missing.h.current.editing).toBeNull();
    const { h } = setup();
    act(() => h.current.startEdit("left", 0));
    act(() => h.current.startEdit("right", 0));
    expect(h.current.editing!.side).toBe("left");
  });

  it("una riga vuota di cui non si sa il punto (riga non ancora arrivata) non si apre", () => {
    const rows = [undefined, rowOf(cell(2, "b"), null)];
    const { h } = setup({ rows, hunks: [hunk(0, 2, 0, 0)] });
    act(() => h.current.startEdit("right", 1));
    expect(h.current.editing).toBeNull();
  });
});

describe("useLineEditing: chiudere la modifica", () => {
  const edit = async (h: ReturnType<typeof setup>["h"], text: string) => {
    act(() => h.current.setEditing({ ...h.current.editing!, text }));
  };

  it("conferma: sostituisce la riga solo se il testo è cambiato", async () => {
    const a = setup();
    act(() => a.h.current.startEdit("left", 0));
    await act(async () => a.h.current.endEdit("confirm"));
    expect(a.edits).toEqual([]);
    const b = setup();
    act(() => b.h.current.startEdit("left", 0));
    await edit(b.h, "UNO!");
    await act(async () => b.h.current.endEdit("confirm"));
    expect(b.edits).toEqual(['left:0:1:["UNO!"]']);
    expect(b.h.current.editing).toBeNull();
  });

  it("una riga nuova vuota non inserisce nulla; con testo inserisce", async () => {
    const rows = [rowOf(cell(1, "x"), null)];
    const a = setup({ rows, hunks: [hunk(0, 1, 0, 0)] });
    act(() => a.h.current.startEdit("right", 0));
    await act(async () => a.h.current.endEdit("confirm"));
    expect(a.edits).toEqual([]);
    const b = setup({ rows, hunks: [hunk(0, 1, 0, 0)] });
    act(() => b.h.current.startEdit("right", 0));
    await edit(b.h, "nuova");
    await act(async () => b.h.current.endEdit("confirm"));
    expect(b.edits).toEqual(['right:0:0:["nuova"]']);
  });

  it("annulla non cambia nulla; elimina toglie la riga (ma non una riga nuova)", async () => {
    const a = setup();
    act(() => a.h.current.startEdit("left", 0));
    await edit(a.h, "diverso");
    await act(async () => a.h.current.endEdit("cancel"));
    expect(a.edits).toEqual([]);
    const b = setup();
    act(() => b.h.current.startEdit("left", 0));
    await act(async () => b.h.current.endEdit("delete"));
    expect(b.edits).toEqual(["left:0:1:[]"]);
    const rows = [rowOf(cell(1, "x"), null)];
    const c = setup({ rows, hunks: [hunk(0, 1, 0, 0)] });
    act(() => c.h.current.startEdit("right", 0));
    await act(async () => c.h.current.endEdit("delete"));
    expect(c.edits).toEqual([]);
  });

  it("«next» conferma e apre la riga sotto, portandola in vista", async () => {
    const { h, edits, revealed } = setup({ locate: 6 });
    act(() => h.current.startEdit("left", 0));
    await edit(h, "uno");
    await act(async () => h.current.endEdit("next"));
    expect(edits).toEqual(['left:0:1:["uno",""]']);
    expect(h.current.editing).toEqual({ side: "left", row: 6, at: 1, insert: false, text: "", original: "" });
    expect(revealed).toEqual([6]);
  });

  it("«next» con la modifica fallita non apre nulla", async () => {
    const { h, revealed } = setup({ runOk: false });
    act(() => h.current.startEdit("left", 0));
    await act(async () => h.current.endEdit("next"));
    expect(h.current.editing).toBeNull();
    expect(revealed).toEqual([]);
  });

  it("senza modifica aperta non fa nulla, e due chiusure insieme ne eseguono una sola", async () => {
    const none = setup();
    await act(async () => none.h.current.endEdit("confirm"));
    expect(none.edits).toEqual([]);
    const { h, edits } = setup();
    act(() => h.current.startEdit("left", 0));
    await edit(h, "nuovo testo");
    const spy = vi.fn();
    await act(async () => {
      const first = h.current.endEdit("confirm");
      const second = h.current.endEdit("confirm"); // focus lost after Enter
      await Promise.all([first, second]);
      spy();
    });
    expect(edits).toHaveLength(1);
  });
});

describe("useLineEditing: inserire ed eliminare dal menu della riga", () => {
  it("«sotto» inserisce una riga vuota dopo quella della riga e la apre per scrivere", async () => {
    const { h, edits, revealed } = setup();
    await act(async () => void (await h.current.insertLine("left", 0, "below")));
    // the row 0 shows the line 1 of the left side: the new line goes to the index 1
    expect(edits).toEqual(['left:1:0:[""]']);
    expect(h.current.editing).toEqual({ side: "left", row: 5, at: 1, insert: false, text: "", original: "" });
    expect(revealed).toEqual([5]);
  });

  it("«sopra» la inserisce prima di quella della riga", async () => {
    const { h, edits } = setup();
    await act(async () => void (await h.current.insertLine("left", 1, "above")));
    expect(edits).toEqual(['left:1:0:[""]']);
    expect(h.current.editing?.at).toBe(1);
  });

  it("elimina la riga della riga mostrata", async () => {
    const { h, edits } = setup();
    await act(async () => void (await h.current.deleteLine("left", 1)));
    expect(edits).toEqual(["left:1:1:[]"]);
  });

  it("non fa nulla su un lato in sola lettura, occupato, senza riga o se la modifica non riesce", async () => {
    for (const o of [{ readOnly: { left: true, right: false } }, { busy: true }, { runOk: false }]) {
      const { h, edits } = setup(o);
      await act(async () => void (await h.current.insertLine("left", 0, "below")));
      await act(async () => void (await h.current.deleteLine("left", 0)));
      expect(h.current.editing).toBeNull();
      if (o.runOk === false) expect(edits).toHaveLength(2);
      else expect(edits).toEqual([]);
    }
    const { h, edits } = setup();
    await act(async () => void (await h.current.insertLine("right", 1, "below"))); // the right side has no line at the row 1
    expect(edits).toEqual([]);
  });
});
