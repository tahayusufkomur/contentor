#!/bin/bash
set -e

echo "Waiting for database..."
python manage.py wait_for_db

# Only run migrations for server commands, not for management commands
if [[ "$1" == "gunicorn" ]] || [[ "$1" == "daphne" ]] || [[ "$1" == "celery" ]]; then
    echo "Running shared schema migrations..."
    python manage.py migrate_schemas --shared --verbosity 0

    echo "Seeding default data..."
    python manage.py seed_plans
fi

echo "Starting: $@"
exec "$@"
