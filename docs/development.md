# Development

## Building from source

Needs [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 20 or newer and Tauri's system libraries:

- **Linux (Debian/Ubuntu)**: `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: WebView2 (already on Windows 10/11) and the Microsoft C++ Build Tools
- Other distributions: <https://tauri.app/start/prerequisites/>

```bash
npm install
npm run tauri build      # installers in target/release/bundle
```

On Linux, `./scripts/build-linux.sh` does the same inside a Podman or Docker container, runs the tests, and puts the AppImage, the `.deb`, the `.rpm` and the command-line tool in `./out`.

## Working on the code

```bash
cargo test                  # core + command line
npm install
npm test                    # interface logic
npm run lint                # ESLint, no warnings allowed
npm run tauri dev           # the app in development mode
```

To work **without installing anything** (no Rust, Node or webview libraries), everything also runs in a Podman or Docker container:

```bash
./scripts/dev.sh check      # fmt, clippy, Rust tests, tsc, lint, vitest
./scripts/dev.sh ui         # the interface test in Chromium
./scripts/dev.sh gui        # the full app on your X11 desktop
```

Layout of the repository:

```
crates/core    the comparison engine (Rust, no dependency on the interface)
crates/archive reads archives (zip, tar) into a temporary folder so they compare like folders
crates/cli     the nurdiff-cli command line
src-tauri      the desktop app (Tauri 2)
src            the interface (React + TypeScript)
tools/ui-test  the interface test in Chromium (see tools/ui-test/README.md)
scripts/make-test-cases.py  generates dev-local/test-cases (left and right trees, archives included) to try things by hand
```

The CI (`.github/workflows/ci.yml`) is set up to run `cargo fmt`, `clippy` with warnings as errors, the Rust and interface tests, the app build on Linux, Windows and macOS, and the browser test. Pushing a tag `vX.Y.Z` that matches the version in `src-tauri/tauri.conf.json` starts `release.yml`, which builds the installers and the command line and attaches them to a **draft** release.

## Languages

Add a language by copying `src/i18n/locales/en.json` to `src/i18n/locales/<code>.json`, translating the texts and changing `lang.name` to the language's own name. The file is picked up by the build. `npm test` checks that every language has the same keys and placeholders as English. Plural forms use the suffixes `_one`, `_other` (and the others `Intl.PluralRules` knows).
