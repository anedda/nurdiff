import pkg from "../../package.json";
import { BUILD_COMMIT, BUILD_DATE, BUILD_IS_DEV } from "../buildInfo";
import { describeRuntime } from "../lib/buildInfo";
import { formatBuildDate } from "../lib/buildDate";
import { useLanguage, useT } from "../i18n/context";
import Modal from "./Modal";

/**
 * The shortcuts by area: `ids` are the numbers of the entries in the catalogues (`shortcuts.N.k` the keys,
 * `shortcuts.N.d` the description). The numbers do not follow the order of the list: they are those the entries
 * were given when they were added.
 */
export const SHORTCUT_GROUPS: { title: string; ids: number[] }[] = [
  { title: "shortcuts.group.general", ids: [14, 21, 15, 0, 20, 18] },
  { title: "shortcuts.group.files", ids: [19, 1, 2, 3, 4, 12, 13, 5, 6, 7, 8, 9, 10, 11] },
  { title: "shortcuts.group.dirs", ids: [16, 17] },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={t("shortcuts.title")} onClose={onClose} wide>
      <table className="shortcuts">
        {SHORTCUT_GROUPS.map((group) => (
          <tbody key={group.title}>
            <tr className="group">
              <th colSpan={2} scope="colgroup">
                {t(group.title)}
              </th>
            </tr>
            {group.ids.map((i) => (
              <tr key={i}>
                <th scope="row">{t(`shortcuts.${i}.k`)}</th>
                <td>{t(`shortcuts.${i}.d`)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <div className="modal-actions">
        <button type="button" className="primary" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const builtOn = formatBuildDate(BUILD_DATE, useLanguage());
  const runtime = describeRuntime(navigator.userAgent);
  return (
    <Modal title={t("about.title")} onClose={onClose}>
      <p>
        <strong>NurDiff</strong> {pkg.version}
      </p>
      <p className="muted">{t("about.tagline")}</p>
      <dl className="about-info">
        <dt>{t("about.version")}</dt>
        <dd>{pkg.version}</dd>
        <dt>{t("about.commit")}</dt>
        <dd>
          {BUILD_COMMIT || t("about.commitUnknown")}
          {BUILD_COMMIT.endsWith("*") && <span className="muted"> — {t("about.commitDirty")}</span>}
        </dd>
        {builtOn && (
          <>
            <dt>{t("about.builtAt")}</dt>
            <dd>{builtOn}</dd>
          </>
        )}
        <dt>{t("about.kind")}</dt>
        <dd>{t(BUILD_IS_DEV ? "about.kind.dev" : "about.kind.release")}</dd>
        {runtime.engine && (
          <>
            <dt>{t("about.engine")}</dt>
            <dd>{runtime.engine}</dd>
          </>
        )}
        {runtime.system && (
          <>
            <dt>{t("about.system")}</dt>
            <dd>{runtime.system}</dd>
          </>
        )}
      </dl>
      <div className="modal-actions">
        <button type="button" className="primary" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}
