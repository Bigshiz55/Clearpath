#!/usr/bin/env bash
# Hardened, non-interactive verification runner. Every step is a SEPARATE command
# with a hard wall-clock timeout, so a hang is isolated (never open-ended) and the
# exact stalling step is identifiable. The Playwright dev server is started in the
# background, waited on with a bounded readiness check, and ALWAYS torn down on exit
# (even on failure) so nothing is ever orphaned. No watch mode anywhere.
set -u
cd "$(dirname "$0")/.."

PORT=3210
HARNESS_URL="http://127.0.0.1:${PORT}/dev/responsive"
SERVER_PID=""
declare -a ROWS=()

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo ">> tearing down harness server (process group ${SERVER_PID})"
    kill -TERM -- "-${SERVER_PID}" 2>/dev/null || kill -TERM "${SERVER_PID}" 2>/dev/null || true
    sleep 2
    kill -KILL -- "-${SERVER_PID}" 2>/dev/null || kill -KILL "${SERVER_PID}" 2>/dev/null || true
  fi
  # Belt-and-suspenders: whatever is still bound to our port (next-server can
  # double-fork out of the killed group) is a stale server — remove it precisely.
  kill_port_server
}
trap cleanup EXIT INT TERM

# run_step <label> <timeout_seconds> <command...>
run_step() {
  local label="$1"; local tmo="$2"; shift 2
  local start end dur code
  start=$(date +%s)
  echo "──────────────────────────────────────────────────────────────"
  echo ">> ${label}  |  start $(date -u +%H:%M:%SZ)  |  timeout ${tmo}s"
  timeout --kill-after=10s "${tmo}" "$@"
  code=$?
  end=$(date +%s); dur=$((end - start))
  if [ "${code}" -eq 124 ] || [ "${code}" -eq 137 ]; then
    echo "!! ${label} STALLED — exceeded ${tmo}s (exit ${code}); killed."
    ROWS+=("${label}|TIMEOUT(${tmo}s)|${dur}s|${code}")
  elif [ "${code}" -eq 0 ]; then
    echo ">> ${label}  |  done $(date -u +%H:%M:%SZ)  |  exit 0  |  ${dur}s"
    ROWS+=("${label}|PASS|${dur}s|0")
  else
    echo "!! ${label} FAILED  |  exit ${code}  |  ${dur}s"
    ROWS+=("${label}|FAIL|${dur}s|${code}")
  fi
  return "${code}"
}

# Self-healing: a prior run that was hard-killed (SIGKILL runs no traps) can leave a
# server on our port. Sweep it BEFORE we start so we never inherit an orphan.
# PRECISE: only kill a process actually BOUND to our port whose command is a
# node/next server — never anything in this script's own toolchain (npm/bash/tsc).
kill_port_server() {
  local pids pid cmd
  pids=$(ss -ltnpH "sport = :${PORT}" 2>/dev/null | grep -oE 'pid=[0-9]+' | grep -oE '[0-9]+' | sort -u)
  for pid in $pids; do
    [ "$pid" = "$$" ] && continue
    cmd=$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null || true)
    case "$cmd" in
      *next*|*node*) echo ">> killing server on :${PORT} pid ${pid} (${cmd:0:60})"; kill -9 "$pid" 2>/dev/null || true;;
    esac
  done
}
presweep() { echo ">> pre-sweep: checking port ${PORT}"; kill_port_server; }

wait_ready() {
  local tries=0 max=40 # 40 x 2s = 80s ceiling
  echo ">> waiting for ${HARNESS_URL} (bounded ${max}x2s)"
  while [ "${tries}" -lt "${max}" ]; do
    if curl -sf --max-time 3 "${HARNESS_URL}" -o /dev/null 2>/dev/null; then
      echo ">> harness ready after $((tries * 2))s"; return 0
    fi
    tries=$((tries + 1)); sleep 2
  done
  echo "!! harness NOT ready after $((max * 2))s at ${HARNESS_URL}"; return 1
}

presweep

# ── 1) lint ──────────────────────────────────────────────────────────────────
run_step "lint" 180 npm run lint

# ── 2) typecheck ─────────────────────────────────────────────────────────────
run_step "typecheck" 180 npm run typecheck

# ── 3) unit tests (run mode — NOT watch) ─────────────────────────────────────
run_step "unit-tests" 240 npx vitest run

# ── 4) production build ──────────────────────────────────────────────────────
run_step "build" 300 npm run build
BUILD_OK=$?

# ── 5+6) Playwright: start server in background, bounded wait, always kill ────
if [ "${BUILD_OK}" -eq 0 ]; then
  echo ">> starting harness server in background (setsid, own process group)"
  RESPONSIVE_HARNESS=1 PORT=${PORT} setsid npm start >/tmp/harness.log 2>&1 &
  SERVER_PID=$!
  if wait_ready; then
    run_step "playwright-quickstart" 120 npx playwright test tests/responsive/quickstart.spec.ts --reporter=list
    run_step "mobile-390-chip-tap" 120 npx playwright test tests/responsive/quickstart.spec.ts -g "390px" --reporter=list
  else
    echo "!! server never became ready — see /tmp/harness.log tail:"; tail -20 /tmp/harness.log || true
    ROWS+=("playwright-quickstart|BLOCKED(server)|0s|-")
    ROWS+=("mobile-390-chip-tap|BLOCKED(server)|0s|-")
  fi
else
  ROWS+=("playwright-quickstart|SKIPPED(build failed)|0s|-")
  ROWS+=("mobile-390-chip-tap|SKIPPED(build failed)|0s|-")
fi

# ── verification table ───────────────────────────────────────────────────────
echo ""
echo "══════════════════════ VERIFICATION TABLE ══════════════════════"
printf "%-24s %-22s %-10s %-6s\n" "STEP" "RESULT" "DURATION" "EXIT"
printf "%-24s %-22s %-10s %-6s\n" "------------------------" "----------------------" "----------" "------"
for r in "${ROWS[@]}"; do
  IFS='|' read -r n s d c <<< "$r"
  printf "%-24s %-22s %-10s %-6s\n" "$n" "$s" "$d" "$c"
done
echo "════════════════════════════════════════════════════════════════"
