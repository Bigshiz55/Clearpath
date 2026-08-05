#!/usr/bin/env bash
# Every gate, in order, with the REAL exit code.
#
# WHY THIS EXISTS
# The suite was reported green while 159 browser tests were failing. Two
# separate ways to lie were in play:
#   1. `npm run test:mobile 2>&1 | tail -40` — the pipeline's exit status is
#      tail's, not Playwright's, so a failing run exits 0. Without pipefail a
#      pipe cannot fail.
#   2. Reading a truncated tail and seeing "910 passed" without noticing the
#      failure list scrolled past.
# Both are fixed by never piping a gate and always propagating its status.
set -Eeuo pipefail

fail=0
run() {
  local name="$1"; shift
  echo "── $name ─────────────────────────────────────────────"
  if "$@"; then
    echo "✔ $name"
  else
    local code=$?
    echo "✘ $name (exit $code)"
    fail=1
  fi
}

run "schema contract" npm run check:schema
run "migrations registered" npm run check:migrations
run "typecheck" npm run typecheck
run "lint" npm run lint
run "unit tests" npm test
run "build" npm run build
if [ "${SKIP_BROWSER:-}" != "1" ]; then
  run "browser tests" npm run test:mobile
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "GATES FAILED — do not call this green."
  exit 1
fi
echo "All gates passed."
