#!/usr/bin/env bash
# Background GitNexus wiki refresh, fired by .git/hooks/post-commit and post-merge
# (shims installed by scripts/install-git-hooks.sh).
# Debounced: at most one refresh per WIKI_REFRESH_DEBOUNCE_MIN (default 360 = 6h),
# because each refresh spends LLM tokens. Fully detached — commits never wait on it.
# Output: .gitnexus/wiki-refresh.log
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEBOUNCE_MIN="${WIKI_REFRESH_DEBOUNCE_MIN:-360}"
WIKI_REFRESH_CMD="${WIKI_REFRESH_CMD:-make wiki}"
GITNEXUS_DIR="$REPO_ROOT/.gitnexus"
STAMP="$GITNEXUS_DIR/.wiki-last-refresh"
LOCK="$GITNEXUS_DIR/.wiki-refresh.lock"
LOG="$GITNEXUS_DIR/wiki-refresh.log"

[ -f "$GITNEXUS_DIR/run.cjs" ] || exit 0  # this checkout has no GitNexus index
if [ -f "$STAMP" ] && [ -n "$(find "$STAMP" -mmin "-$DEBOUNCE_MIN" 2>/dev/null)" ]; then
  exit 0  # refreshed recently
fi
if [ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
  rmdir "$LOCK" 2>/dev/null  # reclaim stale lock after a crash/reboot
fi
mkdir "$LOCK" 2>/dev/null || exit 0  # a refresh is already in flight
touch "$STAMP"  # debounce attempts, not successes — a failing refresh must not retry every commit

REPO_ROOT="$REPO_ROOT" LOG="$LOG" LOCK="$LOCK" WIKI_REFRESH_CMD="$WIKI_REFRESH_CMD" \
nohup bash -c '
  cd "$REPO_ROOT" || exit 0
  {
    echo "=== wiki refresh started $(date) @ $(git rev-parse --short HEAD) ==="
    $WIKI_REFRESH_CMD
    echo "=== wiki refresh finished (exit $?) $(date) ==="
  } >> "$LOG" 2>&1
  rmdir "$LOCK" 2>/dev/null
' >/dev/null 2>&1 &
exit 0
