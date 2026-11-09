import { describe, expect, it } from "vitest";
import { baseName, planDrop, sideAt } from "./drop";

const empty = { mode: "files" as const, left: "", right: "" };

describe("baseName", () => {
  it("prende l'ultimo elemento con / o \\", () => {
    expect(baseName("/home/u/a.txt")).toBe("a.txt");
    expect(baseName("C:\\Users\\u\\a.txt")).toBe("a.txt");
    expect(baseName("/home/u/cartella/")).toBe("cartella");
    expect(baseName("a.txt")).toBe("a.txt");
    expect(baseName("/")).toBe("/");
  });
});

describe("sideAt", () => {
  it("divide la finestra a metà", () => {
    expect(sideAt(0, 1000)).toBe("left");
    expect(sideAt(499, 1000)).toBe("left");
    expect(sideAt(500, 1000)).toBe("right");
    expect(sideAt(999, 1000)).toBe("right");
  });
});

describe("planDrop: due elementi", () => {
  it("due file riempiono i campi e si confronta", () => {
    expect(planDrop(["/a", "/b"], ["file", "file"], empty, "right")).toEqual({
      ok: true,
      mode: "files",
      left: "/a",
      right: "/b",
      compare: true,
    });
  });

  it("due cartelle passano alla modalità cartelle, anche con altro nei campi", () => {
    const plan = planDrop(["/x", "/y"], ["dir", "dir"], { mode: "files", left: "/a", right: "/b" }, "left");
    expect(plan).toEqual({ ok: true, mode: "dirs", left: "/x", right: "/y", compare: true });
  });

  it("un file e una cartella sono un errore", () => {
    const plan = planDrop(["/a", "/d"], ["file", "dir"], empty, null);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.message.key).toBe("drop.mixed");
  });
});

describe("planDrop: un solo elemento", () => {
  it("va nel campo del lato sotto il puntatore, senza toccare l'altro", () => {
    const current = { mode: "files" as const, left: "/vecchio-sx", right: "/vecchio-dx" };
    expect(planDrop(["/n"], ["file"], current, "left")).toEqual({
      ok: true,
      mode: "files",
      left: "/n",
      right: "/vecchio-dx",
      compare: false,
    });
    expect(planDrop(["/n"], ["file"], current, "right")).toMatchObject({
      left: "/vecchio-sx",
      right: "/n",
    });
  });

  it("senza lato noto sceglie il primo campo libero", () => {
    expect(planDrop(["/n"], ["file"], empty, null)).toMatchObject({ left: "/n", right: "" });
    expect(planDrop(["/n"], ["file"], { ...empty, left: "/a" }, null)).toMatchObject({
      left: "/a",
      right: "/n",
    });
    expect(planDrop(["/n"], ["file"], { ...empty, left: "/a", right: "/b" }, null)).toMatchObject({
      left: "/n",
      right: "/b",
    });
  });

  it("un tipo diverso dalla modalità attuale la cambia e svuota l'altro campo", () => {
    const current = { mode: "files" as const, left: "/a.txt", right: "/b.txt" };
    expect(planDrop(["/cartella"], ["dir"], current, "right")).toEqual({
      ok: true,
      mode: "dirs",
      left: "",
      right: "/cartella",
      compare: false,
    });
  });

  it("lo stesso tipo mantiene l'altro campo", () => {
    const current = { mode: "dirs" as const, left: "/c1", right: "" };
    expect(planDrop(["/c2"], ["dir"], current, "right")).toMatchObject({
      mode: "dirs",
      left: "/c1",
      right: "/c2",
    });
  });
});

describe("planDrop: errori", () => {
  it("nessun elemento", () => {
    expect(planDrop([], [], empty, null).ok).toBe(false);
  });

  it("più di due elementi", () => {
    const plan = planDrop(["/a", "/b", "/c"], ["file", "file", "file"], empty, null);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.message).toEqual({ key: "drop.tooMany", params: { count: 3 } });
  });

  it("percorsi inesistenti o di altro tipo nominano l'elemento", () => {
    const missing = planDrop(["/home/u/manca.txt"], ["missing"], empty, null);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.message).toEqual({ key: "drop.missing", params: { name: "manca.txt" } });
    const other = planDrop(["/dev/null"], ["other"], empty, null);
    if (!other.ok) expect(other.message.key).toBe("drop.other");
    expect(planDrop(["/a", "/b"], ["file", "missing"], empty, null).ok).toBe(false);
  });
});
