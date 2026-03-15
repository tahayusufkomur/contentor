.PHONY: help dev down build migrate makemigrations shell test lint logs health-check seed format

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Start all services with hot-reload
	docker compose up --build

down: ## Stop all services and remove volumes
	docker compose down -v

build: ## Build all Docker images
	docker compose build

migrate: ## Run all schema migrations
	docker compose exec django python manage.py migrate_schemas

migrate-shared: ## Run shared (public) schema migrations only
	docker compose exec django python manage.py migrate_schemas --shared

makemigrations: ## Generate new migration files
	docker compose exec django python manage.py makemigrations

shell: ## Open Django shell
	docker compose exec django python manage.py shell

test: ## Run all backend tests
	docker compose exec django pytest -v

test-backend: ## Run backend tests (alias for test)
	docker compose exec django pytest -v

lint: ## Run all linters via pre-commit
	pre-commit run --all-files

logs: ## Tail logs from all services
	docker compose logs -f

health-check: ## Check if the API is healthy
	@curl -sf http://localhost/api/health/ && echo "OK" || echo "FAIL"

seed: ## Seed default plans and public tenant
	docker compose exec django python manage.py seed_plans

format: ## Auto-format backend (ruff) and frontend (prettier)
	cd backend && ruff format .
	cd frontend && npx prettier --write .
