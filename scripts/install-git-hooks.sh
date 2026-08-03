#!/usr/bin/env bash
# Install the repo's git hook shims into .git/hooks (run once per fresh clone).
# Currently: post-commit + post-merge -> scripts/refresh-wiki.sh (background wiki refresh).
set -eu
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="$(cd "$REPO_ROOT" && git rev-parse --git-path hooks)"
cd "$REPO_ROOT"

for hook in post-commit post-merge; do
  cat > "$HOOKS_DIR/$hook" <<'SHIM'
#!/usr/bin/env bash
# Installed by scripts/install-git-hooks.sh — edit scripts/refresh-wiki.sh instead.
"$(git rev-parse --show-toplevel)/scripts/refresh-wiki.sh" || true
SHIM
  chmod +x "$HOOKS_DIR/$hook"
  echo "installed $HOOKS_DIR/$hook"
done
