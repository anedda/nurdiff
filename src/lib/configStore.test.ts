import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Api = {
  inTauri: boolean;
  loadConfig: ReturnType<typeof vi.fn>;
  saveConfig: ReturnType<typeof vi.fn>;
  backupConfig: ReturnType<typeof vi.fn>;
  configPath: ReturnType<typeof vi.fn>;
};

/** The browser storage of the window, in memory. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

/** A fresh copy of the store with its own fake `../api` (the store keeps state in the module). */
async function load(tauri: boolean, files: Record<string, string | null | object> = {}, storage = fakeStorage()) {
  vi.resetModules();
  const api: Api = {
    inTauri: tauri,
    loadConfig: vi.fn(async (file: string) => {
      const v = files[file] ?? null;
      if (v !== null && typeof v === "object") throw v; // an error of the core arrives as an object
      return v;
    }),
    saveConfig: vi.fn(async () => {}),
    backupConfig: vi.fn(async () => {}),
    configPath: vi.fn(async () => "/home/x/.nurdiff"),
  };
  vi.doMock("../api", () => api);
  vi.stubGlobal("localStorage", storage);
  const store = await import("./configStore");
  return { api, store, storage };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock("../api");
});

describe("dentro l'app: i file di ~/.nurdiff", () => {
  it("all'avvio legge i tre file e sa dov'è la cartella", async () => {
    const { store, api } = await load(true, { settings: '{"theme":"dark"}', recents: "[]", state: '{"open":true}' });
    await store.initConfigStore();
    expect(api.loadConfig.mock.calls.map((c) => c[0]).sort()).toEqual(["recents", "settings", "state"]);
    expect(store.readStored("settings")).toBe('{"theme":"dark"}');
    expect(store.readStored("state")).toBe('{"open":true}');
    expect(store.configFolder()).toBe("/home/x/.nurdiff");
    expect(store.configProblem()).toBeNull();
  });

  it("senza il file porta dentro ciò che la finestra aveva salvato e toglie la vecchia voce", async () => {
    const storage = fakeStorage({ "nurdiff.settings": '{"theme":"light"}', "nurdiff.sidebar": '{"open":false}' });
    const { store, api } = await load(true, {}, storage);
    await store.initConfigStore();
    expect(store.readStored("settings")).toBe('{"theme":"light"}');
    expect(store.readStored("state")).toBe('{"open":false}');
    expect(store.readStored("recents")).toBeNull();
    expect(api.saveConfig).toHaveBeenCalledWith("settings", '{"theme":"light"}');
    expect(api.saveConfig).toHaveBeenCalledWith("state", '{"open":false}');
    expect(api.saveConfig).toHaveBeenCalledTimes(2); // recents had nothing to bring
    expect(storage.data.has("nurdiff.settings") || storage.data.has("nurdiff.sidebar")).toBe(false);
  });

  it("se il file c'è, le vecchie voci della finestra non contano e non si toccano", async () => {
    const storage = fakeStorage({ "nurdiff.settings": '{"theme":"light"}' });
    const { store, api } = await load(true, { settings: '{"theme":"dark"}' }, storage);
    await store.initConfigStore();
    expect(store.readStored("settings")).toBe('{"theme":"dark"}');
    expect(api.saveConfig).not.toHaveBeenCalled();
    expect(storage.data.has("nurdiff.settings")).toBe(true);
  });

  it("un file che non è JSON si conserva come .bak e si usano i predefiniti", async () => {
    const { store, api } = await load(true, { settings: "{non json" });
    await store.initConfigStore();
    expect(api.backupConfig).toHaveBeenCalledWith("settings");
    expect(store.readStored("settings")).toBeNull();
  });

  it("un file che non si legge dà un problema da mostrare e, se c'è, la copia della finestra", async () => {
    const error = { code: "err.config.io", params: { path: "/x" } };
    const storage = fakeStorage({ "nurdiff.recents": "[1]" });
    const { store, api } = await load(true, { recents: error, settings: '{"a":1}' }, storage);
    const seen: unknown[] = [];
    store.onConfigProblem((p) => seen.push(p));
    await store.initConfigStore();
    expect(store.configProblem()).toEqual(error);
    expect(seen).toEqual([error]);
    expect(api.backupConfig).toHaveBeenCalledWith("recents"); // unreadable (not UTF-8, …): a copy before it is replaced
    expect(store.readStored("recents")).toBe("[1]");
    expect(store.readStored("settings")).toBe('{"a":1}'); // the others still load
  });

  it("scrivere aggiorna subito la memoria e salva il file", async () => {
    const { store, api } = await load(true);
    await store.initConfigStore();
    store.writeStored("settings", "{}");
    expect(store.readStored("settings")).toBe("{}");
    expect(api.saveConfig).toHaveBeenCalledWith("settings", "{}");
  });

  it("una scrittura alla volta per file, l'ultimo testo vince e l'ordine non si inverte", async () => {
    const { store, api } = await load(true);
    await store.initConfigStore();
    const release: (() => void)[] = [];
    api.saveConfig.mockImplementation(() => new Promise<void>((resolve) => release.push(resolve)));
    store.writeStored("state", "uno");
    store.writeStored("state", "due");
    store.writeStored("state", "tre"); // while the first is still being written
    expect(api.saveConfig.mock.calls).toEqual([["state", "uno"]]);
    release[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.saveConfig.mock.calls).toEqual([["state", "uno"], ["state", "tre"]]); // "due" was replaced
    release[1]();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.readStored("state")).toBe("tre");
  });

  it("i file sono indipendenti: scrivere uno non aspetta l'altro", async () => {
    const { store, api } = await load(true);
    await store.initConfigStore();
    api.saveConfig.mockImplementation(() => new Promise<void>(() => {}));
    store.writeStored("settings", "a");
    store.writeStored("recents", "b");
    expect(api.saveConfig.mock.calls).toEqual([["settings", "a"], ["recents", "b"]]);
  });

  it("una scrittura che fallisce è un problema; una che riesce poi lo toglie", async () => {
    const { store, api } = await load(true);
    await store.initConfigStore();
    api.saveConfig.mockRejectedValueOnce({ code: "err.config.io", params: {} });
    store.writeStored("settings", "{}");
    await vi.advanceTimersByTimeAsync(0);
    expect(store.configProblem()).toMatchObject({ code: "err.config.io" });
    store.writeStored("settings", '{"a":1}');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.configProblem()).toBeNull();
  });

  it("se i file non arrivano la finestra si apre lo stesso, dopo qualche secondo, e quei file non si scrivono", async () => {
    const { store, api } = await load(true);
    api.loadConfig.mockImplementation(() => new Promise(() => {}));
    let done = false;
    void store.initConfigStore().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(2000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(done).toBe(true);
    // the interface started from the defaults: writing now would replace the real file with them
    expect(store.configProblem()).toMatchObject({ code: "err.config.protected" });
    store.writeStored("settings", "{}");
    expect(api.saveConfig).not.toHaveBeenCalled();
    expect(store.readStored("settings")).toBe("{}"); // in memory it works
  });

  it("un file che arriva in ritardo resta protetto, se c'era del contenuto; se non c'era niente si può scrivere", async () => {
    const { store, api } = await load(true);
    const later: Record<string, (text: string | null) => void> = {};
    api.loadConfig.mockImplementation((file: string) => new Promise((resolve) => (later[file] = resolve)));
    void store.initConfigStore();
    await vi.advanceTimersByTimeAsync(3500);
    later.settings('{"theme":"dark"}'); // there was a file: it stays protected
    later.recents(null); // nothing there: no content to lose
    await vi.advanceTimersByTimeAsync(0);
    store.writeStored("settings", "{}");
    store.writeStored("recents", "[]");
    expect(api.saveConfig.mock.calls).toEqual([["recents", "[]"]]);
  });

  it("un file illeggibile di cui non si riesce a fare la copia non si sovrascrive", async () => {
    const { store, api } = await load(true, { settings: { code: "err.config.io", params: {} } });
    api.backupConfig.mockRejectedValue({ code: "err.config.io", params: {} });
    await store.initConfigStore();
    store.writeStored("settings", "{}");
    store.writeStored("state", "{}"); // the others are written
    expect(api.saveConfig.mock.calls).toEqual([["state", "{}"]]);
    expect(store.configProblem()).toMatchObject({ code: "err.config.protected" }); // it says why the settings are not saved
  });

  it("i problemi sono uno per file: un salvataggio riuscito di un altro non toglie quello di un file che non si scrive", async () => {
    const { store, api } = await load(true);
    await store.initConfigStore();
    api.saveConfig.mockImplementation(async (file: string) => {
      if (file === "settings") throw { code: "err.config.io", params: {} };
    });
    store.writeStored("settings", "{}");
    await vi.advanceTimersByTimeAsync(0);
    store.writeStored("state", "{}"); // this one works
    await vi.advanceTimersByTimeAsync(0);
    expect(store.configProblem()).toMatchObject({ code: "err.config.io" });
    api.saveConfig.mockImplementation(async () => {});
    store.writeStored("settings", '{"a":1}');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.configProblem()).toBeNull();
  });
});

describe("fuori dall'app: l'archivio del browser", () => {
  it("legge e scrive le vecchie voci e non chiama il core", async () => {
    const storage = fakeStorage({ "nurdiff.sidebar": '{"open":true}' });
    const { store, api } = await load(false, {}, storage);
    await store.initConfigStore();
    expect(store.readStored("state")).toBe('{"open":true}');
    store.writeStored("recents", "[2]");
    expect(storage.getItem("nurdiff.recents")).toBe("[2]");
    expect(store.readStored("recents")).toBe("[2]");
    expect(api.loadConfig).not.toHaveBeenCalled();
    expect(api.saveConfig).not.toHaveBeenCalled();
    expect(store.configFolder()).toBeNull();
  });
});
