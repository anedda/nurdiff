#!/usr/bin/env bash
# Builds the UI, serves it locally and runs the test in Chromium. From the project root: ./tools/ui-test/run.sh
# Requires: Node, Python 3 with Playwright (`pip install playwright && playwright install chromium`).
set -euo pipefail
cd "$(dirname "$0")/../.."
npm run build >/dev/null
# The real answers of the core: the page reads them from /fixtures/<name>.json
mkdir -p dist/fixtures
for f in tools/ui-test/fixtures/*.json.gz; do gunzip -c "$f" > "dist/fixtures/$(basename "$f" .gz)"; done
npx vite preview --port 4173 >/tmp/nurdiff-preview.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -s localhost:4173 >/dev/null && break; sleep 0.5; done
python3 tools/ui-test/ui_test.py "$@"
