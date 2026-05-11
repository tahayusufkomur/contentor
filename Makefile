.PHONY: help dev dev-reset down build restart reset migrate migrate-shared makemigrations shell test test-backend lint logs health-check seed format

# ============================================================================
# Help
# ============================================================================

help: ## Show this help
	@echo ""
	@echo "\033[1mUsage:\033[0m make <target>"
	@echo ""
	@echo "\033[1;33m--- Docker ---\033[0m"
	@grep -E '^(dev|dev-reset|down|build|restart|reset|logs):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- Database ---\033[0m"
	@grep -E '^(migrate|migrate-shared|makemigrations|seed):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- Quality ---\033[0m"
	@grep -E '^(test|test-backend|lint|format):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- Utilities ---\033[0m"
	@grep -E '^(shell|health-check):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ============================================================================
# Docker
# ============================================================================

dev: ## Start all services with hot-reload
	docker compose up --build

down: ## Stop all services and remove volumes
	docker compose down -v

build: ## Build all Docker images
	docker compose build

restart: ## Full restart — stop, rebuild images, start fresh
	docker compose down
	docker compose up --build -d

reset: ## Nuclear reset — wipe all volumes (DB, Redis) and rebuild
	docker compose down -v
	docker compose up --build -d

dev-reset: ## Reset caches, volumes, and .next builds — then start fresh
	docker compose down -v
	rm -rf frontend-customer/.next frontend-main/.next
	docker compose up --build

logs: ## Tail logs from all services
	docker compose logs -f

# ============================================================================
# Database
# ============================================================================

migrate: ## Run all schema migrations
	docker compose exec django python manage.py migrate_schemas

migrate-shared: ## Run shared (public) schema migrations only
	docker compose exec django python manage.py migrate_schemas --shared

makemigrations: ## Generate new migration files
	docker compose exec django python manage.py makemigrations

seed: ## Seed plans, public tenant, and superusers
	docker compose exec django python manage.py seed_plans

# ============================================================================
# Quality
# ============================================================================

test: ## Run all backend tests
	docker compose exec django pytest -v

test-backend: ## Run backend tests (alias for test)
	docker compose exec django pytest -v

lint: ## Run all linters via pre-commit
	pre-commit run --all-files
	@$(MAKE) check-i18n

check-i18n: ## Verify EN and TR catalogs have identical keys
	node scripts/check-i18n-parity.mjs

format: ## Auto-format backend (ruff) and frontend (prettier)
	cd backend && ruff format .
	cd frontend-customer && npx prettier --write .
	cd frontend-main && npx prettier --write .

# ============================================================================
# Utilities
# ============================================================================

shell: ## Open Django shell
	docker compose exec django python manage.py shell

health-check: ## Check if the API is healthy
	@curl -sf http://localhost/api/health/ && echo "OK" || echo "FAIL"
