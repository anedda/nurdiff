#!/usr/bin/env bash
# Builds the command line (nurdiff-cli) and puts it in src-tauri/bundle-extra/, where the extra bundle configurations
# in src-tauri/bundle-cli/ look for it: the installers then carry the CLI next to the app, which is what
# `git difftool` needs. Usage: scripts/stage-cli.sh [rust-target]   (no target: the one of this machine)
# Then: npm run tauri build -- --config src-tauri/bundle-cli/<linux|windows|macos>.json [--target <target>]
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-}"
args=(build --release -p nurdiff-cli)
dir=target/release
if [ -n "$target" ]; then
    args+=(--target "$target")
    dir="target/$target/release"
fi
cargo "${args[@]}"

ext=""
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) ext=".exe" ;; esac
rm -rf src-tauri/bundle-extra
mkdir -p src-tauri/bundle-extra
cp "$dir/nurdiff-cli$ext" "src-tauri/bundle-extra/nurdiff-cli$ext"
echo "nurdiff-cli$ext staged in src-tauri/bundle-extra/"
