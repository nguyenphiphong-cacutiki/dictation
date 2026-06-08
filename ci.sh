#!/usr/bin/env bash
# Local CI simulation — mirrors .github/workflows/ci.yml exactly.
# Run this after every code change before pushing.
# Usage: ./ci.sh [section]
#   sections: backend-security, backend-lint, backend-test,
#             frontend-audit, frontend-lint, frontend-test, frontend-build,
#             terraform-fmt
#   No argument runs all sections in order.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
TERRAFORM="$ROOT/terraform"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

FAILURES=()

run_section() {
  local name="$1"
  local fn="$2"
  echo -e "\n${CYAN}${BOLD}=== $name ===${RESET}"
  if $fn; then
    echo -e "${GREEN}✔ $name passed${RESET}"
  else
    echo -e "${RED}✘ $name FAILED${RESET}"
    FAILURES+=("$name")
  fi
}

# ── Backend security ──────────────────────────────────────────────────────────

section_backend_security() {
  pip install pip-audit bandit --quiet
  echo "→ pip-audit"
  pip-audit -r "$BACKEND/requirements.txt"
  echo "→ bandit"
  bandit -r "$BACKEND/" -x "$BACKEND/tests,$BACKEND/dist" -ll
}

# ── Backend lint ──────────────────────────────────────────────────────────────

section_backend_lint() {
  pip install ruff --quiet
  echo "→ ruff"
  ruff check "$BACKEND/"
}

# ── Backend tests ─────────────────────────────────────────────────────────────

section_backend_test() {
  pip install pytest pytest-cov PyJWT boto3 --quiet
  echo "→ pytest"
  python -m pytest "$BACKEND/tests/" -v --tb=short \
    --cov="$BACKEND" --cov-report=term-missing
}

# ── Frontend audit ────────────────────────────────────────────────────────────

section_frontend_audit() {
  echo "→ npm ci"
  (cd "$FRONTEND" && npm ci)
  echo "→ npm audit"
  (cd "$FRONTEND" && npm audit --audit-level=high)
}

# ── Frontend lint ─────────────────────────────────────────────────────────────

section_frontend_lint() {
  (cd "$FRONTEND" && npm ci --silent)
  echo "→ eslint"
  (cd "$FRONTEND" && npm run lint)
}

# ── Frontend tests ────────────────────────────────────────────────────────────

section_frontend_test() {
  (cd "$FRONTEND" && npm ci --silent)
  echo "→ vitest"
  (cd "$FRONTEND" && npm test)
}

# ── Frontend build ────────────────────────────────────────────────────────────

section_frontend_build() {
  (cd "$FRONTEND" && npm ci --silent)
  echo "→ vite build"
  (cd "$FRONTEND" && VITE_API_URL=/api npm run build)
}

# ── Terraform format ──────────────────────────────────────────────────────────

section_terraform_fmt() {
  echo "→ terraform fmt -check"
  terraform fmt -check -recursive "$TERRAFORM/"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

SECTION="${1:-all}"

case "$SECTION" in
  backend-security)  section_backend_security ;;
  backend-lint)      section_backend_lint ;;
  backend-test)      section_backend_test ;;
  frontend-audit)    section_frontend_audit ;;
  frontend-lint)     section_frontend_lint ;;
  frontend-test)     section_frontend_test ;;
  frontend-build)    section_frontend_build ;;
  terraform-fmt)     section_terraform_fmt ;;
  all)
    run_section "backend-security" section_backend_security
    run_section "backend-lint"     section_backend_lint
    run_section "backend-test"     section_backend_test
    run_section "frontend-audit"   section_frontend_audit
    run_section "frontend-lint"    section_frontend_lint
    run_section "frontend-test"    section_frontend_test
    run_section "frontend-build"   section_frontend_build
    run_section "terraform-fmt"    section_terraform_fmt

    echo ""
    if [ ${#FAILURES[@]} -eq 0 ]; then
      echo -e "${GREEN}${BOLD}All CI checks passed.${RESET}"
    else
      echo -e "${RED}${BOLD}Failed sections:${RESET}"
      for f in "${FAILURES[@]}"; do
        echo -e "  ${RED}✘ $f${RESET}"
      done
      exit 1
    fi
    ;;
  *)
    echo "Unknown section: $SECTION"
    echo "Valid sections: backend-security backend-lint backend-test frontend-audit frontend-lint frontend-test frontend-build terraform-fmt"
    exit 1
    ;;
esac
