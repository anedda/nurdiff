import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchHit } from "../types";
import { act, renderHook, stubWindow } from "../test/renderHook";

let answer: (side: string, text: string, caseSensitive: boolean) => { hits: SearchHit[]; truncated: boolean } | null;
const asked: { id: number; side: string; text: string; caseSensitive: boolean }[] = [];
const channels: string[] = [];
const cancelled: string[] = [];
vi.mock("../api", () => ({
  searchRows: (id: number, side: string, text: string, caseSensitive: boolean, channel: string) => {
    asked.push({ id, side, text, caseSensitive });
    channels.push(channel);
    try {
      return Promise.resolve(answer(side, text, caseSensitive));
    } catch (e) {
      return Promise.reject(e);
    }
  },
  cancelSearch: (channel: string) => {
    cancelled.push(channel);
    return Promise.resolve();
  },
}));

const { useFileSearch, firstFrom } = await import("./useFileSearch");

const hit = (row: number, start = 0): SearchHit => ({ row, start, end: start + 1 });
const HITS = [hit(2), hit(5, 3), hit(5, 9), hit(40)];

beforeEach(() => {
  vi.useFakeTimers();
  asked.length = 0;
  channels.length = 0;
  cancelled.length = 0;
  answer = () => ({ hits: HITS, truncated: false });
});
afterEach(() => vi.useRealTimers());

function setup(extra: Partial<{ enabled: boolean; startRow: number; revision: number; blocked: boolean }> = {}) {
  const onError = vi.fn();
  const win = stubWindow();
  const h = renderHook(
    (p: { revision: number; startRow: number; enabled: boolean }) =>
      useFileSearch({
        diffId: 1,
        revision: p.revision,
        enabled: p.enabled,
        blocked: () => extra.blocked ?? false,
        defaultSide: () => "right",
        startRow: () => p.startRow,
        onError,
      }),
    { revision: extra.revision ?? 1, startRow: extra.startRow ?? 0, enabled: extra.enabled ?? true },
  );
  return { h, win, onError };
}

/** Types the text and waits for the debounce and the answer. */
async function type(h: ReturnType<typeof setup>["h"], text: string) {
  act(() => h.current.setQuery(text));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
}

describe("firstFrom", () => {
  it("la prima corrispondenza dalla riga indicata; se non ce ne sono dopo, ricomincia dalla prima", () => {
    expect(firstFrom(HITS, 0)).toBe(0);
    expect(firstFrom(HITS, 3)).toBe(1);
    expect(firstFrom(HITS, 5, 4)).toBe(2);
    expect(firstFrom(HITS, 41)).toBe(0);
    expect(firstFrom([], 3)).toBe(0);
  });
});

describe("useFileSearch", () => {
  it("chiusa non cerca; aperta, cerca dopo una pausa e sceglie la prima corrispondenza dalla riga di partenza", async () => {
    const { h } = setup({ startRow: 3 });
    await type(h, "ab");
    expect(asked).toEqual([]); // the bar is closed
    act(() => h.current.show());
    expect(h.current.side).toBe("right"); // the pane the user was in
    await type(h, "ab");
    expect(asked).toEqual([{ id: 1, side: "right", text: "ab", caseSensitive: false }]);
    expect(h.current.hits).toHaveLength(4);
    expect(h.current.current).toBe(1); // first at or after row 3
    expect(h.current.currentHit).toEqual(hit(5, 3));
  });

  it("senza fermarsi a ogni lettera: una richiesta sola per la parola scritta di seguito", async () => {
    const { h } = setup();
    act(() => h.current.show());
    act(() => h.current.setQuery("a"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    act(() => h.current.setQuery("ab"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(asked.map((a) => a.text)).toEqual(["ab"]);
  });

  it("successiva e precedente girano in tondo e chiedono di mostrare la corrispondenza ogni volta", async () => {
    const { h } = setup();
    act(() => h.current.show());
    await type(h, "x");
    expect(h.current.current).toBe(0);
    const reveals = h.current.revealCount;
    act(() => h.current.prev());
    expect(h.current.current).toBe(3);
    act(() => h.current.next());
    expect(h.current.current).toBe(0);
    act(() => h.current.next());
    expect(h.current.current).toBe(1);
    expect(h.current.revealCount).toBe(reveals + 3);
  });

  it("senza corrispondenze non si muove e non ce n'è una corrente", async () => {
    answer = () => ({ hits: [], truncated: false });
    const { h } = setup();
    act(() => h.current.show());
    await type(h, "zzz");
    expect(h.current.current).toBe(-1);
    expect(h.current.currentHit).toBeNull();
    act(() => h.current.next());
    expect(h.current.current).toBe(-1);
  });

  it("cambiare lato o maiuscole cerca di nuovo; il testo vuoto toglie tutto", async () => {
    const { h } = setup();
    act(() => h.current.show());
    await type(h, "x");
    act(() => h.current.setSide("left"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    act(() => h.current.setCaseSensitive(true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(asked.map((a) => [a.side, a.caseSensitive])).toEqual([["right", false], ["left", false], ["left", true]]);
    await type(h, "");
    expect(h.current.hits).toEqual([]);
    expect(h.current.current).toBe(-1);
  });

  it("dopo una modifica del file (nuova revisione) resta sulla corrispondenza più vicina a quella di prima", async () => {
    const { h } = setup();
    act(() => h.current.show());
    await type(h, "x");
    act(() => h.current.next());
    act(() => h.current.next()); // on (5, 9)
    expect(h.current.currentHit).toEqual(hit(5, 9));
    const reveals = h.current.revealCount;
    answer = () => ({ hits: [hit(1), hit(5, 9), hit(7)], truncated: false });
    h.rerender({ revision: 2, startRow: 0, enabled: true });
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(h.current.currentHit).toEqual(hit(5, 9));
    // a merge or an edit refreshes the matches, but does not take the view away from where the user is working
    expect(h.current.revealCount).toBe(reveals);
  });

  it("mentre aspetta la risposta le corrispondenze vecchie non si mostrano (altro lato, altre righe) e si dice che sta cercando", async () => {
    const { h } = setup();
    act(() => h.current.show());
    expect(h.current.searching).toBe(false); // nothing typed
    act(() => h.current.setQuery("x"));
    expect(h.current.searching).toBe(true); // asked, not answered: it is not "no results"
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(h.current.searching).toBe(false);
    expect(h.current.hits).toHaveLength(4);
    act(() => h.current.setSide("left"));
    expect(h.current.hits).toEqual([]); // the right side's offsets would land on other text
    expect(h.current.currentHit).toBeNull();
    expect(h.current.searching).toBe(true);
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(h.current.hits).toHaveLength(4);
    h.rerender({ revision: 2, startRow: 0, enabled: true });
    expect(h.current.hits).toEqual([]); // new rows: the old offsets are not valid until the new answer
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(h.current.hits).toHaveLength(4);
  });

  it("next e prev non fanno niente finché non c'è la risposta giusta", async () => {
    const { h } = setup();
    act(() => h.current.show());
    await type(h, "x");
    act(() => h.current.setSide("left"));
    const reveals = h.current.revealCount;
    act(() => h.current.next());
    expect(h.current.revealCount).toBe(reveals);
  });

  it("Ctrl+F apre la barra, F3 e Maiusc+F3 si muovono, chiudendo i segni spariscono", async () => {
    const { h, win } = setup();
    expect(h.current.open).toBe(false);
    act(() => void win.press("f", { ctrlKey: true }));
    expect(h.current.open).toBe(true);
    await type(h, "x");
    act(() => void win.press("F3"));
    expect(h.current.current).toBe(1);
    act(() => void win.press("F3", { shiftKey: true }));
    expect(h.current.current).toBe(0);
    act(() => h.current.close());
    expect(h.current.hits).toEqual([]);
    expect(h.current.currentHit).toBeNull();
  });

  it("non risponde ai tasti con una riga in modifica o a tab non attivo, e un errore si segnala", async () => {
    const blocked = setup({ blocked: true });
    act(() => void blocked.win.press("f", { ctrlKey: true }));
    expect(blocked.h.current.open).toBe(false);
    const off = setup({ enabled: false });
    act(() => void off.win.press("f", { ctrlKey: true }));
    expect(off.h.current.open).toBe(false);

    answer = () => {
      throw new Error("no");
    };
    const { h, onError } = setup();
    act(() => h.current.show());
    await act(async () => {
      h.current.setQuery("x");
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("ogni ricerca usa il canale del suo tab; un'altra barra ha il suo, così non si fermano a vicenda", async () => {
    const a = setup();
    const b = setup();
    act(() => a.h.current.show());
    act(() => b.h.current.show());
    await type(a.h, "x");
    await type(b.h, "x");
    await type(a.h, "xy");
    expect(channels).toHaveLength(3);
    expect(channels[0]).toMatch(/^search\d+$/);
    expect(channels[2]).toBe(channels[0]); // the same bar: the core stops the old search of that channel
    expect(channels[1]).not.toBe(channels[0]);
  });

  it("svuotando il testo o chiudendo la barra si ferma la ricerca ancora in corso", async () => {
    const { h } = setup();
    act(() => h.current.show());
    await type(h, "x");
    const channel = channels[0];
    cancelled.length = 0;
    await type(h, ""); // emptied: what runs is of no use
    expect(cancelled).toContain(channel);
    await type(h, "y");
    cancelled.length = 0;
    act(() => h.current.close());
    expect(cancelled).toContain(channel);
  });

  it("uscendo dalla vista (il tab si chiude) la ricerca ancora in corso si ferma", async () => {
    const { h } = setup();
    act(() => h.current.show());
    await type(h, "x");
    cancelled.length = 0;
    h.unmount();
    expect(cancelled).toEqual([channels[0]]);
  });

  it("una risposta «fermata» dal core non lascia la barra in attesa e non sposta la vista", async () => {
    const { h } = setup();
    act(() => h.current.show());
    answer = () => null; // another search of the channel replaced this one
    await type(h, "x");
    expect(h.current.searching).toBe(false);
    expect(h.current.hits).toEqual([]);
    expect(h.current.current).toBe(-1);
    expect(h.current.revealCount).toBe(0);
  });
});
