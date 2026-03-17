#!/bin/bash
set -e

echo "Waiting for database..."
python manage.py wait_for_db

# Only run migrations from the main gunicorn process to avoid race conditions
if [[ "$1" == "gunicorn" ]]; then
    echo "Running shared schema migrations..."
    python manage.py migrate_schemas --shared --verbosity 0

    echo "Collecting static files..."
    python manage.py collectstatic --noinput --verbosity 0

    echo "Seeding default data..."
    python manage.py seed_plans
fi

echo "Starting: $@"
exec "$@"
