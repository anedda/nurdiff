import { useEffect, useState } from "react";
import { describeError } from "../i18n";
import { useT } from "../i18n/context";
import { configProblem, onConfigProblem } from "../lib/configStore";

/** The same problem, as a text to compare: the errors are new objects every time they come. */
const keyOf = (problem: unknown): string | null => (problem === null || problem === undefined ? null : JSON.stringify(problem));

/** Tells that the settings cannot be read or saved (no home folder, folder not writable): the app works, but forgets. */
export default function ConfigProblem() {
  const t = useT();
  const [problem, setProblem] = useState<unknown>(configProblem);
  // What the user hid: the same problem does not come back (the error repeats at every saving), another one does.
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(
    () =>
      onConfigProblem((next) => {
        setProblem(next);
        if (next === null) setHidden(null); // gone: if it comes back, it is shown again
      }),
    [],
  );
  const key = keyOf(problem);
  if (key === null || key === hidden) return null;
  return (
    <div className="error config-problem" role="alert">
      <span>{t("config.problem", { reason: describeError(problem, t) })}</span>
      <button type="button" className="config-problem-close" aria-label={t("config.problem.dismiss")} title={t("config.problem.dismiss")} onClick={() => setHidden(key)}>
        ×
      </button>
    </div>
  );
}
