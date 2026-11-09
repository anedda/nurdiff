"""UI test in Chromium with Tauri's `invoke` bridge simulated (see README.md in this folder).

The answers of the commands come from `fixtures/*.json.gz` (run.sh decompresses them into dist/fixtures), which are the real output of the core. It does not test
the Tauri crate or the real window.

The launcher: it runs the suites (`suites/*.py`) one after the other. A suite that crashes is recorded as failed and the others
continue. Usage: ./tools/ui-test/run.sh [--list] [suite…]
"""
import argparse
import importlib
import sys
import time
import traceback

from playwright.sync_api import sync_playwright

import harness

# The order is that of the test before it was split by areas.
SUITES = [
    ("file_diff", "Confronto di file: file piccolo e grande, selezione, modifica diretta, merge, allineamento, differenze minori"),
    ("file_toolbar", "Barra degli strumenti del confronto di file"),
    ("preview", "Anteprima delle cartelle: righe, dimensioni, barra, filtri, annullamento, Expand, tastiera"),
    ("dirs", "Confronto di cartelle ad albero (20199 voci)"),
    ("dir_views", "Cartelle: filtro per estensione, menu «More filters», viste Unificato e Mappa, colonna «Differenze»"),
    ("sidebar", "Barra laterale"),
    ("drop_launch", "Trascinamento, confronto immediato, Sfoglia, avvio con due percorsi"),
    ("merge", "Risolvere i conflitti di un file (git mergetool)"),
    ("app_shell", "Guscio dell'app: file e errori, versione, menu, Home, titolo, lingue, tab, rotella"),
]


def main() -> int:
    ap = argparse.ArgumentParser(description="Prova della UI in Chromium")
    ap.add_argument("suite", nargs="*", help="le suite da eseguire (di norma tutte)")
    ap.add_argument("--list", action="store_true", help="elenca le suite ed esce")
    args = ap.parse_args()
    names = [n for n, _ in SUITES]
    if args.list:
        for n, d in SUITES:
            print(f"{n:14s} {d}")
        return 0
    unknown = [s for s in args.suite if s not in names]
    if unknown:
        print(f"Suite sconosciute: {', '.join(unknown)}. Quelle che esistono: {', '.join(names)}", file=sys.stderr)
        return 2
    selected = [n for n in names if not args.suite or n in args.suite]

    timings = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name in selected:
            print(f"\n##### Suite «{name}» #####", flush=True)
            module = importlib.import_module(f"suites.{name}")
            before = harness.STATS["pass"] + harness.STATS["fail"]
            fails = len(harness.failures)
            started = time.time()
            try:
                module.run(browser)
            except Exception as e:  # a suite that stops does not stop the others
                traceback.print_exc()
                harness.check(f"la suite «{name}» si è interrotta: {type(e).__name__}", False, (str(e).splitlines() or [""])[0][:200])
            timings.append((name, harness.STATS["pass"] + harness.STATS["fail"] - before, len(harness.failures) - fails, time.time() - started))
        browser.close()

    print("\nRiepilogo per suite:")
    for name, n, f, secs in timings:
        print(f"  {name:14s} {n:4d} controlli  {f:3d} falliti  {secs:6.0f} s")
    print(f"  {'totale':14s} {harness.STATS['pass'] + harness.STATS['fail']:4d} controlli  {len(harness.failures):3d} falliti  {sum(t[3] for t in timings):6.0f} s")
    print()
    if harness.failures:
        print(f"{len(harness.failures)} controlli FALLITI:")
        for f in harness.failures:
            print("  -", f)
        return 1
    print("Tutti i controlli superati")
    return 0


if __name__ == "__main__":
    sys.exit(main())
