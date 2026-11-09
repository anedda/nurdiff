import { useT } from "../i18n/context";
import type { DragState } from "../lib/useWindowDrop";

/** During the drag: the zones where it can be dropped (left, right, or both). */
export default function DropOverlay({ drag }: { drag: DragState }) {
  const t = useT();
  return (
    <div className="dropzone" aria-hidden="true">
      {drag.count > 2 ? (
        <div className="zone both active">{t("ws.drop.tooMany")}</div>
      ) : drag.count === 2 ? (
        <div className="zone both active">{t("ws.drop.two")}</div>
      ) : (
        <>
          <div className={drag.hover === "left" ? "zone active" : "zone"}>{t("side.left")}</div>
          <div className={drag.hover === "right" ? "zone active" : "zone"}>{t("side.right")}</div>
        </>
      )}
    </div>
  );
}
