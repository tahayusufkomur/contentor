#!/bin/bash
set -e

echo "Waiting for database..."
python manage.py wait_for_db

# Only run migrations from the main gunicorn process to avoid race conditions
if [[ "$1" == "gunicorn" ]]; then
    echo "Running shared schema migrations..."
    python manage.py migrate_schemas --shared --verbosity 0

    # Tenant rows can exist without their Postgres schema (Tenant.auto_create_schema
    # = False), e.g. a half-provisioned/failed signup. `migrate_schemas --tenant`
    # would then set search_path to a non-existent schema and abort the whole deploy
    # with "no schema has been selected to create in" (Postgres 3F000). Materialize
    # any missing schemas first so the tenant migrate can't trip on an orphan row.
    echo "Creating any missing tenant schemas..."
    python manage.py create_missing_schemas --verbosity 0

    echo "Running tenant schema migrations..."
    python manage.py migrate_schemas --tenant --verbosity 0

    echo "Collecting static files..."
    python manage.py collectstatic --noinput --verbosity 0

    echo "Seeding default data..."
    python manage.py seed_plans
fi

echo "Starting: $@"
exec "$@"
