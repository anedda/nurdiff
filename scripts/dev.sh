#!/usr/bin/env bash
# NurDiff development in a container (Podman or Docker): nothing to install on the system.
#   ./scripts/dev.sh check            fmt, ESLint, tsc, vitest, clippy (also of the Tauri crate), Rust tests (like the CI)
#   ./scripts/dev.sh ui [suite…]      UI test in Chromium (all, or only the given suites: `ui --list`)
#   ./scripts/dev.sh gui [port]       the full app (`npm run tauri dev`) on your X11 desktop; the development server
#                                     listens on 1420, or on the port given (to run two apps at once)
#   ./scripts/dev.sh shell            shell in the container
#   ./scripts/dev.sh run <command>    any command, for example `run cargo test -p nurdiff-core`
#   ./scripts/dev.sh image            (re)builds the image
# The repository is mounted at /src; target/ and node_modules/ stay in the project folder.
# Cargo and npm caches and the container's "home" live in ~/.cache/nurdiff-dev (NURDIFF_DEV_CACHE).
# The `gui` command mounts your home READ-ONLY at the same path (for dragging
# files from the file manager) and uses your X11 server. To force the engine: ENGINE=docker.
set -euo pipefail
cd "$(dirname "$0")/.."

ENGINE="${ENGINE:-$(command -v podman || command -v docker || true)}"
[ -n "$ENGINE" ] || { echo "Né podman né docker trovati nel PATH" >&2; exit 1; }
IMAGE=nurdiff-dev
CACHE="${NURDIFF_DEV_CACHE:-$HOME/.cache/nurdiff-dev}"
mkdir -p "$CACHE/cargo" "$CACHE/npm" "$CACHE/home"

build_image() { "$ENGINE" build --target dev -t "$IMAGE" .; }
"$ENGINE" image exists "$IMAGE" 2>/dev/null || "$ENGINE" image inspect "$IMAGE" >/dev/null 2>&1 || build_image

args=(--rm --workdir /src -v "$PWD:/src" -v "$CACHE:/cache"
      -e HOME=/cache/home -e CARGO_HOME=/cache/cargo -e npm_config_cache=/cache/npm
      --security-opt label=disable)
[ "$(basename "$ENGINE")" = podman ] && args+=(--userns=keep-id) || args+=(--user "$(id -u):$(id -g)")
[ -t 0 ] && args+=(-it)

run() { "$ENGINE" run "${args[@]}" "$IMAGE" "$@"; }
in_ci() { run bash -c "[ -d node_modules ] || npm ci; $*"; }

cmd="${1:-shell}"; [ $# -gt 0 ] && shift
case "$cmd" in
    image) build_image ;;
    shell) run bash ;;
    run)   [ $# -gt 0 ] || { echo "Uso: $0 run <comando>" >&2; exit 1; }; run "$@" ;;
    check)
        in_ci 'set -e
            cargo fmt --all --check
            npm run lint
            npx tsc --noEmit
            npx vitest run
            npm run build   # creates dist/, which the Tauri crate reads at compile time
            cargo clippy --workspace --all-targets -- -D warnings
            cargo test --workspace --exclude nurdiff' ;;
    ui) in_ci "./tools/ui-test/run.sh $*" ;;
    gui)
        [ -n "${DISPLAY:-}" ] || { echo "DISPLAY non impostato: serve una sessione X11" >&2; exit 1; }
        port="${1:-1420}"
        [[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1024 && port <= 65535 )) || { echo "Not a port: $port (1024-65535)" >&2; exit 1; }
        xauth="${XAUTHORITY:-$HOME/.Xauthority}"
        args+=(--network=host --ipc=host -v /tmp/.X11-unix:/tmp/.X11-unix
               -v "$HOME:$HOME:ro" -e DISPLAY -e GDK_BACKEND=x11 -e NO_AT_BRIDGE=1
               -e WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}")
        [ -f "$xauth" ] && args+=(-v "$xauth:/cache/Xauthority:ro" -e XAUTHORITY=/cache/Xauthority)
        [ -d /dev/dri ] && args+=(--device /dev/dri)
        # The container shares the network of the host: the port must be free there too.
        in_ci "node scripts/dev-config.mjs $port > /tmp/nurdiff-dev.json && NURDIFF_DEV_PORT=$port npm run tauri -- dev --config /tmp/nurdiff-dev.json" ;;
    *) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
