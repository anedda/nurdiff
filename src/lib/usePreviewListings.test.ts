import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirListing } from "../types";
import { act, renderHook } from "../test/renderHook";
import { EMPTY_EXT_FILTER } from "./extFilter";

/** A fake disk: path → entries. */
const disk: Record<string, DirListing[]> = {};
const reads: string[] = [];
const dir = (name: string): DirListing => ({ name, kind: "dir", size: 0, modified: null });
const file = (name: string): DirListing => ({ name, kind: "file", size: 1, modified: null });
vi.mock("../api", () => ({
  listDirectory: (path: string) => {
    reads.push(path);
    return path in disk ? Promise.resolve(disk[path]) : Promise.reject("non esiste");
  },
}));

const { usePreviewListings } = await import("./usePreviewListings");

beforeEach(() => {
  for (const k of Object.keys(disk)) delete disk[k];
  reads.length = 0;
  disk["/l"] = [dir("sub"), file("a.txt")];
  disk["/r"] = [dir("sub"), file("b.txt")];
  disk["/l/sub"] = [file("x.txt")];
  disk["/r/sub"] = [file("y.txt")];
});

const mount = async (left = "/l", right = "/r") => {
  const h = renderHook(({ left, right }) => usePreviewListings(left, right, EMPTY_EXT_FILTER), { left, right });
  await act(async () => {});
  return h;
};
const names = (rows: { rel: string }[]) => rows.map((r) => r.rel);

describe("usePreviewListings", () => {
  it("legge le due cartelle scelte e ne affianca le voci per nome", async () => {
    const h = await mount();
    expect(reads.sort()).toEqual(["/l", "/r"]);
    expect(names(h.current.rows)).toEqual(["sub", "a.txt", "b.txt"]); // folders first, then files
  });

  it("aprire una cartella legge i suoi due lati; chiuderla non rilegge", async () => {
    const h = await mount();
    await act(async () => h.current.toggle(h.current.rows[0]));
    await act(async () => {});
    expect(reads.filter((p) => p.endsWith("/sub")).sort()).toEqual(["/l/sub", "/r/sub"]);
    expect(names(h.current.rows)).toEqual(["sub", "sub/x.txt", "sub/y.txt", "a.txt", "b.txt"]);
    const before = reads.length;
    await act(async () => h.current.toggle(h.current.rows[0]));
    await act(async () => h.current.toggle(h.current.rows[0]));
    await act(async () => {});
    expect(reads.length).toBe(before); // already read
  });

  it("la barra laterale ha le sue cartelle aperte, a parte, e le letture sono condivise", async () => {
    const h = await mount();
    await act(async () => h.current.toggleSide("sub"));
    await act(async () => {});
    expect(names(h.current.sideRows)).toEqual(["sub", "sub/x.txt", "sub/y.txt", "a.txt", "b.txt"]);
    expect(names(h.current.rows)).toEqual(["sub", "a.txt", "b.txt"]); // the preview does not open
    // opening it in the preview too reads nothing again
    const before = reads.length;
    await act(async () => h.current.toggle(h.current.rows[0]));
    await act(async () => {});
    expect(reads.length).toBe(before);
  });

  it("openPath apre una cartella e quelle che la contengono (la mappa entra in una cartella)", async () => {
    disk["/l/sub/deep"] = [file("z.txt")];
    disk["/r/sub/deep"] = [file("w.txt")];
    disk["/l/sub"] = [dir("deep")];
    disk["/r/sub"] = [dir("deep")];
    const h = await mount();
    await act(async () => h.current.openPath("sub/deep"));
    await act(async () => {});
    expect(names(h.current.rows)).toEqual(["sub", "sub/deep", "sub/deep/w.txt", "sub/deep/z.txt", "a.txt", "b.txt"]);
    expect(reads.filter((p) => p.includes("/sub")).sort()).toEqual(["/l/sub", "/l/sub/deep", "/r/sub", "/r/sub/deep"]);
  });

  it("toggleSide ignora ciò che non è una cartella", async () => {
    const h = await mount();
    await act(async () => h.current.toggleSide("a.txt"));
    expect(names(h.current.sideRows)).toEqual(["sub", "a.txt", "b.txt"]);
  });

  it("scambiando i lati si riusa ciò che è già stato letto", async () => {
    const h = await mount();
    await act(async () => h.current.toggle(h.current.rows[0]));
    await act(async () => {});
    const before = reads.length;
    h.rerender({ left: "/r", right: "/l" });
    await act(async () => {});
    expect(reads.length).toBe(before);
    expect(names(h.current.rows)).toEqual(["sub", "sub/x.txt", "sub/y.txt", "a.txt", "b.txt"]);
    const a = h.current.rows.find((r) => r.rel === "a.txt")!;
    expect(a.pair.left).toBeNull(); // a.txt was on the left: now, with the sides swapped, it is on the right
    expect(a.pair.right?.name).toBe("a.txt");
  });

  it("con altre cartelle si riparte da zero (e si chiudono le aperte)", async () => {
    disk["/n"] = [file("solo.txt")];
    const h = await mount();
    await act(async () => h.current.toggle(h.current.rows[0]));
    await act(async () => {});
    h.rerender({ left: "/n", right: "/r" });
    await act(async () => {});
    expect(names(h.current.rows)).toEqual(["sub", "b.txt", "solo.txt"]);
  });

  it("reload rilegge le cartelle e tiene le aperture", async () => {
    const h = await mount();
    await act(async () => h.current.toggle(h.current.rows[0]));
    await act(async () => {});
    const before = reads.length;
    disk["/l/sub"] = [file("nuovo.txt")];
    await act(async () => h.current.reload());
    await act(async () => {});
    expect(reads.length).toBeGreaterThan(before);
    expect(names(h.current.rows)).toContain("sub/nuovo.txt");
  });

  it("una cartella illeggibile segna la riga come fallita", async () => {
    delete disk["/r/sub"];
    const h = await mount();
    await act(async () => h.current.toggle(h.current.rows[0]));
    await act(async () => {});
    expect(h.current.rows[0].failed).toBe(true);
  });

  it("Expand apre le cartelle a gruppi, Collapse le chiude", async () => {
    disk["/l/sub"] = [dir("deep"), file("x.txt")];
    disk["/r/sub"] = [dir("deep")];
    disk["/l/sub/deep"] = [file("d.txt")];
    disk["/r/sub/deep"] = [file("d.txt")];
    const h = await mount();
    await act(async () => h.current.expandAll());
    for (let i = 0; i < 5; i++) await act(async () => {});
    expect(names(h.current.rows)).toContain("sub/deep/d.txt");
    expect(h.current.autoExpand).toBe(0);
    await act(async () => h.current.collapseAll());
    expect(names(h.current.rows)).toEqual(["sub", "a.txt", "b.txt"]);
  });
});
