#!/usr/bin/env bash
#
# backup_db.sh — full Postgres cluster backup for the Contentor prod stack.
#
# Audit finding E (CRITICAL): all tenant schemas live on one Postgres volume
# with no backup automation. This dumps the ENTIRE cluster (all databases +
# roles/globals, i.e. every tenant schema) with pg_dumpall, gzips it, and — if
# object-store creds are present — uploads it offsite. Runs ON THE PROD HOST,
# from the stack directory (/opt/stacks/contentor).
#
# ── One-time setup on the prod box (the manual part — cannot be scripted from
#    the laptop) ──────────────────────────────────────────────────────────────
#   1. Optionally set a dedicated backup bucket in .env.prod:
#        BACKUP_S3_BUCKET=contentor-prod-backups      # else reuses AWS_BUCKET_NAME
#        BACKUP_RETAIN_DAYS=14                         # local pruning window
#   2. Ensure aws-cli is installed for the offsite step:  apt-get install -y awscli
#   3. Install the daily cron (as the deploy user):
#        crontab -e
#        # 03:30 nightly, log to the stack dir
#        30 3 * * * cd /opt/stacks/contentor && ./scripts/backup_db.sh >> backups/backup.log 2>&1
#
# Restore with:  ./scripts/restore_db.sh <dump.sql.gz>
#
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$STACK_DIR"

ENV_FILE="${ENV_FILE:-.env.prod}"
[ -f "$ENV_FILE" ] || { echo "FATAL: $ENV_FILE not found (run on the prod host, from the stack dir)"; exit 1; }

# Load POSTGRES_* and AWS_*/BACKUP_* without leaking to the wider environment.
set -a; . "./$ENV_FILE"; set +a

PG_USER="${POSTGRES_USER:-contentor}"
PG_PASS="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required in $ENV_FILE}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")

BACKUP_DIR="$STACK_DIR/backups"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/contentor-${STAMP}.sql.gz"

echo "[backup] $(date -u +%FT%TZ) dumping full cluster -> $OUT"
# -e PGPASSWORD so pg_dumpall authenticates; -T = no TTY.
"${COMPOSE[@]}" exec -T -e PGPASSWORD="$PG_PASS" postgres \
	pg_dumpall -U "$PG_USER" | gzip -9 > "$OUT"

# A valid gzip'd pg_dumpall is well over a few hundred bytes; guard truncation.
SIZE="$(wc -c < "$OUT")"
if [ "$SIZE" -lt 500 ]; then
	echo "[backup] FATAL: dump is only ${SIZE} bytes — treating as failed"; rm -f "$OUT"; exit 1
fi
echo "[backup] wrote ${SIZE} bytes"

# ── Offsite upload (best-effort; local copy is kept regardless) ───────────────
BUCKET="${BACKUP_S3_BUCKET:-${AWS_BUCKET_NAME:-}}"
if command -v aws >/dev/null 2>&1 && [ -n "$BUCKET" ] && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
	DEST="s3://${BUCKET}/db-backups/contentor-${STAMP}.sql.gz"
	echo "[backup] uploading -> $DEST"
	if aws s3 cp "$OUT" "$DEST" ${AWS_ENDPOINT:+--endpoint-url "$AWS_ENDPOINT"}; then
		echo "[backup] offsite upload OK"
	else
		echo "[backup] WARNING: offsite upload failed — local copy retained at $OUT"
	fi
else
	echo "[backup] WARNING: offsite upload skipped (need aws-cli + BACKUP_S3_BUCKET/AWS_* in $ENV_FILE). Local-only backup."
fi

# ── Local retention ───────────────────────────────────────────────────────────
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-14}"
find "$BACKUP_DIR" -name 'contentor-*.sql.gz' -type f -mtime "+${RETAIN_DAYS}" -print -delete \
	| sed 's/^/[backup] pruned /' || true

echo "[backup] done"
