import { backupConfig, configPath, inTauri, loadConfig, saveConfig, type ConfigFile } from "../api";

export type { ConfigFile };

/** Where each file lived before `~/.nurdiff`: the browser storage of the window (it is also what is used outside the app). */
const LEGACY_KEY: Record<ConfigFile, string> = { settings: "nurdiff.settings", recents: "nurdiff.recents", state: "nurdiff.sidebar" };
const FILES = Object.keys(LEGACY_KEY) as ConfigFile[];

/** Most that the start waits for the files: without them the window would stay empty. */
const START_TIMEOUT_MS = 3000;

const cache = new Map<ConfigFile, string>();
let folder: string | null = null;

/** Files that must not be written: their content is not known (read late, or not readable and not kept as a copy). */
const protectedFiles = new Set<ConfigFile>();

/** The problems with the files, one for each, as the errors came (to be described). The first one is shown. */
const problems = new Map<ConfigFile, unknown>();
const listeners = new Set<(problem: unknown) => void>();

function setProblem(file: ConfigFile, problem: unknown): void {
  const before = configProblem();
  if (problem === null) problems.delete(file);
  else problems.set(file, problem);
  const shown = configProblem();
  if (shown !== before) listeners.forEach((listener) => listener(shown)); // only when what is shown changes
}

/** The problem to show (an error as it came from the core, or from here), or null. */
export function configProblem(): unknown {
  return problems.size === 0 ? null : [...problems.values()][0];
}

/** Calls `listener` when the problem appears, changes or is gone; it returns the way to stop. */
export function onConfigProblem(listener: (problem: unknown) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The folder of the files, if the app knows it (not outside Tauri). */
export function configFolder(): string | null {
  return folder;
}

function legacy(file: ConfigFile): string | null {
  try {
    return localStorage.getItem(LEGACY_KEY[file]);
  } catch {
    return null;
  }
}

/** Is it JSON? A file that is not (cut by hand, a crash of a program) is kept as `.bak` and replaced. */
function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** The error shown when a file is not written to protect its content (it was not read, or read too late). */
function protectedError(file: ConfigFile) {
  return { code: "err.config.protected", params: { file: `${file}.json` } };
}

/** Reads one file at the start; an error is a problem to show, and the settings of the window are used instead. */
async function start(file: ConfigFile): Promise<void> {
  let text: string | null;
  try {
    text = await loadConfig(file);
  } catch (e) {
    setProblem(file, e);
    // Unreadable (not UTF-8, permissions): a copy is kept before the next saving replaces it; without a copy it is not written.
    const kept = await backupConfig(file).then(
      () => true,
      () => false,
    );
    if (!kept) protectedFiles.add(file);
    const old = legacy(file);
    if (old !== null) cache.set(file, old);
    return;
  }
  if (text !== null && !isJson(text)) {
    await backupConfig(file).catch((e) => {
      setProblem(file, e);
      protectedFiles.add(file);
    });
    return; // the defaults: the next saving replaces the file
  }
  if (text !== null) {
    cache.set(file, text);
    return;
  }
  // First time with the file: what the window had saved before is brought here, and the old copy goes away.
  const old = legacy(file);
  if (old === null) {
    // Nothing anywhere: there is no content to lose, so it can be written (also if it came late).
    protectedFiles.delete(file);
    setProblem(file, null);
    return;
  }
  cache.set(file, old);
  try {
    await saveConfig(file, old);
    localStorage.removeItem(LEGACY_KEY[file]);
  } catch (e) {
    setProblem(file, e);
  }
}

/**
 * Loads the files before the interface is drawn, so the settings are there from the first frame (the theme, the
 * language). Inside the app they are `~/.nurdiff/*.json`; outside, the browser storage. A file that cannot be
 * read gives the default values and a problem to show, never a window that does not open.
 *
 * If a file arrives after the wait, the interface already started from the defaults: that file is not written
 * until the next start (its content would be replaced by the defaults and the changes made in the meantime).
 */
export async function initConfigStore(): Promise<void> {
  if (!inTauri) {
    for (const file of FILES) {
      const text = legacy(file);
      if (text !== null) cache.set(file, text);
    }
    return;
  }
  const settled = new Set<ConfigFile>();
  const reads = FILES.map((file) => start(file).finally(() => settled.add(file)));
  const folderRead = configPath().then(
    (p) => (folder = p),
    () => null,
  );
  let timedOut = false;
  const late = new Promise<void>((resolve) =>
    setTimeout(() => {
      timedOut = true;
      resolve();
    }, START_TIMEOUT_MS),
  );
  await Promise.race([Promise.all([...reads, folderRead]).then(() => undefined), late]);
  if (!timedOut) return;
  // What did not arrive in time is protected: when it does, its content (if any) must not be replaced by what the interface kept.
  for (const file of FILES.filter((f) => !settled.has(f))) {
    protectedFiles.add(file);
    setProblem(file, protectedError(file));
  }
}

/** The text of a file as it is now (what was loaded at the start, or saved since), or null. */
export function readStored(file: ConfigFile): string | null {
  return cache.get(file) ?? null;
}

const writing = new Map<ConfigFile, { busy: boolean; next: string | null }>();

/** One write at a time for each file, the last text wins: no waiting, and never in the wrong order. */
function persist(file: ConfigFile, text: string): void {
  let state = writing.get(file);
  if (!state) writing.set(file, (state = { busy: false, next: null }));
  if (state.busy) {
    state.next = text;
    return;
  }
  state.busy = true;
  const current = state;
  saveConfig(file, text)
    .then(() => setProblem(file, null))
    .catch((e) => setProblem(file, e))
    .finally(() => {
      current.busy = false;
      const next = current.next;
      current.next = null;
      if (next !== null) persist(file, next);
    });
}

/** Keeps a file: at once in memory (reading it again gives it back), and then on disk. */
export function writeStored(file: ConfigFile, text: string): void {
  cache.set(file, text);
  if (!inTauri) {
    try {
      localStorage.setItem(LEGACY_KEY[file], text);
    } catch {
      /* no storage (private window, blocked data): it only lasts for this session */
    }
    return;
  }
  if (protectedFiles.has(file)) {
    setProblem(file, protectedError(file));
    return;
  }
  persist(file, text);
}

/** For the tests: forgets everything. */
export function resetConfigStore(): void {
  cache.clear();
  writing.clear();
  protectedFiles.clear();
  problems.clear();
  folder = null;
  listeners.clear();
}
