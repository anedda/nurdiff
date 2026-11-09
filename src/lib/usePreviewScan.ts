import { useEffect, useRef, useState } from "react";
import { cancelDirectoryScan, scanDirectories } from "../api";
import type { DirScan, ExtFilter } from "../types";
import { useChannel } from "./channel";
import { useRootsChange } from "./useRootsChange";

/**
 * The light scan of the two folders of the preview: it counts all the entries (also those of
 * closed folders) without reading the files. It starts by itself when the folders are chosen or changed and at
 * every `rescan` (Refresh, extension filter); swapping the sides keeps the result inverted.
 * Changing folders cancels the scan in progress. `scan` is `null` until it is ready, or if it
 * could not be done.
 */
export function usePreviewScan(left: string, right: string, filter: ExtFilter) {
  const channel = useChannel("scan");
  const [scan, setScan] = useState<DirScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const token = useRef(0);

  const rescan = () => {
    const mine = ++token.current;
    setScan(null);
    if (!left.trim() || !right.trim()) {
      setScanning(false);
      void cancelDirectoryScan(channel).catch(() => {});
      return;
    }
    setScanning(true);
    cancelDirectoryScan(channel)
      .then((epoch) => scanDirectories(left.trim(), right.trim(), filter, epoch, channel))
      .then((result) => {
        if (token.current !== mine) return;
        setScan(result);
        setScanning(false);
      })
      .catch(() => {
        if (token.current !== mine) return;
        setScan(null);
        setScanning(false);
      });
  };

  useRootsChange(
    left,
    right,
    () => setScan((s) => (s ? { ...s, leftOnly: s.rightOnly, rightOnly: s.leftOnly } : s)),
    rescan,
  );
  useEffect(
    () => () => {
      token.current += 1;
      void cancelDirectoryScan(channel).catch(() => {});
    },
    [channel],
  );
  return { scan, scanning, rescan };
}
