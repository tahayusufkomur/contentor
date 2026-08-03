.PHONY: help dev dev-reset down build restart reset migrate migrate-shared makemigrations shell test test-backend test-app test-frontend test-fresh typecheck typecheck-backend lint logs health-check ai-check seed seed-demo-assets format stripe-listen deploy prod-build prod-config e2e e2e-stripe e2e-spec test-changed e2e-changed wiki wiki-sync

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
	@grep -E '^(migrate|migrate-shared|makemigrations|seed):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- Quality ---\033[0m"
	@grep -E '^(test|test-backend|test-app|test-changed|test-frontend|test-fresh|typecheck|typecheck-backend|lint|format):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- Utilities ---\033[0m"
	@grep -E '^(shell|health-check|wiki|wiki-sync):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- Deploy ---\033[0m"
	@grep -E '^(deploy|prod-build|prod-config):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "\033[1;33m--- E2E ---\033[0m"
	@grep -E '^(e2e|e2e-stripe|e2e-spec|e2e-changed):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ============================================================================
# Docker
# ============================================================================

dev: ## Start all services with hot-reload
	docker compose up -d --wait minio
	python3 scripts/mirror_demo_assets.py
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
	docker compose up -d --wait minio
	python3 scripts/mirror_demo_assets.py
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

seed: ## Seed plans, public tenant, superusers, 3 dev tenants, and the curated logo catalog
	docker compose exec django python manage.py seed_plans
	docker compose exec django python manage.py seed_dev_tenants --force
	docker compose exec django python manage.py seed_curated_logos

seed-demo-assets: ## Mirror real demo/* media from the prod bucket into dev MinIO (host-run, needs .env.prod)
	python3 scripts/mirror_demo_assets.py


capture-wizard-mockups: seed-demo-assets ## Capture per-niche wizard screenshots (needs make dev running; ARGS="--niche belly_dance" for one niche)
	cd tools/wizard-mockups && npm install --silent && npx playwright install chromium && npm run capture -- $(ARGS)


# ============================================================================
# Quality
# ============================================================================

test: ## Run all backend tests (parallel, reuses test DB)
	docker compose exec django pytest -n auto

test-backend: ## Run backend tests (alias for test)
	docker compose exec django pytest -n auto

test-fresh: ## Rebuild the test DB, then run tests (use after new migrations)
	docker compose exec django pytest -n auto --create-db

test-app: ## Run one backend app's tests: make test-app APP=billing
	@test -n "$(APP)" || { echo "usage: make test-app APP=<app-name>  (e.g. APP=billing)"; exit 1; }
	docker compose exec django pytest apps/$(APP) -n auto

test-changed: ## Run only tests affected by the git diff (BASE=<ref> to widen, PLAN=1 to preview)
	python3 scripts/select_tests.py --mode backend $(if $(BASE),--base $(BASE),) $(if $(PLAN),--plan,)

test-frontend: ## Run both frontends' unit tests (vitest)
	cd frontend-customer && npx vitest run
	cd frontend-main && npx vitest run

typecheck: ## Typecheck both Next.js apps (tsc --noEmit; covers packages/shared via imports)
	# Runs inside the containers: packages/shared has no node_modules ancestor
	# on the host, only under the /node_modules symlink each Dockerfile sets up.
	docker compose exec nextjs-main npm run typecheck
	docker compose exec nextjs-customer npm run typecheck

typecheck-backend: ## Advisory mypy run (config in backend/pyproject.toml; not yet a gate)
	-docker compose exec django mypy apps --config-file pyproject.toml

lint: ## Run all linters via pre-commit, then i18n parity, loading-pattern check, selector self-test, and TS typecheck
	pre-commit run --all-files
	@$(MAKE) check-i18n
	node scripts/check-loading-patterns.mjs
	python3 scripts/select_tests.py --self-test
	@$(MAKE) typecheck

check-i18n: ## Verify EN and TR catalogs have identical keys
	node scripts/check-i18n-parity.mjs

format: ## Auto-format backend (ruff) and frontend (prettier)
	cd backend && ruff format .
	cd frontend-customer && npx prettier --write .
	cd frontend-main && npx prettier --write .
	cd frontend-customer && npx prettier --write ../packages/shared

# ============================================================================
# Utilities
# ============================================================================

shell: ## Open Django shell
	docker compose exec django python manage.py shell

health-check: ## Check if the API is healthy
	@curl -sf http://localhost/api/health/ && echo "OK" || echo "FAIL"

ai-check: ## Verify the AI provider (cli subscription / anthropic key) end-to-end
	docker compose exec django python manage.py ai_check

wiki: ## Refresh the GitNexus graph, regenerate the architecture wiki (incremental, spends LLM tokens), mirror into docs/wiki/
	node .gitnexus/run.cjs analyze
	node .gitnexus/run.cjs wiki
	@$(MAKE) wiki-sync

wiki-sync: ## Mirror the generated wiki (.gitnexus/wiki/) into docs/wiki/ without regenerating
	rsync -a --delete --exclude='*.json' --exclude='*.html' .gitnexus/wiki/ docs/wiki/

# ============================================================================
# Stripe
# ============================================================================

stripe-listen: ## Forward Stripe test-mode events to local /api/webhooks/stripe/ and auto-update STRIPE_WEBHOOK_SECRET in .env
	@command -v stripe >/dev/null 2>&1 || { \
		echo "Stripe CLI not installed. Install with: brew install stripe/stripe-cli/stripe"; \
		exit 1; \
	}
	./scripts/stripe_listen_auto.sh .env

# ============================================================================
# Deploy (prod runs remotely on the home server via deploy.sh)
# ============================================================================

deploy: ## Deploy contentor to the home server (full backend tests first; SKIP_TESTS=1 to skip)
	@if [ -z "$(SKIP_TESTS)" ]; then $(MAKE) test; else echo "skipping test preflight (SKIP_TESTS=1)"; fi
	cd ~/ws/home-server && ./deploy.sh contentor

prod-build: ## Build the prod images locally (catches prod build breaks; no network needed)
	$(PROD_COMPOSE) build

prod-config: ## Validate the prod compose + .env.prod interpolation
	$(PROD_COMPOSE) config >/dev/null && echo "prod compose OK"

# ============================================================================
# E2E — Playwright end-to-end tests (e2e/)
# ============================================================================

e2e: ## Run the local Playwright e2e suite (Stripe specs auto-skip)
	cd e2e && npm install --silent && npx playwright install chromium && npx playwright test

e2e-stripe: ## e2e incl. real Stripe test-mode specs (needs sk_test keys in .env + `make stripe-listen` running)
	cd e2e && npm install --silent && npx playwright install chromium && STRIPE_E2E=1 npx playwright test

e2e-spec: ## Run one e2e spec by substring: make e2e-spec SPEC=04-live-class
	@test -n "$(SPEC)" || { echo "usage: make e2e-spec SPEC=<spec-substring>  (e.g. SPEC=04-live-class)"; exit 1; }
	cd e2e && npm install --silent && npx playwright install chromium && npx playwright test $(SPEC)

e2e-changed: ## Run only e2e specs affected by the diff, via e2e/impact-map.json (BASE=<ref>, PLAN=1)
	python3 scripts/select_tests.py --mode e2e $(if $(BASE),--base $(BASE),) $(if $(PLAN),--plan,)
