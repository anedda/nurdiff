import { useEffect, useRef, useState } from "react";
import pkg from "../../package.json";
import { BUILD_COMMIT, BUILD_DATE, BUILD_IS_DEV } from "../buildInfo";
import { describeBuild } from "../lib/buildInfo";
import { classifyPaths, inTauri, onFileDrag } from "../api";
import { useLanguage, useT } from "../i18n/context";
import { describeError, renderMessage } from "../i18n";
import { useSettings } from "../settingsContext";
import { runsOnPick } from "../lib/settings";
import { baseName, planDrop, sideAt } from "../lib/drop";
import { describeRecentDate } from "../lib/recentDate";
import { recentKey, type Recent } from "../lib/recents";
import { ChevronRightIcon, CloseIcon, FileIcon, FolderIcon, FolderPlusIcon, TrashIcon, UploadIcon } from "./icons";
import Logo from "./Logo";
import type { Mode } from "../types";
import type { WorkspaceStart } from "../Workspace";

interface HomeProps {
  /** The Home is the visible tab: only then does it respond to dragging. */
  active: boolean;
  recents: Recent[];
  /** Opens a tab: empty of the chosen type, or with two paths already compared. */
  onOpen: (start: WorkspaceStart | { mode: Mode | null }) => void;
  onClearRecents: () => void;
  /** Takes one comparison off the list. */
  onRemoveRecent: (recent: Recent) => void;
  /** Opens the "About NurDiff" window. */
  onAbout: () => void;
}

const MODE_LABEL: Record<Mode, string> = { files: "home.badge.files", dirs: "home.badge.dirs" };

/** Start screen: new comparison, recent comparisons and a few tips. */
export default function Home({ active, recents, onOpen, onClearRecents, onRemoveRecent, onAbout }: HomeProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The handler is registered only once: it reads the most recent values from here.
  const settings = useSettings();
  const t = useT();
  const lang = useLanguage();
  const build = describeBuild({ version: pkg.version, commit: BUILD_COMMIT, date: BUILD_DATE, dev: BUILD_IS_DEV }, t, lang);
  const latest = useRef({ active, onOpen, settings, t });
  latest.current = { active, onOpen, settings, t };

  useEffect(() => {
    if (!inTauri) return;
    const stopNavigation = (e: Event) => e.preventDefault();
    window.addEventListener("dragover", stopNavigation);
    window.addEventListener("drop", stopNavigation);

    async function dropped(paths: string[], side: "left" | "right" | null) {
      let plan;
      try {
        plan = planDrop(paths, await classifyPaths(paths), { mode: "files", left: "", right: "" }, side);
      } catch (e) {
        setError(describeError(e, latest.current.t));
        return;
      }
      if (!plan.ok) {
        setError(renderMessage(latest.current.t, plan.message));
        return;
      }
      setError(null);
      latest.current.onOpen({ mode: plan.mode, left: plan.left, right: plan.right, run: plan.compare && runsOnPick(latest.current.settings, plan.mode) });
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;
    onFileDrag((event) => {
      if (!latest.current.active) return;
      if (event.type === "leave") setDragging(false);
      else if (event.type === "enter") setDragging(true);
      else if (event.type === "drop") {
        setDragging(false);
        void dropped(event.paths, sideAt(event.x, window.innerWidth));
      }
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener("dragover", stopNavigation);
      window.removeEventListener("drop", stopNavigation);
    };
  }, []);

  const now = Date.now();
  return (
    <div className="home">
      <header className="home-title">
        <Logo size={72} />
        <div className="home-title-text">
          <h1>NurDiff</h1>
          <p className="lead">{t("home.lead")}</p>
        </div>
      </header>

      <div className="chooser-cards home-cards">
        <button type="button" className="card home-card" onClick={() => onOpen({ mode: "files" })}>
          <span className="card-icon" aria-hidden="true">
            <FileIcon />
          </span>
          <kbd className="card-key">{t("home.card.files.key")}</kbd>
          <strong>{t("home.card.files")}</strong>
          <span className="card-desc">{t("home.card.files.d")}</span>
        </button>
        <button type="button" className="card home-card" onClick={() => onOpen({ mode: "dirs" })}>
          <span className="card-icon" aria-hidden="true">
            <FolderPlusIcon />
          </span>
          <kbd className="card-key">{t("home.card.dirs.key")}</kbd>
          <strong>{t("home.card.dirs")}</strong>
          <span className="card-desc">{t("home.card.dirs.d")}</span>
        </button>
      </div>

      <div className="home-drop">
        <UploadIcon />
        <span>
          {t("home.drop.before")}
          <strong>{t("home.drop.files")}</strong>
          {t("home.drop.or")}
          <strong>{t("home.drop.dirs")}</strong>
          {t("home.drop.after")}
        </span>
      </div>
      {error && <p className="error">{error}</p>}

      <section className="recents">
        <div className="recents-head">
          <h2>
            {t("home.recents")}
            {recents.length > 0 && <span className="count-badge">{recents.length}</span>}
          </h2>
          {recents.length > 0 && (
            <button type="button" className="clear-btn" onClick={onClearRecents}>
              <TrashIcon />
              {t("home.recents.clear")}
            </button>
          )}
        </div>
        {recents.length === 0 ? (
          <p className="hint">{t("home.recents.empty")}</p>
        ) : (
          <ul className="recent-list">
            {recents.map((r) => (
              <li key={recentKey(r)} className="recent-item">
                <button
                  type="button"
                  className="recent"
                  title={`${r.left}\n${r.right}`}
                  onClick={() => onOpen({ mode: r.mode, left: r.left, right: r.right, run: runsOnPick(settings, r.mode) })}
                >
                  <span className="recent-icon" aria-hidden="true">
                    {r.mode === "dirs" ? <FolderIcon /> : <FileIcon />}
                  </span>
                  <span className="recent-body">
                    <span className="recent-title">
                      <strong className="recent-names">
                        {baseName(r.left)} <span className="muted">↔</span> {baseName(r.right)}
                      </strong>
                      <span className="badge">{t(MODE_LABEL[r.mode])}</span>
                    </span>
                    {/* The end of a path is what tells them apart: when it does not fit, the beginning is cut (dir=rtl, with the text isolated). */}
                    <span className="recent-paths">
                      <i className="side-dot-inline left" aria-hidden="true" />
                      <span className="recent-path" dir="rtl">
                        <bdi>{r.left}</bdi>
                      </span>
                      <span className="muted">↔</span>
                      <i className="side-dot-inline right" aria-hidden="true" />
                      <span className="recent-path" dir="rtl">
                        <bdi>{r.right}</bdi>
                      </span>
                    </span>
                  </span>
                  <span className="recent-date">{describeRecentDate(r.at, now, t, lang)}</span>
                  <span className="recent-go" aria-hidden="true">
                    <ChevronRightIcon />
                  </span>
                </button>
                <button type="button" className="recent-remove" title={t("home.recents.remove")} aria-label={t("home.recents.remove")} onClick={() => onRemoveRecent(r)}>
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tips">
        <h2>{t("home.tips")}</h2>
        <div className="tip-cards">
          <div className="tip-card">
            <div className="tip-head">
              <strong>{t("home.tip.find.title")}</strong>
              <kbd>Ctrl+F</kbd>
            </div>
            <p>{t("home.tip.find.body")}</p>
          </div>
          <div className="tip-card">
            <div className="tip-head">
              <strong>{t("home.tip.git.title")}</strong>
              <kbd className="code">git difftool</kbd>
            </div>
            <p>{t("home.tip.git.body")}</p>
          </div>
          <div className="tip-card">
            <div className="tip-head">
              <strong>{t("home.tip.tab.title")}</strong>
              <kbd>Ctrl+T</kbd>
            </div>
            <p>{t("home.tip.tab.body")}</p>
          </div>
        </div>
      </section>

      <footer className="home-foot">
        <p className="build-line">
          <button type="button" className="link-button" title={t("home.aboutHint")} onClick={onAbout}>
            {build}
          </button>
        </p>
      </footer>

      {dragging && (
        <div className="dropzone" aria-hidden="true">
          <div className="zone both active">{t("home.dropzone")}</div>
        </div>
      )}
    </div>
  );
}
