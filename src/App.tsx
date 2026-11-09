import { I18nProvider } from "./i18n/context";
import { useCallback, useEffect, useRef, useState } from "react";
import { bothAreFolders, looksLikeArchive } from "./lib/archiveNames";
import { classifyPaths, confirmDiscard, guardWindowClose, inTauri, launchRequest, mergeRequest, showError, windowCommand } from "./api";
import { describeError } from "./i18n";
import Home from "./components/Home";
import { AboutDialog, ShortcutsDialog } from "./components/HelpDialogs";
import FilesPanel, { type FilesContext } from "./components/FilesPanel";
import Sidebar from "./components/Sidebar";
import OptionsDialog from "./components/OptionsDialog";
import ReportDialog from "./components/ReportDialog";
import TabBar from "./components/TabBar";
import TitleBar from "./components/TitleBar";
import { addRecent, loadRecents, removeRecent, saveRecents, type Recent } from "./lib/recents";
import { sidebarUnavailable } from "./lib/sidebar";
import { useAppSettings, useSidebarState } from "./lib/useAppSettings";
import { buildMenus } from "./lib/appMenus";
import ConfigProblem from "./components/ConfigProblem";
import { CommandRegistry, CommandsContext } from "./lib/commands";
import { nextCodeSize } from "./lib/settings";
import { sizeKey } from "./lib/sizeKeys";
import { discardMessage } from "./lib/closeGuard";
import { moveTab } from "./lib/tabDrag";
import { useTabDrag } from "./lib/useTabDrag";
import { SettingsContext } from "./settingsContext";
import type { Mode } from "./types";
import MergeView from "./components/MergeView";
import Workspace, { type WorkspaceInfo, type WorkspaceStart } from "./Workspace";

interface Tab {
  id: number;
  title: string;
  dirty: boolean;
  /** The Home is the first tab and cannot be closed. */
  home?: boolean;
  /** How it was opened and the last successful comparison: they are used to avoid opening the same one twice. */
  start?: WorkspaceStart;
  compared?: WorkspaceInfo["compared"];
  report?: WorkspaceInfo["report"];
  /** A file with conflict markers to resolve (`git mergetool`): the tab is not a comparison. */
  merge?: string;
  /** New tab with the type already chosen, but without paths. */
  mode?: Mode | null;
  /** For a file comparison opened from a folder comparison: the tab it started from. */
  origin?: number;
  /** The folder comparison shown by the tab, if any: the sidebar lists its files. */
  dir?: WorkspaceInfo["dir"];
  /** The folder preview of the tab, if any: the sidebar lists its content. */
  preview?: WorkspaceInfo["preview"];
}

const HOME_ID = 1;

/** Tab bar: the Home, then one tab per comparison, each with its own unsaved changes. */
export default function App() {
  const nextId = useRef(HOME_ID + 1);
  const [tabs, setTabs] = useState<Tab[]>([{ id: HOME_ID, title: "Home", dirty: false, home: true }]);
  const [activeId, setActiveId] = useState(HOME_ID);
  const [recents, setRecents] = useState<Recent[]>(loadRecents);

  const { settings, changeSettings, lang, tr, trRef } = useAppSettings();
  const { sidebar, changeSidebar, sidebarRef } = useSidebarState();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [navigate, setNavigate] = useState<{ tabId: number; id: number; left: string; right: string } | null>(null);
  const navigateId = useRef(0);
  const [previewToggle, setPreviewToggle] = useState<{ tabId: number; id: number; rel: string } | null>(null);
  const previewToggleId = useRef(0);
  const [dialog, setDialog] = useState<"options" | "report" | "shortcuts" | "about" | null>(null);

  const add = useCallback((start?: WorkspaceStart | { mode: Mode | null }) => {
    const id = nextId.current++;
    const full = start && "run" in start ? start : undefined;
    // A new file comparison opens the bar on its differences, also when it comes from a folder comparison (the list of
    // the files is one click away); what the user chooses afterwards in that tab stays.
    if (start?.mode === "files" && sidebarRef.current.view !== "diffs") {
      changeSidebar({ ...sidebarRef.current, view: "diffs" });
    }
    setTabs((t) => [
      ...t,
      {
        id,
        title: full ? "…" : "",
        dirty: false,
        start: full,
        mode: start?.mode ?? null,
        origin: full?.origin,
      },
    ]);
    setActiveId(id);
  }, [changeSidebar, sidebarRef]);

  // A comparison already open is brought to the foreground instead of opening it twice.
  const open = useCallback(
    (start: WorkspaceStart | { mode: Mode | null }) => {
      if ("run" in start && start.left && start.right) {
        const same = tabs.find((t) =>
          [t.compared, t.start].some(
            (c) => c && c.mode === start.mode && c.left === start.left && c.right === start.right,
          ),
        );
        if (same) {
          setActiveId(same.id);
          return;
        }
      }
      add(start);
    },
    [tabs, add],
  );

  const openDirs = useCallback(
    (left: string, right: string) => open({ mode: "dirs", left, right, run: true }),
    [open],
  );

  const openFiles = useCallback(
    (left: string, right: string, origin?: number) => {
      // Two archives are compared as folders: a tab of files would only say "it is an archive".
      if (looksLikeArchive(left) || looksLikeArchive(right)) {
        void classifyPaths([left, right])
          .catch(() => null)
          .then((kinds) =>
            open({ mode: bothAreFolders(kinds) ? "dirs" : "files", left, right, run: true, origin }),
          );
        return;
      }
      open({ mode: "files", left, right, run: true, origin });
    },
    [open],
  );

  const compared = useCallback((mode: Mode, left: string, right: string) => {
    setRecents((list) => {
      const next = addRecent(list, { mode, left, right, at: Date.now() });
      saveRecents(next);
      return next;
    });
  }, []);

  const dropRecent = useCallback((entry: Recent) => {
    setRecents((list) => {
      const next = removeRecent(list, entry);
      saveRecents(next);
      return next;
    });
  }, []);
  const clearRecents = useCallback(() => {
    setRecents([]);
    saveRecents([]);
  }, []);

  // Paths on the command line (git difftool, nurdiff-cli --gui): they open directly in a tab.
  const launched = useRef(false);
  useEffect(() => {
    if (!inTauri || launched.current) return;
    launched.current = true;
    (async () => {
      // `git mergetool` starts the app on a file with conflict markers: that is a tab of its own.
      // The command line could not be read (a path that is not UTF-8): there is no tab to show it in.
      const failed = (e: unknown) => void showError(describeError(e, trRef.current), trRef.current).catch(() => {});
      let file;
      try {
        file = await mergeRequest();
      } catch (e) {
        failed(e);
        return;
      }
      if (file) {
        const id = nextId.current++;
        setTabs((t) => [...t, { id, title: file.slice(Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")) + 1), dirty: false, merge: file }]);
        setActiveId(id);
        return;
      }
      let request;
      try {
        request = await launchRequest();
      } catch (e) {
        failed(e);
        return;
      }
      if (!request) return;
      const kinds = await classifyPaths([request.left, request.right]).catch(() => null);
      const mode: Mode = kinds && kinds[0] === "dir" && kinds[1] === "dir" ? "dirs" : "files";
      add({
        mode,
        left: request.left,
        right: request.right,
        run: true,
        readOnly: { left: request.leftReadOnly, right: request.rightReadOnly },
      });
    })();
  }, [add, trRef]);

  async function close(id: number) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab || tab.home) return;
    if (tab.dirty) {
      const ok = await confirmDiscard(
        tr("app.confirm.closeTab", { title: tab.title || tr("tab.new") }),
        tr,
      );
      if (!ok) return;
    }
    const index = tabs.findIndex((t) => t.id === id);
    const rest = tabs.filter((t) => t.id !== id);
    setTabs(rest);
    if (id === activeId) setActiveId(rest[Math.min(index, rest.length - 1)].id);
  }

  const setMergeInfo = useCallback((id: number, info: { title: string; dirty: boolean }) => {
    setTabs((t) =>
      t.some((x) => x.id === id && (x.title !== info.title || x.dirty !== info.dirty))
        ? t.map((x) => (x.id === id ? { ...x, ...info } : x))
        : t,
    );
  }, []);

  const setInfo = useCallback((id: number, info: WorkspaceInfo) => {
    // A tab has just compared two files for the first time: the bar shows the differences. Later comparisons in the
    // same tab (moving to another file from the list, swapping the sides) do not touch what the user chose.
    const cur = tabsRef.current.find((x) => x.id === id);
    if (cur && !cur.compared && info.compared?.mode === "files" && sidebarRef.current.view !== "diffs") {
      changeSidebar({ ...sidebarRef.current, view: "diffs" });
    }
    setTabs((t) =>
      t.map((x) =>
        x.id === id &&
        (x.title !== info.title ||
          x.dirty !== info.dirty ||
          x.compared !== info.compared ||
          x.report !== info.report ||
          x.dir !== info.dir ||
          x.preview !== info.preview)
          ? { ...x, ...info }
          : x,
      ),
    );
  }, [changeSidebar, sidebarRef]);

  // Ctrl+T: new tab; Ctrl+W: closes the foreground one; Ctrl+O / Ctrl+Shift+O: new comparison of files / folders.
  const closeRef = useRef<() => void>(() => {});
  /** The foreground tab is the Home (read by the keyboard handler, which is registered once). */
  const onHomeRef = useRef(true);
  closeRef.current = () => void close(activeId);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      // Ctrl+O: new comparison of files; Ctrl+Shift+O: of folders (they open a tab, as the Home cards and the File menu).
      if (key === "o") {
        e.preventDefault();
        add({ mode: e.shiftKey ? "dirs" : "files" });
        return;
      }
      if (e.shiftKey) return;
      if (key === "t") {
        e.preventDefault();
        add();
      } else if (key === "w") {
        e.preventDefault();
        closeRef.current();
      } else if (key === "b") {
        e.preventDefault();
        if (!sidebarUnavailable(onHomeRef.current, sidebarRef.current)) {
          changeSidebar({ ...sidebarRef.current, open: !sidebarRef.current.open });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [add, changeSidebar, sidebarRef]);

  // Ctrl +, Ctrl - and Ctrl 0: size of the text in the files (as in the View menu).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = sizeKey(e);
      if (!action) return;
      e.preventDefault();
      const current = settingsRef.current;
      changeSettings({ ...current, codeSize: nextCodeSize(current.codeSize, action) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeSettings]);

  const activeTab = tabs.find((t) => t.id === activeId);
  onHomeRef.current = !!activeTab?.home;

  // Sidebar, "Files" view: the list of files of the folder comparison of the foreground tab,
  // or of the one the foreground tab was opened from.
  const fileTab = activeTab?.compared?.mode === "files";
  let filesContext: FilesContext | null = null;
  // Before the comparison: the content read by the preview, of the tab itself or of the one the file comes from.
  let previewTabId = activeId;
  let filesPreview = activeTab?.dir ? null : (activeTab?.preview ?? null);
  let emptyReason = tr("app.files.empty.none");
  if (activeTab?.dir) {
    filesContext = activeTab.dir;
  } else if (activeTab && fileTab) {
    const origin = activeTab.origin === undefined ? undefined : tabs.find((t) => t.id === activeTab.origin);
    if (origin?.dir) filesContext = origin.dir;
    else if (origin?.preview) {
      filesPreview = origin.preview;
      previewTabId = origin.id;
    } else if (activeTab.origin === undefined)
      emptyReason = tr("app.files.empty.noOrigin");
    else if (!origin) emptyReason = tr("app.files.empty.closed");
    else emptyReason = tr("app.files.empty.preview");
  }
  // "File differences" only exists for a file comparison; elsewhere the bar shows the files without changing the saved choice.
  const diffsAvailable = fileTab;
  const sidebarView = diffsAvailable ? sidebar.view : "files";
  const togglePreviewFolder = (rel: string) =>
    setPreviewToggle({ tabId: previewTabId, id: ++previewToggleId.current, rel });
  const openFromSidebar = (left: string, right: string) => {
    if (fileTab) setNavigate({ tabId: activeId, id: ++navigateId.current, left, right });
    else openFiles(left, right, activeId);
  };

  // Closing the window, from wherever it comes (title bar button, Alt+F4,
  // window manager): if there are unsaved merges a confirmation is asked. NurDiff's own button
  // only asks for the closing, and the question is asked by this check.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Dragging of the tabs: see `useTabDrag`.
  const { barRef, drag, suppressClick, onTabPointerDown, registerTab } = useTabDrag({
    tabsRef,
    onActivate: setActiveId,
    onMove: (id, slot) => setTabs((t) => moveTab(t, id, slot)),
  });
  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    void guardWindowClose(async () => {
      const message = discardMessage(tabsRef.current.filter((t) => t.dirty).map((t) => t.title || trRef.current("tab.new")), trRef.current);
      return message === null || (await confirmDiscard(message, trRef.current));
    }).then((unlisten) => {
      if (gone) unlisten();
      else stop = unlisten;
    });
    return () => {
      gone = true;
      stop?.();
    };
  }, [trRef]);
  const closeWindow = () => void windowCommand("close");
  const [commands] = useState(() => new CommandRegistry());
  // Asked when the menus are drawn: what the foreground tab can do is read then, not at every change of the tab.
  const menus = () => buildMenus({
    t: tr,
    settings,
    sidebar,
    activeTab,
    commands: commands.current(),
    onNewTab: (mode) => add(mode ? { mode } : undefined),
    onCloseTab: () => void close(activeId),
    onSettings: changeSettings,
    onSidebar: changeSidebar,
    onDialog: setDialog,
  });

  return (
    <SettingsContext.Provider value={settings}>
    <CommandsContext.Provider value={commands}>
    <I18nProvider lang={lang}>
    <div className="shell">
      <TitleBar
        menus={menus}
        title={activeTab && !activeTab.home ? `${activeTab.title || tr("tab.new")} — NurDiff` : "NurDiff"}
        custom={inTauri && !settings.systemTitleBar}
        onCloseWindow={closeWindow}
      />
      <ConfigProblem />
      <TabBar
        tabs={tabs}
        activeId={activeId}
        sidebarOpen={sidebar.open}
        sidebarDisabled={sidebarUnavailable(!!activeTab?.home, sidebar)}
        onToggleSidebar={() => changeSidebar({ ...sidebar, open: !sidebar.open })}
        onActivate={setActiveId}
        onClose={(id) => void close(id)}
        onAdd={() => add()}
        barRef={barRef}
        drag={drag}
        suppressClick={suppressClick}
        registerTab={registerTab}
        onTabPointerDown={onTabPointerDown}
      />
      <div className="workarea">
        {sidebar.open && (
          <Sidebar
            state={sidebar}
            view={sidebarView}
            unavailable={diffsAvailable ? undefined : { diffs: tr("sidebar.view.diffs.need") }}
            onChange={changeSidebar}
          >
            {sidebarView === "diffs" ? (
              <div className="sb-slot" ref={setSlot} />
            ) : (
              <FilesPanel
                context={filesContext}
                preview={filesPreview}
                onTogglePreview={togglePreviewFolder}
                currentLeft={fileTab ? (activeTab?.compared?.left ?? null) : null}
                onOpen={openFromSidebar}
                emptyReason={emptyReason}
              />
            )}
          </Sidebar>
        )}
        <div className="pages">
      {tabs.map((t) => (
        <div key={t.id} className="tabpage" hidden={t.id !== activeId}>
          {t.home ? (
            <Home active={t.id === activeId} recents={recents} onOpen={open} onClearRecents={clearRecents} onRemoveRecent={dropRecent} onAbout={() => setDialog("about")} />
          ) : t.merge ? (
            <MergeView path={t.merge} active={t.id === activeId} onInfo={(info) => setMergeInfo(t.id, info)} />
          ) : (
            <Workspace
              active={t.id === activeId}
              start={t.start ?? (t.mode ? { mode: t.mode, left: "", right: "", run: false } : undefined)}
              onInfo={(info) => setInfo(t.id, info)}
              onCompared={compared}
              onOpenFiles={(l, r) => openFiles(l, r, t.id)}
              onOpenDirs={openDirs}
              navigateTo={navigate && navigate.tabId === t.id ? navigate : null}
              previewToggle={previewToggle && previewToggle.tabId === t.id ? previewToggle : null}
              sidebarSlot={t.id === activeId && sidebar.open && sidebarView === "diffs" ? slot : null}
            />
          )}
        </div>
      ))}
        </div>
      </div>
      {dialog === "options" && (
        <OptionsDialog settings={settings} onChange={changeSettings} onClose={() => setDialog(null)} />
      )}
      {dialog === "report" && activeTab?.report && (
        <ReportDialog source={activeTab.report} onClose={() => setDialog(null)} />
      )}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === "about" && <AboutDialog onClose={() => setDialog(null)} />}
    </div>
    </I18nProvider>
    </CommandsContext.Provider>
    </SettingsContext.Provider>
  );
}
