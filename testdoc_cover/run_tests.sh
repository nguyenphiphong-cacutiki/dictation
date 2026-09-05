#!/usr/bin/env bash
# Runs the full testdoc_cover suite (backend + frontend), fully offline.
# Usage: ./testdoc_cover/run_tests.sh [backend|frontend|all]
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SELF")"

run_backend() {
  echo "=== testdoc_cover: backend (pytest) ==="
  python3 -m pytest "$SELF/testcase/backend" -q
}

run_frontend() {
  echo "=== testdoc_cover: frontend (vitest) ==="
  # Test files live outside frontend/, so npm packages resolve through this symlink.
  if [ ! -e "$SELF/testcase/frontend/node_modules" ]; then
    ln -sfn ../../../frontend/node_modules "$SELF/testcase/frontend/node_modules"
  fi
  (cd "$ROOT/frontend" && npx vitest run --config "$SELF/testcase/frontend/vitest.config.mjs")
}

case "${1:-all}" in
  backend)  run_backend ;;
  frontend) run_frontend ;;
  all)      run_backend && run_frontend ;;
  *)        echo "Usage: $0 [backend|frontend|all]"; exit 1 ;;
esac
