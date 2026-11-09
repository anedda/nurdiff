import { useT } from "../i18n/context";

const icon = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export type ViewMode = "split" | "unified" | "map";

/** The icons of the views: side by side, unified and (for folders) map. */
const ICONS: Record<ViewMode, JSX.Element> = {
  split: (
    <svg {...icon}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </svg>
  ),
  unified: (
    <svg {...icon}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  ),
  map: (
    <svg {...icon}>
      <rect x="3" y="3" width="11" height="10" rx="1.5" />
      <rect x="16" y="3" width="5" height="10" rx="1.5" />
      <rect x="3" y="15" width="6" height="6" rx="1.5" />
      <rect x="11" y="15" width="10" height="6" rx="1.5" />
    </svg>
  ),
};

interface Props {
  /** Which buttons to show, in order. */
  modes?: ViewMode[];
  /** The available views (the others have the button but disabled); by default only "Side by side". */
  enabled?: ViewMode[];
  /** The view in use. */
  value?: ViewMode;
  onChange?: (mode: ViewMode) => void;
  /** Tooltip in place of the normal one for a view that is not available (the reason). */
  unavailableTitle?: Partial<Record<ViewMode, string>>;
}

/**
 * How the two sides are shown: Side by side (two panes), Unified (a single pane)
 * and, for folders, Map (only in the finished comparison).
 */
export default function ViewSwitch({ modes = ["split", "unified"], enabled = ["split"], value = "split", onChange, unavailableTitle }: Props) {
  const t = useT();
  return (
    <div className="tb-cluster view-switch" role="group" aria-label={t("fd.view.label")}>
      <div className="seg">
        {modes.map((mode) => {
          const available = enabled.includes(mode);
          return (
            <button
              key={mode}
              type="button"
              className="seg-btn"
              aria-pressed={mode === value}
              disabled={!available}
              onClick={() => onChange?.(mode)}
              title={!available && unavailableTitle?.[mode] ? unavailableTitle[mode] : t(`fd.view.${mode}.title`)}
              aria-label={t(`fd.view.${mode}`)}
            >
              {ICONS[mode]}
              <span className="tb-label">{t(`fd.view.${mode}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
