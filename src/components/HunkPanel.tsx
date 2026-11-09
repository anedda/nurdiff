import { useEffect, useMemo, useState } from "react";
import { useKeyed, useRevealRequest } from "../lib/useKeyed";
import { getRows } from "../api";
import { useT } from "../i18n/context";
import type { Hunk } from "../types";
import VirtualList from "./VirtualList";

const ROW_HEIGHT = 24;

type KindFilter = "all" | Hunk["kind"];

const FILTERS: { value: KindFilter; labelKey: string; titleKey: string }[] = [
  { value: "all", labelKey: "sb.kind.all", titleKey: "sb.kind.all.title" },
  { value: "changed", labelKey: "sb.kind.changed", titleKey: "sb.kind.changed.title" },
  { value: "leftOnly", labelKey: "sb.kind.leftOnly", titleKey: "sb.kind.leftOnly.title" },
  { value: "rightOnly", labelKey: "sb.kind.rightOnly", titleKey: "sb.kind.rightOnly.title" },
];

const KIND_COLOR: Record<Hunk["kind"], string> = {
  changed: "var(--chg-fg)",
  leftOnly: "var(--del-fg)",
  rightOnly: "var(--add-fg)",
};

interface Preview {
  number: number;
  text: string;
}

/** Preview (number and text of the first row) of the blocks, requested from the core only for those that are seen. */
class PreviewCache {
  private done = new Map<number, Preview | null>();
  private pending = new Map<number, Promise<Preview | null>>();
  constructor(private diffId: number) {}

  peek(start: number): Preview | null | undefined {
    return this.done.get(start);
  }

  load(start: number): Promise<Preview | null> {
    const have = this.pending.get(start);
    if (have) return have;
    const p = getRows(this.diffId, start, start + 1)
      .then((rows) => {
        const cell = rows[0]?.left ?? rows[0]?.right ?? null;
        const preview = cell ? { number: cell.number, text: cell.text } : null;
        this.done.set(start, preview);
        return preview;
      })
      .catch(() => {
        this.pending.delete(start); // it is retried at the next draw
        return null;
      });
    this.pending.set(start, p);
    return p;
  }
}

function Item({
  hunk,
  cache,
  current,
  onGo,
}: {
  hunk: Hunk;
  cache: PreviewCache;
  current: boolean;
  onGo: () => void;
}) {
  const t = useT();
  const [preview, setPreview] = useState<Preview | null | undefined>(() => cache.peek(hunk.start));
  useEffect(() => {
    let live = true;
    const known = cache.peek(hunk.start);
    if (known !== undefined) setPreview(known);
    else
      void cache.load(hunk.start).then((p) => {
        if (live) setPreview(p);
      });
    return () => {
      live = false;
    };
  }, [cache, hunk.start]);

  const text = preview ? preview.text.trim() || t("sb.emptyLine") : "";
  return (
    <button type="button" className={current ? "sb-item cur" : "sb-item"} onClick={onGo} aria-current={current}>
      <span className="sb-bar" style={{ background: KIND_COLOR[hunk.kind] }} />
      <span className="sb-num">{preview ? preview.number : ""}</span>
      <span className="sb-text">{text}</span>
      {hunk.end - hunk.start > 1 && <span className="sb-len">{t("sb.lines", { count: hunk.end - hunk.start })}</span>}
    </button>
  );
}

interface Props {
  diffId: number;
  revision: number;
  hunks: Hunk[];
  /** Index (in the full list) of the current difference, or -1. */
  current: number;
  onGo: (index: number) => void;
  /** How many merges were made in this comparison. */
}

/** Sidebar: the list of differences of the file, to jump from one to another. */
export default function HunkPanel({ diffId, revision, hunks, current, onGo }: Props) {
  const t = useT();
  const [filter, setFilter] = useState<KindFilter>("all");
  // After a merge the blocks change: previews and rows must be requested again.
  const cache = useKeyed(() => new PreviewCache(diffId), `${diffId}:${revision}`);
  const indices = useMemo(() => {
    const out: number[] = [];
    hunks.forEach((h, i) => {
      if (filter === "all" || h.kind === filter) out.push(i);
    });
    return out;
  }, [hunks, filter]);

  const position = current >= 0 ? indices.indexOf(current) : -1;
  // A change of block scrolls the list even if the position is the same.
  const reveal = useRevealRequest(position, current);

  return (
    <div className="sb-view">
      <h4 className="sb-title">
        <span>{t("sidebar.view.diffs")}</span>
        <span>{current >= 0 ? t("sb.position", { n: current + 1, total: hunks.length }) : hunks.length}</span>
      </h4>
      <div className="sb-chips" role="group" aria-label={t("sb.kindGroup")}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={filter === f.value ? "sb-chip on" : "sb-chip"}
            aria-pressed={filter === f.value}
            title={t(f.titleKey)}
            onClick={() => setFilter(f.value)}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>
      {hunks.length === 0 ? (
        <p className="sb-empty">{t("sb.noDiffs")}</p>
      ) : indices.length === 0 ? (
        <p className="sb-empty">{t("sb.noDiffsOfKind")}</p>
      ) : (
        <VirtualList
          className="sb-list"
          count={indices.length}
          rowHeight={ROW_HEIGHT}
          reveal={reveal}
          renderRow={(i) => {
            const index = indices[i];
            return (
              <Item hunk={hunks[index]} cache={cache} current={index === current} onGo={() => onGo(index)} />
            );
          }}
        />
      )}
    </div>
  );
}
