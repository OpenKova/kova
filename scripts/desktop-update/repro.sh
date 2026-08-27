#!/bin/bash
# repro.sh -- reproduce desktop-update paths against a sandboxed KOVA_HOME.
#
# Nothing here touches your real ~/.kova or checkout. Each mode builds (or
# reuses) a disposable install under /tmp and drives the REAL code path --
# the actual installer, the actual orchestrator, the actual `kova update`.
#
#   repro.sh shim          shim UI only: success event after 6s
#   repro.sh shim-fail     shim UI only: error event after 6s
#   repro.sh fresh         fresh install into a sandbox KOVA_HOME
#                          (scripts/install.sh, the literal user path)
#   repro.sh behind [N]    sandbox install rewound N commits (default 25),
#                          then the posix orchestrator drives it forward --
#                          the "user who hasn't updated in a while" path
#   repro.sh error         orchestrator against a broken install (missing
#                          venv) -- exercises abort + result-file + shim error
#   repro.sh gate          linux relaunch-gate decision matrix (anchoring,
#                          sandbox preflight, opt-out fallbacks) -- asserts
#                          every outcome without touching a real install
#
# The sandbox persists between runs (~/tmp is fine to nuke): fresh reuses
# nothing, behind/error reuse the last sandbox install when present because
# a from-scratch install is minutes.
#
# npm entry points (apps/desktop/package.json):
#   npm run update:shim / update:shim:fail / update:repro:fresh /
#   update:repro:behind [-- N] / update:repro:error

set -euo pipefail

MODE="${1:-help}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SANDBOX="${KOVA_UPDATE_REPRO_HOME:-/tmp/kova-update-repro}"
SANDBOX_ROOT="$SANDBOX/kova-agent"

say() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

ensure_sandbox_install() {
  if [ -x "$SANDBOX_ROOT/venv/bin/kova" ]; then
    say "reusing sandbox install at $SANDBOX_ROOT"
    return
  fi
  say "fresh sandbox install into $SANDBOX (this takes a while)"
  rm -rf "$SANDBOX"
  mkdir -p "$SANDBOX"
  # The literal user path: install.sh against a clone of THIS checkout, so
  # the repro reproduces what you're about to ship, not origin/main.
  git clone --quiet "$REPO_ROOT" "$SANDBOX_ROOT"
  KOVA_HOME="$SANDBOX" bash "$SANDBOX_ROOT/scripts/install.sh" --non-interactive --skip-setup --kova-home "$SANDBOX"
}

case "$MODE" in
  shim)
    KOVA_SELFTEST_HOLD_SECONDS="${KOVA_SELFTEST_HOLD_SECONDS:-6}" \
      bash "$SCRIPT_DIR/posix.sh" --self-test-ui
    ;;
  shim-fail)
    KOVA_SELFTEST_FAIL=1 KOVA_SELFTEST_HOLD_SECONDS="${KOVA_SELFTEST_HOLD_SECONDS:-6}" \
      bash "$SCRIPT_DIR/posix.sh" --self-test-ui
    ;;
  fresh)
    rm -rf "$SANDBOX"
    ensure_sandbox_install
    say "fresh install OK: $("$SANDBOX_ROOT/venv/bin/kova" --version 2>/dev/null || echo '?')"
    ;;
  behind)
    N="${2:-25}"
    ensure_sandbox_install
    say "rewinding sandbox checkout $N commits"
    git -C "$SANDBOX_ROOT" fetch --quiet origin main || true
    git -C "$SANDBOX_ROOT" checkout --quiet main
    git -C "$SANDBOX_ROOT" reset --hard --quiet "HEAD~$N"
    say "sandbox now at: $(git -C "$SANDBOX_ROOT" log --oneline -1)"
    say "driving the orchestrator (watch the shim; log: $SANDBOX/logs/desktop-update-handoff.log)"
    KOVA_HOME="$SANDBOX" bash "$SCRIPT_DIR/posix.sh" \
      --install-root "$SANDBOX_ROOT" --branch main --desktop-pid 0 || true
    say "result file:"
    cat "$SANDBOX/.kova-update-result.json" 2>/dev/null || echo "(none written)"
    echo
    say "sandbox after update: $(git -C "$SANDBOX_ROOT" log --oneline -1)"
    ;;
  error)
    ensure_sandbox_install
    say "breaking the sandbox venv, then driving the orchestrator"
    mv "$SANDBOX_ROOT/venv" "$SANDBOX_ROOT/venv.hidden"
    KOVA_HOME="$SANDBOX" bash "$SCRIPT_DIR/posix.sh" \
      --install-root "$SANDBOX_ROOT" --branch main --desktop-pid 0 || true
    mv "$SANDBOX_ROOT/venv.hidden" "$SANDBOX_ROOT/venv"
    say "result file (expect ok:false, exit 3):"
    cat "$SANDBOX/.kova-update-result.json" 2>/dev/null || echo "(none written)"
    echo
    ;;
  gate)
    # Pure-decision matrix for the linux relaunch gate. Builds a fake
    # checkout layout under /tmp; --self-test-gate prints the decision and
    # exits without running an update.
    G="/tmp/kova-gate-test.$$"
    UNPACKED="$G/kova-agent/apps/desktop/release/linux-unpacked"
    mkdir -p "$UNPACKED"
    touch "$UNPACKED/kova" && chmod +x "$UNPACKED/kova"

    fails=0
    expect() { # name expected actual
      if [ "$2" = "$3" ]; then printf 'ok   %s -> %s\n' "$1" "$3"
      else printf 'FAIL %s -> %s (want %s)\n' "$1" "$3" "$2"; fails=$((fails+1)); fi
    }
    decide() { bash "$SCRIPT_DIR/posix.sh" --self-test-gate --install-root "$G/kova-agent" "$@" | cut -d: -f1; }

    expect "appimage (not under unpacked)"      skew     "$(decide --relaunch-target /opt/Kova/kova)"
    expect "sibling-prefix dir not fooled"      skew     "$(decide --relaunch-target "$UNPACKED-evil/kova")"
    expect "no chrome-sandbox (namespace)"      relaunch "$(decide --relaunch-target "$UNPACKED/kova")"

    touch "$UNPACKED/chrome-sandbox"
    expect "sandbox not root/setuid"            manual   "$(decide --relaunch-target "$UNPACKED/kova")"
    expect "opt-out: --sandbox-fallback"        relaunch "$(decide --relaunch-target "$UNPACKED/kova" --sandbox-fallback)"
    expect "opt-out: --no-sandbox launch arg"   relaunch "$(decide --relaunch-target "$UNPACKED/kova" -- --no-sandbox)"
    expect "opt-out: ELECTRON_DISABLE_SANDBOX"  relaunch "$(ELECTRON_DISABLE_SANDBOX=1 decide --relaunch-target "$UNPACKED/kova")"

    # Result JSON must survive hostile strings (git allows `"` in branch
    # names; messages carry arbitrary text) -- parse it back with python.
    QHOME="$G/qhome"; mkdir -p "$QHOME/kova-agent"
    bash "$SCRIPT_DIR/posix.sh" --no-ui --no-marker-cleanup --desktop-pid 0 \
      --install-root "$QHOME/kova-agent" --branch 'evil"branch\n$(x)' >/dev/null 2>&1 || true
    if python3 -c "import json,sys; d=json.load(open('$QHOME/.kova-update-result.json')); sys.exit(0 if d['branch']=='evil\"branch\\\\n\$(x)' and d['ok']==False else 1)"; then
      printf 'ok   result JSON escapes hostile branch/message\n'
    else
      printf 'FAIL result JSON escaping\n'; fails=$((fails+1))
    fi

    rm -rf "$G"
    [ "$fails" -eq 0 ] && say "gate matrix: all pass" || { say "gate matrix: $fails FAILED"; exit 1; }
    ;;
  launch)
    # Terminal-lifecycle matrix (gille round 2): launch acceptance is part
    # of the outcome. Each case runs the REAL orchestrator (--no-ui) against
    # a fake install whose `kova` stub exits 0 instantly, so the flow
    # reaches finish() with FINAL_CODE=0 and exercises the launch leg.
    L="/tmp/kova-launch-test.$$"
    fails=0
    expect_msg() { # name python-expr
      if python3 -c "import json,sys; d=json.load(open('$L/.kova-update-result.json')); sys.exit(0 if ($2) else 1)"; then
        printf 'ok   %s\n' "$1"
      else
        printf 'FAIL %s -> %s\n' "$1" "$(cat "$L/.kova-update-result.json" 2>/dev/null)"; fails=$((fails+1))
      fi
    }
    stub_install() { # creates a fake install whose kova update succeeds
      rm -rf "$L"; mkdir -p "$L/kova-agent/venv/bin"
      printf '#!/bin/sh\nexit 0\n' > "$L/kova-agent/venv/bin/kova"
      chmod +x "$L/kova-agent/venv/bin/kova"
    }

    # 1. linux relaunch target dies instantly -> manual downgrade in result
    stub_install
    UNPACKED="$L/kova-agent/apps/desktop/release/linux-unpacked"
    mkdir -p "$UNPACKED"
    printf '#!/bin/sh\nexit 1\n' > "$UNPACKED/kova"; chmod +x "$UNPACKED/kova"
    if [ "$(uname)" != "Darwin" ]; then
      bash "$SCRIPT_DIR/posix.sh" --no-ui --desktop-pid 0 --install-root "$L/kova-agent" \
        --relaunch-target "$UNPACKED/kova" >/dev/null 2>&1 || true
      expect_msg "instant-exit relaunch downgrades to manual" "d['ok']==True and d['manual']==True and 'Reopen Kova' in d['message']"
    else
      # mac: a SUPPLIED target that is missing is a REJECTED launch and
      # must downgrade to manual — never a clean "Update complete."
      bash "$SCRIPT_DIR/posix.sh" --no-ui --desktop-pid 0 --install-root "$L/kova-agent" \
        --relaunch-target "$L/NoSuch.app" >/dev/null 2>&1 || true
      expect_msg "missing bundle downgrades to manual" "d['ok']==True and d['manual']==True and 'Reopen Kova' in d['message']"
    fi

    # 2. gated skew: success result carries the skew message (the manual
    #    event's payload), never a bare "Update complete."
    stub_install
    bash "$SCRIPT_DIR/posix.sh" --no-ui --desktop-pid 0 --install-root "$L/kova-agent" \
      --relaunch-target /opt/Kova/kova >/dev/null 2>&1 || true
    if [ "$(uname)" != "Darwin" ]; then
      expect_msg "skew outcome surfaces in result message" "d['ok']==True and d['manual']==True and 'was not changed' in d['message']"
    fi

    rm -rf "$L"
    [ "$fails" -eq 0 ] && say "launch matrix: all pass" || { say "launch matrix: $fails FAILED"; exit 1; }
    ;;
  *)
    sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
    exit 64
    ;;
esac
