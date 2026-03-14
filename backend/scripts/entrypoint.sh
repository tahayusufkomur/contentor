#!/bin/bash
set -e

echo "Waiting for database..."
python manage.py wait_for_db

echo "Running shared schema migrations..."
python manage.py migrate_schemas --shared --verbosity 0

echo "Starting: $@"
exec "$@"
