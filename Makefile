.PHONY: help dev dev-reset down build restart reset migrate migrate-shared makemigrations shell test test-backend lint logs health-check seed seed-demo-assets seed-demos seed-demos-force format stripe-listen deploy prod-build prod-config flowmap flowmap-register flowmap-show e2e e2e-stripe

PROD_COMPOSE = docker compose -f docker-compose.prod.yml --env-file .env.prod

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
	@grep -E '^(migrate|migrate-shared|makemigrations|seed|seed-demos|seed-demos-force):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- Quality ---\033[0m"
	@grep -E '^(test|test-backend|lint|format):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- Utilities ---\033[0m"
	@grep -E '^(shell|health-check):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- Deploy ---\033[0m"
	@grep -E '^(deploy|prod-build|prod-config):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- E2E ---\033[0m"
	@grep -E '^(e2e|e2e-stripe):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
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

seed-demo-assets: ## Mirror real demo/* media from the prod bucket into dev MinIO (host-run, needs .env.prod)
	python3 scripts/mirror_demo_assets.py

seed-demos: seed-demo-assets ## Seed read-only marketing demo tenants for all niches
	docker compose exec django python manage.py seed_all_demos

seed-demos-force: seed-demo-assets ## Recreate all demo tenants from scratch
	docker compose exec django python manage.py seed_all_demos --force

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

# ============================================================================
# Stripe
# ============================================================================

stripe-listen: ## Forward Stripe test-mode events to local /api/webhooks/stripe/ (incl. Connect account events via --forward-connect-to)
	@command -v stripe >/dev/null 2>&1 || { \
		echo "Stripe CLI not installed. Install with: brew install stripe/stripe-cli/stripe"; \
		exit 1; \
	}
	stripe listen \
		--api-key "$$(grep -E '^STRIPE_SECRET_KEY=' .env | cut -d= -f2)" \
		--forward-to http://localhost/api/webhooks/stripe/ \
		--forward-connect-to http://localhost/api/webhooks/stripe/

# ============================================================================
# Deploy (prod runs remotely on the home server via deploy.sh)
# ============================================================================

deploy: ## Deploy contentor to the home server (rsync + build + up + health)
	cd ~/ws/home-server && ./deploy.sh contentor

prod-build: ## Build the prod images locally (catches prod build breaks; no network needed)
	$(PROD_COMPOSE) build

prod-config: ## Validate the prod compose + .env.prod interpolation
	$(PROD_COMPOSE) config >/dev/null && echo "prod compose OK"

# ============================================================================
# Flowmap — local flow-visualization tool (tools/flowmap)
# ============================================================================

flowmap: ## Serve the flow visualizer at http://localhost:7878
	cd tools/flowmap && npm install --silent && node --experimental-sqlite server.js

flowmap-register: ## Crawl, identify flows via Claude, and fill the flowmap DB (use ARGS=--reset to wipe first)
	cd tools/flowmap && npm install --silent && npx playwright install chromium && node --experimental-sqlite register.js $(ARGS)

flowmap-show: ## Print registered flows as text (ARGS=screens lists screen keys; ARGS=<id> dumps one flow)
	cd tools/flowmap && node --experimental-sqlite query.js $(ARGS)

# ============================================================================
# E2E — Playwright end-to-end tests (e2e/)
# ============================================================================

e2e: ## Run the local Playwright e2e suite (Stripe specs auto-skip)
	cd e2e && npm install --silent && npx playwright install chromium && npx playwright test

e2e-stripe: ## e2e incl. real Stripe test-mode specs (needs sk_test keys in .env + `make stripe-listen` running)
	cd e2e && npm install --silent && npx playwright install chromium && STRIPE_E2E=1 npx playwright test
