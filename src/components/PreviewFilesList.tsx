import { useState } from "react";
import { useT } from "../i18n/context";
import { STATUS_KEY } from "../lib/dirReport";
import type { PreviewList, PreviewRow } from "../lib/previewTree";
import { relativeTo } from "../lib/sidebarFiles";
import { joinPath } from "../lib/tree";
import { useRevealRequest } from "../lib/useKeyed";
import type { EntryStatus } from "../types";
import EntryIcon from "./EntryIcon";
import { StatusIcon } from "./icons";
import VirtualList from "./VirtualList";

const ROW_HEIGHT = 24;

interface Props {
  list: PreviewList;
  /** Path of the file open in the foreground tab (left side), if it is a file comparison. */
  currentLeft: string | null;
  onOpen: (left: string, right: string) => void;
  onToggle: (rel: string) => void;
}

/**
 * What the preview already knows without comparing: an entry present on one side only or of a different
 * type. For the others it is not known whether they are equal or different, so no icon.
 */
export function previewRowStatus(row: PreviewRow): EntryStatus | null {
  const { left, right } = row.pair;
  if (!left) return "rightOnly";
  if (!right) return "leftOnly";
  const dirs = Number(left.kind === "dir") + Number(right.kind === "dir");
  return dirs === 1 ? "typeMismatch" : null;
}

/** Sidebar, Files view, before the comparison: the content of the two folders as the preview read it. */
export default function PreviewFilesList({ list, currentLeft, onOpen, onToggle }: Props) {
  const t = useT();
  const [hint, setHint] = useState<string | null>(null);
  const { rows } = list;
  const currentRel = currentLeft ? relativeTo(list.left, currentLeft) : null;
  const at = currentRel === null ? -1 : rows.findIndex((r) => r.rel === currentRel);
  // It scrolls when the current file or the visible tree changes.
  const reveal = useRevealRequest(at, `${currentRel}:${rows.length}`);

  const open = (row: PreviewRow) => {
    setHint(null);
    if (row.isDir) onToggle(row.rel);
    else if (row.pair.left?.kind === "file" && row.pair.right?.kind === "file") onOpen(joinPath(list.left, row.rel), joinPath(list.right, row.rel));
    else if (!row.pair.left || !row.pair.right) setHint(t("sb.hint.oneSide", { name: row.pair.name }));
    else setHint(t("sb.hint.notText", { name: row.pair.name }));
  };

  const empty =
    list.state === "reading" ? t("sb.preview.reading") : list.state === "error" ? t("sb.preview.error") : t("sb.preview.empty");

  return (
    <div className="sb-view">
      <h4 className="sb-title">
        <span>{t("sidebar.view.files")}</span>
      </h4>
      <p className="sb-hint sb-note">{t("sb.preview.note")}</p>
      {rows.length === 0 ? (
        <p className="sb-empty">{empty}</p>
      ) : (
        <VirtualList
          className="sb-list"
          count={rows.length}
          rowHeight={ROW_HEIGHT}
          reveal={reveal}
          renderRow={(i) => {
            const row = rows[i];
            const st = previewRowStatus(row);
            const label = st ? t(STATUS_KEY[st]) : undefined;
            const cur = !row.isDir && row.rel === currentRel;
            return (
              <button
                type="button"
                className={cur ? "sb-item tree cur" : "sb-item tree"}
                style={{ paddingLeft: 10 + row.depth * 14 }}
                title={row.rel}
                aria-current={cur}
                onClick={() => open(row)}
              >
                <span className="sb-tw">{row.isDir ? (row.loading ? "…" : row.expanded ? "▾" : "▸") : ""}</span>
                <span className={`sb-st st-${st ?? "none"}`} role={st ? "img" : undefined} aria-label={label} title={label}>
                  {st && <StatusIcon status={st} />}
                </span>
                <EntryIcon kind={row.isDir ? "dir" : "file"} open={row.expanded} />
                <span className="sb-text plain">{row.pair.name}</span>
              </button>
            );
          }}
        />
      )}
      {hint && <p className="sb-hint">{hint}</p>}
    </div>
  );
}
