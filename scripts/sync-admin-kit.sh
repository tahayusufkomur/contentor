#!/usr/bin/env bash
# Mirror the shared admin-kit from its canonical home (frontend-customer) into
# frontend-main. The two Next.js apps are built independently (separate Docker
# contexts), so the kit is vendored rather than packaged; this script keeps the
# copies byte-identical.
#
#   scripts/sync-admin-kit.sh          # copy canonical -> frontend-main
#   scripts/sync-admin-kit.sh --check  # exit 1 if the copies have drifted
set -euo pipefail

cd "$(dirname "$0")/.."

DIRS=(
  "src/lib/admin-kit"
  "src/components/admin-kit"
)

if [[ "${1:-}" == "--check" ]]; then
  status=0
  for dir in "${DIRS[@]}"; do
    if ! diff -r "frontend-customer/$dir" "frontend-main/$dir" >/dev/null 2>&1; then
      echo "DRIFT: $dir differs between frontend-customer (canonical) and frontend-main"
      diff -rq "frontend-customer/$dir" "frontend-main/$dir" || true
      status=1
    fi
  done
  [[ $status -eq 0 ]] && echo "admin-kit copies are in sync"
  exit $status
fi

for dir in "${DIRS[@]}"; do
  mkdir -p "frontend-main/$dir"
  rsync -a --delete "frontend-customer/$dir/" "frontend-main/$dir/"
  echo "synced $dir"
done
