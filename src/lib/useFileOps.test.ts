import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { OpenedDiff } from "../types";
import { act, renderHook } from "../test/renderHook";
import { DEFAULT_SETTINGS } from "./settings";

const log: string[] = [];
const opened = (revision: number, extra: Partial<OpenedDiff> = {}): OpenedDiff =>
  ({ id: 7, revision, leftReadOnly: false, rightReadOnly: false, aligns: [], ...extra }) as OpenedDiff;
vi.mock("../api", () => {
  const next = (name: string) => (...args: unknown[]) => {
    log.push(`${name}(${args.join(",")})`);
    return Promise.resolve(opened(log.length));
  };
  return {
    mergeHunk: next("merge"),
    mergeRow: next("mergeRow"),
    editLines: next("edit"),
    undoMerge: next("undo"),
    alignLines: next("align"),
    unalignLines: next("unalign"),
    clearAligns: next("clearAligns"),
    saveSide: next("save"),
    setRowFilter: next("filter"),
    locateLine: (id: number, _side: string, n: number) => (n < 0 ? Promise.reject("no") : Promise.resolve(n * 10 + id)),
  };
});

const { useFileOps, useFileOptions } = await import("./useFileOps");

beforeEach(() => {
  log.length = 0;
});

interface Setup {
  runWith: ReturnType<typeof vi.fn>;
  setLeft: ReturnType<typeof vi.fn>;
  setRight: ReturnType<typeof vi.fn>;
  restartView: ReturnType<typeof vi.fn>;
}

function setup(initial: OpenedDiff | null, opts: { runOk?: boolean; exclusiveFails?: boolean } = {}) {
  const fns: Setup = {
    runWith: vi.fn(async () => opts.runOk ?? true),
    setLeft: vi.fn(),
    setRight: vi.fn(),
    restartView: vi.fn(),
  };
  const h = renderHook(
    (fd: OpenedDiff | null) => {
      const [fileDiff, setFileDiff] = useState<OpenedDiff | null>(fd);
      const options = useFileOptions(DEFAULT_SETTINGS);
      const ops = useFileOps({
        fileDiff,
        setFileDiff,
        compared: { left: "/l.txt", right: "/r.txt" },
        exclusive: async (work) => (opts.exclusiveFails ? undefined : work()),
        runWith: fns.runWith as never,
        options,
        setLeft: fns.setLeft as never,
        setRight: fns.setRight as never,
        restartView: fns.restartView as never,
      });
      return { fileDiff, options, ops };
    },
    initial,
  );
  return { h, ...fns };
}

describe("useFileOps: operazioni sul confronto", () => {
  it("ogni operazione chiama il suo comando con l'id e mostra il nuovo stato", async () => {
    const { h } = setup(opened(0));
    await act(async () => void (await h.current.ops.merge(2, "leftToRight")));
    await act(async () => void (await h.current.ops.mergeOneRow(5, "rightToLeft")));
    await act(async () => void (await h.current.ops.edit("right", 3, 1, ["x"])));
    await act(async () => void (await h.current.ops.undo()));
    await act(async () => void (await h.current.ops.align(4, 5)));
    await act(async () => void (await h.current.ops.unalign(4)));
    await act(async () => void (await h.current.ops.removeAligns()));
    await act(async () => void (await h.current.ops.save("left")));
    expect(log).toEqual([
      "merge(7,2,leftToRight)",
      "mergeRow(7,5,rightToLeft)",
      "edit(7,right,3,1,x)",
      "undo(7)",
      "align(7,4,5)",
      "unalign(7,4)",
      "clearAligns(7)",
      "save(7,left)",
    ]);
    expect(h.current.fileDiff!.revision).toBe(8); // the last state returned
  });

  it("senza confronto aperto, o se l'operazione non parte, restituisce falso e non cambia nulla", async () => {
    const none = setup(null);
    expect(await none.h.current.ops.merge(0, "leftToRight")).toBe(false);
    const failing = setup(opened(0), { exclusiveFails: true });
    let result = true;
    await act(async () => void (result = await failing.h.current.ops.merge(0, "leftToRight")));
    expect(result).toBe(false);
    expect(failing.h.current.fileDiff!.revision).toBe(0);
  });

  it("locate dà la riga della vista, o null se non si trova", async () => {
    const { h } = setup(opened(0));
    expect(await h.current.ops.locate("left", 3)).toBe(37);
    expect(await h.current.ops.locate("left", -1)).toBeNull();
    expect(await setup(null).h.current.ops.locate("left", 3)).toBeNull();
  });
});

describe("useFileOps: barra degli strumenti", () => {
  it("Swap rifà il confronto a lati scambiati (percorsi, sola lettura, allineamenti) e poi scambia i campi", async () => {
    const { h, runWith, setLeft, setRight } = setup(opened(0, { leftReadOnly: true, aligns: [[1, 5]] }));
    await act(async () => h.current.ops.swapFiles());
    expect(runWith).toHaveBeenCalledWith("files", "/r.txt", "/l.txt", {
      options: h.current.ops.fileOpts,
      readOnly: { left: false, right: true },
      aligns: [[5, 1]],
    });
    expect(setLeft).toHaveBeenCalledWith("/r.txt");
    expect(setRight).toHaveBeenCalledWith("/l.txt");
  });

  it("Swap fallito non tocca i campi", async () => {
    const { h, setLeft } = setup(opened(0), { runOk: false });
    await act(async () => h.current.ops.swapFiles());
    expect(setLeft).not.toHaveBeenCalled();
  });

  it("Refresh rifà il confronto sugli stessi file con gli stessi allineamenti", async () => {
    const { h, runWith } = setup(opened(0, { aligns: [[2, 3]] }));
    await act(async () => h.current.ops.refreshFiles());
    expect(runWith).toHaveBeenCalledWith("files", "/l.txt", "/r.txt", {
      options: h.current.ops.fileOpts,
      readOnly: { left: false, right: false },
      aligns: [[2, 3]],
    });
  });

  it("le opzioni cambiano solo se il confronto rifatto riesce", async () => {
    const ok = setup(opened(0));
    await act(async () => void (await ok.h.current.ops.toggleIgnoreCase()));
    expect(ok.h.current.options.ignoreCase).toBe(!DEFAULT_SETTINGS.ignoreCase);
    expect(ok.runWith.mock.calls[0][3].options.ignoreCase).toBe(!DEFAULT_SETTINGS.ignoreCase);
    const ko = setup(opened(0), { runOk: false });
    await act(async () => void (await ko.h.current.ops.toggleIgnoreCase()));
    expect(ko.h.current.options.ignoreCase).toBe(DEFAULT_SETTINGS.ignoreCase);
  });

  it("spazi e algoritmo: la stessa scelta non rifà il confronto, un'altra sì", async () => {
    const { h, runWith } = setup(opened(0));
    await act(async () => void (await h.current.ops.changeWhitespace(DEFAULT_SETTINGS.ignoreWhitespace)));
    await act(async () => void (await h.current.ops.changeAlgorithm(DEFAULT_SETTINGS.algorithm)));
    expect(runWith).not.toHaveBeenCalled();
    await act(async () => void (await h.current.ops.changeWhitespace("all")));
    expect(h.current.options.ignoreWhitespace).toBe("all");
    await act(async () => void (await h.current.ops.changeAlgorithm("patience")));
    expect(h.current.options.algorithm).toBe("patience");
    expect(runWith).toHaveBeenCalledTimes(2);
  });

  it("il filtro delle righe: applica, ricorda e fa ripartire la vista; lo stesso filtro non fa nulla", async () => {
    const { h, restartView } = setup(opened(0));
    await act(async () => void (await h.current.ops.changeFilter("all")));
    expect(log).toEqual([]);
    await act(async () => void (await h.current.ops.changeFilter("diffs")));
    expect(log).toEqual(["filter(7,diffs)"]);
    expect(h.current.options.rowFilter).toBe("diffs");
    expect(restartView).toHaveBeenCalledTimes(1);
  });
});
