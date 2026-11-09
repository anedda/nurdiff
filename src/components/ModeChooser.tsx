import { useT } from "../i18n/context";
import type { Mode } from "../types";

/** A new tab: you choose whether to compare files or folders (the type of a tab does not change afterwards). */
export default function ModeChooser({ onPick }: { onPick: (mode: Mode) => void }) {
  const t = useT();
  return (
    <div className="chooser">
      <h2>{t("ws.chooser.title")}</h2>
      <div className="chooser-cards">
        <button type="button" className="card" onClick={() => onPick("files")}>
          <strong>{t("home.badge.files")}</strong>
          <span>{t("ws.chooser.files.d")}</span>
        </button>
        <button type="button" className="card" onClick={() => onPick("dirs")}>
          <strong>{t("home.badge.dirs")}</strong>
          <span>{t("home.card.dirs.d")}</span>
        </button>
      </div>
      <p className="hint">{t("ws.chooser.hint")}</p>
    </div>
  );
}
