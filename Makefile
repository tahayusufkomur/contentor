.PHONY: dev down build migrate makemigrations shell test lint logs health-check seed format

dev:
	docker compose up --build

down:
	docker compose down -v

build:
	docker compose build

migrate:
	docker compose exec django python manage.py migrate_schemas

migrate-shared:
	docker compose exec django python manage.py migrate_schemas --shared

makemigrations:
	docker compose exec django python manage.py makemigrations

shell:
	docker compose exec django python manage.py shell

test:
	docker compose exec django pytest -v

test-backend:
	docker compose exec django pytest -v

lint:
	pre-commit run --all-files

logs:
	docker compose logs -f

health-check:
	@curl -sf http://localhost/api/health/ && echo "OK" || echo "FAIL"

seed:
	docker compose exec django python manage.py seed_plans

format:
	cd backend && ruff format .
	cd frontend && npx prettier --write .
