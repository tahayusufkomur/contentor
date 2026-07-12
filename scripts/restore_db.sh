#!/usr/bin/env bash
#
# restore_db.sh — restore a full Contentor Postgres cluster from a backup made
# by backup_db.sh. DESTRUCTIVE: replays a pg_dumpall dump into the running
# postgres container, overwriting current cluster contents. Runs ON THE PROD
# HOST from the stack directory.
#
# Usage:
#   ./scripts/restore_db.sh backups/contentor-YYYYMMDDTHHMMSSZ.sql.gz
#   ./scripts/restore_db.sh s3://<bucket>/db-backups/contentor-...sql.gz   # fetch first
#
# Recommended drill (verify a backup restores WITHOUT touching prod):
#   1. Copy the dump to a scratch box / laptop with the dev stack.
#   2. `make down && make dev` to get a clean empty postgres.
#   3. ENV_FILE=.env ./scripts/restore_db.sh <dump.sql.gz>
#   4. Diff row counts vs. the source (e.g. SELECT count(*) per key table).
#
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$STACK_DIR"

SRC="${1:?usage: restore_db.sh <dump.sql.gz | s3://.../dump.sql.gz>}"
ENV_FILE="${ENV_FILE:-.env.prod}"
[ -f "$ENV_FILE" ] || { echo "FATAL: $ENV_FILE not found"; exit 1; }
set -a; . "./$ENV_FILE"; set +a

PG_USER="${POSTGRES_USER:-contentor}"
PG_PASS="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required in $ENV_FILE}"
# Prod uses docker-compose.prod.yml; dev drills use ENV_FILE=.env (default compose).
if [ "$ENV_FILE" = ".env.prod" ]; then
	COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")
else
	COMPOSE=(docker compose --env-file "$ENV_FILE")
fi

# Fetch from object store if an s3:// URI was given.
LOCAL="$SRC"
if [[ "$SRC" == s3://* ]]; then
	command -v aws >/dev/null 2>&1 || { echo "FATAL: aws-cli required to fetch $SRC"; exit 1; }
	LOCAL="$(mktemp /tmp/contentor-restore.XXXXXX.sql.gz)"
	echo "[restore] fetching $SRC -> $LOCAL"
	aws s3 cp "$SRC" "$LOCAL" ${AWS_ENDPOINT:+--endpoint-url "$AWS_ENDPOINT"}
fi
[ -f "$LOCAL" ] || { echo "FATAL: dump not found: $LOCAL"; exit 1; }

echo "!!  This OVERWRITES the '$ENV_FILE' Postgres cluster with $LOCAL"
read -r -p '!!  Type RESTORE to proceed: ' CONFIRM
[ "$CONFIRM" = "RESTORE" ] || { echo "[restore] aborted"; exit 1; }

echo "[restore] replaying dump…"
# pg_dumpall output is plain SQL incl. CREATE ROLE/DATABASE + \connect; pipe to
# psql on the maintenance DB. ON_ERROR_STOP surfaces failures instead of a
# half-restored cluster.
gunzip -c "$LOCAL" | "${COMPOSE[@]}" exec -T -e PGPASSWORD="$PG_PASS" postgres \
	psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d postgres

echo "[restore] done — restart app containers so they reconnect:"
echo "          ${COMPOSE[*]} restart django celery-worker celery-beat"
