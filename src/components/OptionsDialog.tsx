import type { DirFilter } from "../lib/tree";
import { CODE_SIZE_MAX, CODE_SIZE_MIN, clampCodeSize, DEFAULT_SETTINGS, type Settings, type Theme } from "../lib/settings";
import { ALGORITHMS, WHITESPACES, type Algorithm, type Whitespace } from "../types";
import { AUTO_LANGUAGE, availableLanguages } from "../i18n";
import { useT } from "../i18n/context";
import { configFolder } from "../lib/configStore";
import GitSetup from "./GitSetup";
import Modal from "./Modal";

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}

/** Tool options: every change applies immediately and is saved. */
export default function OptionsDialog({ settings, onChange, onClose }: Props) {
  const t = useT();
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  return (
    <Modal title={t("options.title")} onClose={onClose} wide>
      {/* Like the shortcuts: a title for each area, in two columns so that a label and its control stay close. */}
      <div className="opt-groups">
        <div className="opt-col">
          <section className="opt-group">
            <h3>{t("options.group.general")}</h3>
            <label>
              {t("options.language")}
              <select value={settings.language} onChange={(e) => set("language", e.currentTarget.value)}>
                <option value={AUTO_LANGUAGE}>{t("options.language.auto")}</option>
                {availableLanguages().map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("options.theme")}
              <select value={settings.theme} onChange={(e) => set("theme", e.currentTarget.value as Theme)}>
                <option value="auto">{t("options.theme.auto")}</option>
                <option value="light">{t("options.theme.light")}</option>
                <option value="dark">{t("options.theme.dark")}</option>
              </select>
            </label>
            <label>
              {t("options.codeSize")}
              <span className="opt-size">
                <input
                  type="number"
                  min={CODE_SIZE_MIN}
                  max={CODE_SIZE_MAX}
                  value={settings.codeSize}
                  onChange={(e) => {
                    const n = Number(e.currentTarget.value);
                    if (Number.isFinite(n) && e.currentTarget.value !== "") set("codeSize", clampCodeSize(n));
                  }}
                />
                <span className="muted">px ({CODE_SIZE_MIN}–{CODE_SIZE_MAX})</span>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.systemTitleBar} onChange={(e) => set("systemTitleBar", e.currentTarget.checked)} />
              {t("options.systemTitleBar")}
            </label>
            <span className="muted">{t("options.systemTitleBar.hint")}</span>
          </section>
          <section className="opt-group">
            <h3>{t("options.newFiles")}</h3>
            <label className="check">
              <input type="checkbox" checked={settings.ignoreCase} onChange={(e) => set("ignoreCase", e.currentTarget.checked)} />
              {t("opt.ignoreCase")}
            </label>
            <label>
              {t("opt.ignoreWhitespace")}
              <select value={settings.ignoreWhitespace} onChange={(e) => set("ignoreWhitespace", e.currentTarget.value as Whitespace)}>
                {WHITESPACES.map((o) => (
                  <option key={o.value} value={o.value} title={t(o.titleKey)}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("opt.algorithm")}
              <select value={settings.algorithm} onChange={(e) => set("algorithm", e.currentTarget.value as Algorithm)}>
                {ALGORITHMS.map((a) => (
                  <option key={a.value} value={a.value} title={t(a.titleKey)}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.compareFilesOnDrop} onChange={(e) => set("compareFilesOnDrop", e.currentTarget.checked)} />
              {t("options.filesOnDrop")}
            </label>
            <span className="muted">{t("options.filesOnDrop.hint")}</span>
          </section>
        </div>
        <div className="opt-col">
          <section className="opt-group">
            <h3>{t("options.group.dirs")}</h3>
            <label>
              {t("options.dirFilter")}
              <select value={settings.dirFilter} onChange={(e) => set("dirFilter", e.currentTarget.value as DirFilter)}>
                <option value="diffs">{t("options.dirFilter.diffs")}</option>
                <option value="all">{t("options.dirFilter.all")}</option>
                <option value="same">{t("options.dirFilter.same")}</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.dirStripes} onChange={(e) => set("dirStripes", e.currentTarget.checked)} />
              {t("options.dirStripes")}
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.compareOnDrop} onChange={(e) => set("compareOnDrop", e.currentTarget.checked)} />
              {t("options.dirsOnDrop")}
            </label>
            <span className="muted">{t("options.dirsOnDrop.hint")}</span>
          </section>
          <GitSetup />
        </div>
      </div>
      {configFolder() && <p className="hint">{t("options.configPath", { path: configFolder() ?? "" })}</p>}
      <p className="hint">{t("options.hint")}</p>
      <div className="modal-actions">
        <button type="button" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>
          {t("options.reset")}
        </button>
        <button type="button" className="primary" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}
