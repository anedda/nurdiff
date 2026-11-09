import { useEffect, useState } from "react";
import { gitRemove, gitSetup, gitStatus, type GitStatus } from "../api";
import { describeError } from "../i18n";
import { useT } from "../i18n/context";

/** The Git part of the options: shows whether `git difftool` opens NurDiff and writes or removes the configuration. */
export default function GitSetup() {
  const t = useT();
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [external, setExternal] = useState(false);
  const [mergetool, setMergetool] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const fail = (e: unknown) => setMessage({ error: true, text: describeError(e, t) });

  useEffect(() => {
    let alive = true;
    gitStatus()
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        setExternal(s.external);
        setMergetool(s.mergetool);
      })
      .catch((e) => alive && setMessage({ error: true, text: describeError(e, t) }));
    return () => {
      alive = false;
    };
  }, [t]);

  /** Runs a change of the configuration and shows the new state. */
  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await work();
      const s = await gitStatus();
      setStatus(s);
      setMessage({ error: false, text });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="opt-group git-setup">
      <h3>{t("options.git")}</h3>
      <span className="muted">{t("options.git.hint")}</span>
      {status && (
        <p className="git-state" role="status">
          {t(status.configured ? "options.git.on" : "options.git.off")}
          {status.configured && status.external ? ` ${t("options.git.onExternal")}` : ""}
          {status.configured && status.mergetool ? ` ${t("options.git.onMergetool")}` : ""}
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={external} onChange={(e) => setExternal(e.currentTarget.checked)} disabled={busy} />
        {t("options.git.external")}
      </label>
      <label className="check">
        <input type="checkbox" checked={mergetool} onChange={(e) => setMergetool(e.currentTarget.checked)} disabled={busy} />
        {t("options.git.mergetool")}
      </label>
      <div className="git-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(async () => t("options.git.done", { n: (await gitSetup(external, mergetool)).length }))}
        >
          {t("options.git.setup")}
        </button>
        <button
          type="button"
          disabled={busy || !status?.configured}
          onClick={() => void run(async () => t("options.git.removed", { n: (await gitRemove()).length }))}
        >
          {t("options.git.remove")}
        </button>
      </div>
      {message && (
        <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
