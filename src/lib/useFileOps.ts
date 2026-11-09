import { useState, type Dispatch, type SetStateAction } from "react";
import {
  alignLines,
  clearAligns,
  editLines,
  locateLine,
  mergeHunk,
  mergeRow,
  mergeRows,
  saveSide,
  setRowFilter as applyRowFilter,
  undoMerge,
  unalignLines,
  type CompareOptions,
} from "../api";
import type { Algorithm, MergeDirection, OpenedDiff, RowFilter, Side, Whitespace } from "../types";
import { swapAligns } from "./aligns";
import type { Settings } from "./settings";

/** The options of a file comparison, which start from the settings and are then changed per tab. */
export function useFileOptions(settings: Settings) {
  const [ignoreCase, setIgnoreCase] = useState(settings.ignoreCase);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState<Whitespace>(settings.ignoreWhitespace);
  const [algorithm, setAlgorithm] = useState<Algorithm>(settings.algorithm);
  // Rows shown in the file comparison: it also applies to comparisons redone (Swap, Refresh, options).
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  return { ignoreCase, setIgnoreCase, ignoreWhitespace, setIgnoreWhitespace, algorithm, setAlgorithm, rowFilter, setRowFilter };
}

export type FileOptions = ReturnType<typeof useFileOptions>;

interface FileOpsContext {
  /** The open file comparison, and how to change it. */
  fileDiff: OpenedDiff | null;
  setFileDiff: Dispatch<SetStateAction<OpenedDiff | null>>;
  /** The last successful comparison: the paths are not the ones being typed in the fields. */
  compared: { left: string; right: string } | null;
  /** Runs an operation that occupies the application and shows any error. */
  exclusive: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  /** Compares two files again with those options. */
  runWith: (
    mode: "files",
    left: string,
    right: string,
    extra: { options: CompareOptions; readOnly: { left: boolean; right: boolean }; aligns: [number, number][] },
  ) => Promise<boolean>;
  options: FileOptions;
  setLeft: (path: string) => void;
  setRight: (path: string) => void;
  /** The view starts again from the beginning (the rows are different). */
  restartView: () => void;
}

/**
 * The operations on the open file comparison: merge, edit, undo, alignments, save
 * and the toolbar (swap, refresh, options). Every operation goes through `exclusive` and
 * shows the new state; the options change only if the redone comparison succeeds.
 */
export function useFileOps(ctx: FileOpsContext) {
  const { fileDiff, setFileDiff, compared, exclusive, runWith, options, setLeft, setRight, restartView } = ctx;
  const { ignoreCase, ignoreWhitespace, algorithm, rowFilter } = options;

  /** Runs an operation on the open comparison and shows its new state. */
  async function updateFileDiff(work: (id: number) => Promise<OpenedDiff>): Promise<boolean> {
    if (!fileDiff) return false;
    const id = fileDiff.id;
    const opened = await exclusive(() => work(id));
    if (!opened) return false;
    setFileDiff(opened);
    return true;
  }

  const merge = (hunk: number, direction: MergeDirection) => updateFileDiff((id) => mergeHunk(id, hunk, direction));
  const mergeOneRow = (row: number, direction: MergeDirection) => updateFileDiff((id) => mergeRow(id, row, direction));
  const mergeRowBlock = (first: number, last: number, direction: MergeDirection) =>
    updateFileDiff((id) => mergeRows(id, first, last, direction));
  const edit = (side: Side, start: number, remove: number, lines: string[]) =>
    updateFileDiff((id) => editLines(id, side, start, remove, lines));
  const locate = async (side: Side, number: number): Promise<number | null> => {
    if (!fileDiff) return null;
    try {
      return await locateLine(fileDiff.id, side, number);
    } catch {
      return null;
    }
  };
  const undo = () => updateFileDiff((id) => undoMerge(id));
  const align = (left: number, right: number) => updateFileDiff((id) => alignLines(id, left, right));
  const unalign = (left: number) => updateFileDiff((id) => unalignLines(id, left));
  const removeAligns = () => updateFileDiff((id) => clearAligns(id));
  const save = (side: Side) => updateFileDiff((id) => saveSide(id, side));

  // Toolbar of the file comparison: the paths are those of the last comparison
  // (not the ones being typed in the fields) and read-only sides stay read-only.
  const fileOpts: CompareOptions = { ignoreCase, ignoreWhitespace, algorithm };
  // The comparison redone on the same files keeps the manual alignments (with Swap they are swapped).
  const again = (
    l: string,
    r: string,
    readOnly: { left: boolean; right: boolean },
    opts = fileOpts,
    aligns: [number, number][] = fileDiff?.aligns ?? [],
  ) => runWith("files", l, r, { options: opts, readOnly, aligns });

  const swapFiles = () => {
    if (!compared || !fileDiff) return;
    const [l, r] = [compared.right, compared.left];
    const swapped = swapAligns(fileDiff.aligns);
    void again(l, r, { left: fileDiff.rightReadOnly, right: fileDiff.leftReadOnly }, fileOpts, swapped).then((ok) => {
      if (ok) {
        setLeft(l);
        setRight(r);
      }
    });
  };
  const refreshFiles = () => {
    if (!compared || !fileDiff) return;
    void again(compared.left, compared.right, { left: fileDiff.leftReadOnly, right: fileDiff.rightReadOnly });
  };
  const toggleIgnoreCase = async () => {
    if (!compared || !fileDiff) return;
    const next = { ...fileOpts, ignoreCase: !fileOpts.ignoreCase };
    // The options change only if the comparison is redone (it can be cancelled or fail).
    const ok = await again(compared.left, compared.right, { left: fileDiff.leftReadOnly, right: fileDiff.rightReadOnly }, next);
    if (ok) options.setIgnoreCase(next.ignoreCase);
  };
  const changeWhitespace = async (next: Whitespace) => {
    if (!compared || !fileDiff || next === ignoreWhitespace) return;
    const ok = await again(compared.left, compared.right, { left: fileDiff.leftReadOnly, right: fileDiff.rightReadOnly }, { ...fileOpts, ignoreWhitespace: next });
    if (ok) options.setIgnoreWhitespace(next);
  };
  const changeAlgorithm = async (next: Algorithm) => {
    if (!compared || !fileDiff || next === algorithm) return;
    // As with the other options: the algorithm changes only if the comparison is redone.
    const ok = await again(compared.left, compared.right, { left: fileDiff.leftReadOnly, right: fileDiff.rightReadOnly }, { ...fileOpts, algorithm: next });
    if (ok) options.setAlgorithm(next);
  };
  const changeFilter = async (filter: RowFilter) => {
    if (filter === rowFilter) return;
    if (await updateFileDiff((id) => applyRowFilter(id, filter))) {
      options.setRowFilter(filter);
      restartView();
    }
  };

  return {
    fileOpts,
    updateFileDiff,
    merge,
    mergeOneRow,
    mergeRowBlock,
    edit,
    locate,
    undo,
    align,
    unalign,
    removeAligns,
    save,
    swapFiles,
    refreshFiles,
    toggleIgnoreCase,
    changeWhitespace,
    changeAlgorithm,
    changeFilter,
  };
}
