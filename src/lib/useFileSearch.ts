import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelSearch, searchRows } from "../api";
import { useChannel } from "./channel";
import type { SearchHit, Side } from "../types";

/** Milliseconds without typing before the core is asked: a long file is not searched at every letter. */
const DEBOUNCE_MS = 150;

interface Options {
  /** The comparison and its revision: other rows (a merge, an edit, a filter) mean searching again. */
  diffId: number;
  revision: number;
  /** The tab is visible and shows the side-by-side view: only then do the shortcuts apply. */
  enabled: boolean;
  /** A row is being edited: Ctrl+F leaves it alone. */
  blocked: () => boolean;
  /** The side to search when the bar opens (the pane the user was in). */
  defaultSide: () => Side;
  /** The row the search starts from when the text changes: the first match at or after it becomes the current one. */
  startRow: () => number;
  onError: (error: unknown) => void;
}

/** The first match at or after `row`/`start`, or the first one if there is none (the search wraps around). */
export function firstFrom(hits: readonly SearchHit[], row: number, start = 0): number {
  const at = hits.findIndex((h) => h.row > row || (h.row === row && h.start >= start));
  return at >= 0 ? at : 0;
}

/**
 * The search in the text of one side of a comparison: the state of the bar, the matches (asked of the core, which
 * looks at the whole file), the current one and the movement between them.
 * `revealCount` grows every time the view has to show the current match again (even if it is the same one).
 */
export function useFileSearch({ diffId, revision, enabled, blocked, defaultSide, startRow, onError }: Options) {
  // The searches of this tab: a new one stops the old one in the core (it holds the store for as long as it looks).
  const channel = useChannel("search");
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [caseSensitive, setCaseState] = useState(false);
  const [side, setSideState] = useState<Side>("left");
  // The answer says which request it is for (`tag`): while another one is asked (other side, other option, new rows) the old
  // matches are not shown, or they would be drawn at their old offsets on other text.
  const [result, setResult] = useState<{ tag: string; hits: SearchHit[]; truncated: boolean }>({ tag: "", hits: [], truncated: false });
  const [current, setCurrent] = useState(-1);
  const [revealCount, setRevealCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // What the next answer is for: a change of the search itself (the user's) starts again from `startRow` and shows the
  // match; a new revision of the rows (an edit, a merge) keeps the position of the current match as far as it can,
  // and does not take the view away from where the user is working.
  const fromUser = useRef(true);
  const last = useRef<SearchHit | null>(null);
  const latest = useRef({ startRow, onError, blocked, defaultSide });
  latest.current = { startRow, onError, blocked, defaultSide };

  // After the render: when the bar has just opened its field is not there yet.
  const focusInput = () =>
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

  const openRef = useRef(open);
  openRef.current = open;
  const show = useCallback(() => {
    if (!openRef.current) {
      fromUser.current = true;
      setSideState(latest.current.defaultSide());
      setOpen(true);
    }
    focusInput();
  }, []);
  const close = useCallback(() => setOpen(false), []);

  const setQuery = useCallback((text: string) => {
    fromUser.current = true;
    setQueryState(text);
  }, []);
  const setCaseSensitive = useCallback((on: boolean) => {
    fromUser.current = true;
    setCaseState(on);
  }, []);
  const setSide = useCallback((s: Side) => {
    fromUser.current = true;
    setSideState(s);
  }, []);

  // Other files: the old position means nothing.
  useEffect(() => {
    fromUser.current = true;
  }, [diffId]);

  const tag = `${diffId}|${revision}|${side}|${caseSensitive ? 1 : 0}|${query}`;
  useEffect(() => {
    if (!open || query === "") {
      setResult({ tag: "", hits: [], truncated: false });
      setCurrent(-1);
      last.current = null;
      void cancelSearch(channel).catch(() => {}); // the bar was closed or the text emptied: what is still running is of no use
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      searchRows(diffId, side, query, caseSensitive, channel)
        .then((r) => {
          if (!live) return;
          // `null`: stopped by another search of the channel, which is the one that counts; nothing in this one
          setResult(r === null ? { tag, hits: [], truncated: false } : { tag, hits: r.hits, truncated: r.truncated });
          if (r === null) return;
          const prev = last.current;
          const user = fromUser.current || !prev;
          const at = r.hits.length === 0 ? -1 : user ? firstFrom(r.hits, latest.current.startRow()) : firstFrom(r.hits, prev.row, prev.start);
          fromUser.current = false;
          setCurrent(at);
          last.current = at >= 0 ? r.hits[at] : null;
          if (at >= 0 && user) setRevealCount((n) => n + 1);
        })
        .catch((e) => {
          if (!live) return;
          setResult({ tag, hits: [], truncated: false }); // answered, with nothing: not "waiting" any more
          latest.current.onError(e);
        });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, query, caseSensitive, side, diffId, revision, tag, channel]);

  // Gone (the tab closes, the view changes): a search that is still running is stopped.
  useEffect(() => () => void cancelSearch(channel).catch(() => {}), [channel]);

  /** The answer is for what is asked now. */
  const answered = result.tag === tag;
  const move = useCallback(
    (delta: 1 | -1) => {
      const n = answered ? result.hits.length : 0;
      if (n === 0) return;
      const at = (Math.max(current, 0) + delta + n) % n;
      setCurrent(at);
      last.current = result.hits[at];
      setRevealCount((c) => c + 1);
    },
    [answered, result.hits, current],
  );
  const next = useCallback(() => move(1), [move]);
  const prev = useCallback(() => move(-1), [move]);

  // Ctrl+F opens the bar (or goes back to its field); F3 and Shift+F3 move between the matches.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (latest.current.blocked()) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        show();
      } else if (open && e.key === "F3" && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        move(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, open, show, move]);

  // Hidden (another tab, another view): the bar closes, so the highlights do not stay behind.
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  const currentHit = useMemo(
    () => (open && answered && current >= 0 ? (result.hits[current] ?? null) : null),
    [open, answered, current, result.hits],
  );

  return {
    open,
    query,
    caseSensitive,
    side,
    hits: open && answered ? result.hits : EMPTY,
    truncated: open && answered && result.truncated,
    /** There is a search to answer (the first one, or after a change): the bar does not say "no results" yet. */
    searching: open && query !== "" && !answered,
    current,
    currentHit,
    revealCount,
    inputRef,
    show,
    close,
    setQuery,
    setCaseSensitive,
    setSide,
    next,
    prev,
  };
}

const EMPTY: SearchHit[] = [];
