#!/usr/bin/env bash
# Builds NurDiff in a container (Podman or Docker) and exports the results to ./out
# It uses Podman if present, otherwise Docker. To force it: ENGINE=docker ./scripts/build-linux.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ENGINE="${ENGINE:-$(command -v podman || command -v docker || true)}"
if [ -z "$ENGINE" ]; then
    echo "Né podman né docker trovati nel PATH" >&2
    exit 1
fi
IMAGE=nurdiff-build
CONTAINER=nurdiff-export

cleanup() { "$ENGINE" rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Motore: $ENGINE"

echo "==> Test di core e CLI"
"$ENGINE" build --target test .

# The commit (with "*" if there are uncommitted changes) for "About": there is no .git in the container
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || true)"
if [ -n "$COMMIT" ] && [ -n "$(git status --porcelain 2>/dev/null)" ]; then COMMIT="$COMMIT*"; fi

echo "==> Build dell'app e della CLI (commit: ${COMMIT:-sconosciuto})"
"$ENGINE" build --target build --build-arg "NURDIFF_COMMIT=$COMMIT" -t "$IMAGE" .

echo "==> Copia dei risultati in ./out"
rm -rf out
mkdir out
cleanup
"$ENGINE" create --name "$CONTAINER" "$IMAGE" /bin/true >/dev/null
"$ENGINE" cp "$CONTAINER:/out/." out/

echo
echo "Fatto. Risultati in ./out:"
find out -maxdepth 3 -type f \( -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' -o -name 'nurdiff-cli' -o -name 'nurdiff' \) | sort
