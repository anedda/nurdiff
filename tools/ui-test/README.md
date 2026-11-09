# UI test in Chromium

The test opens the UI in Chromium (Playwright) with Tauri's `invoke` bridge **simulated**: the page believes it is talking to Rust, but the answers come from the mock in `harness.py` and from the fixtures in `fixtures/`, which are the real output of the core. It tests the logic and the look of the UI; it does **not** test the Tauri crate, the real window, the permissions or the file system.

## Usage

```bash
pip install playwright && playwright install chromium   # once
./tools/ui-test/run.sh                                  # from the project root: the whole test
./tools/ui-test/run.sh --list                           # lists the suites
./tools/ui-test/run.sh sidebar dirs                     # only some suites
./scripts/dev.sh ui sidebar                             # the same, in a container
```

The test is split into **suites by area** (`suites/*.py`): each has a `run(browser)` function and opens its own pages. A suite that crashes is recorded as failed and the others continue; at the end there is a summary with the checks and the time of each. A whole run measured on 23 October 2026 (741 checks) took about 2 minutes of testing (from 5 to 33 seconds per suite), plus the build; on a busy machine it can take much longer. While working, run only the suite of the area you are touching.

`run.sh` builds the UI (`npm run build`), decompresses the fixtures into `dist/fixtures/`, starts `vite preview` on port 4173, runs `ui_test.py` (the launcher) with the arguments received and stops the server. Screenshots end up in `tools/ui-test/shots/` (ignored by Git). The outcome is "Tutti i controlli superati" (all checks passed) or the list of the `FAIL`s. The address can be changed with `NURDIFF_UI_BASE`.

## How it works

- `harness.py` has everything the suites share: `INIT`, `check`, `open_page`, `settled`, `run_files`… The suites import it with `from harness import *`.
- `INIT` (in `harness.py`) is a script injected into the page that defines `window.__TAURI_INTERNALS__.invoke` and records every call in `window.__calls` (the tests check what was asked of Rust). There is one branch per command: add one when a new command is born.
- The `window.__*` variables drive the scenarios: `__fileFixture` (which file comparison to return), `__pick` (what the folder picker answers), `__recStatus` / `__recFail` (in-place comparison), `__sizeHold` / `__sizeFail` (folder size), `__kinds` (type of the paths), `__launch` (start from the command line).
- `open_page(browser, scheme, kind, auto_files, locale)` opens a new page; `LOCALE` is `it-IT` (the tests look for Italian texts).
- `check(name, condition, detail)` records an outcome; the failures are collected and printed at the end.

## Fixtures

`fixtures/*.json.gz` (decompressed by `run.sh`):
- `small.json`: comparison of two small files (2036 rows). `big.json`: large file (300496 rows, for virtualization).
- `merge.json`: sequence of answers of the core to a block merge and its undos.
- `dir.json`: comparison of two trees of 200 folders (`d000`…`d199`, files `f00001.txt`…): 20199 entries.

They are regenerated from any two files or two folders with `tools/fixgen` (`cargo run --release --manifest-path tools/fixgen/Cargo.toml -- <file|merge|dir> <left> <right> <output.json>`; modes in `tools/fixgen/src/main.rs`; `small_a.txt` / `small_b.txt` are the starting files of `small.json`). The starting files of `big.json` and the trees of `dir.json` are not in the repository: they can be generated at random, as long as the expectations of the tests that quote exact numbers (`20199`, `f00037.txt`, `/x/l`, …) are changed accordingly.
