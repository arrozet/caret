COMPOSE ?= docker compose

FRONTEND_DIR := app/frontend
AUTH_DIR := app/backend/auth-service
DOCUMENT_DIR := app/backend/document-service
API_GATEWAY_DIR := app/backend/api-gateway
COLLAB_DIR := app/backend/collab-service
AI_DIR := app/backend/ai-service

.PHONY: up up-nocache down logs ps \
	frontend-lint frontend-lint-fix frontend-format-check frontend-format-write frontend-test-unit frontend-test-integration \
	auth-service-lint auth-service-lint-fix auth-service-format-check auth-service-format-write auth-service-test-unit auth-service-test-integration \
	document-service-lint document-service-lint-fix document-service-format-check document-service-format-write document-service-test-unit document-service-test-integration \
	api-gateway-lint api-gateway-lint-fix api-gateway-format-check api-gateway-format-write api-gateway-test-unit api-gateway-test-integration \
	collab-service-lint collab-service-lint-fix collab-service-format-check collab-service-format-write collab-service-test-unit collab-service-test-integration \
	ai-service-lint ai-service-lint-fix ai-service-format-check ai-service-format-write ai-service-test-unit ai-service-test-integration

up:
	$(COMPOSE) up --build

up-nocache:
	$(COMPOSE) build --no-cache
	$(COMPOSE) up

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

frontend-lint:
	cd $(FRONTEND_DIR) && bun run lint

frontend-lint-fix:
	cd $(FRONTEND_DIR) && bun run lint:fix

frontend-format-check:
	cd $(FRONTEND_DIR) && bun run format:check

frontend-format-write:
	cd $(FRONTEND_DIR) && bun run format:write

frontend-test-unit:
	cd $(FRONTEND_DIR) && bun run test:unit

frontend-test-integration:
	cd $(FRONTEND_DIR) && bun run test:integration

auth-service-lint:
	cd $(AUTH_DIR) && bun run lint

auth-service-lint-fix:
	cd $(AUTH_DIR) && bun run lint:fix

auth-service-format-check:
	cd $(AUTH_DIR) && bun run format:check

auth-service-format-write:
	cd $(AUTH_DIR) && bun run format:write

auth-service-test-unit:
	cd $(AUTH_DIR) && bun run test:unit

auth-service-test-integration:
	cd $(AUTH_DIR) && bun run test:integration

document-service-lint:
	cd $(DOCUMENT_DIR) && bun run lint

document-service-lint-fix:
	cd $(DOCUMENT_DIR) && bun run lint:fix

document-service-format-check:
	cd $(DOCUMENT_DIR) && bun run format:check

document-service-format-write:
	cd $(DOCUMENT_DIR) && bun run format:write

document-service-test-unit:
	cd $(DOCUMENT_DIR) && bun run test:unit

document-service-test-integration:
	cd $(DOCUMENT_DIR) && bun run test:integration

api-gateway-lint:
	cd $(API_GATEWAY_DIR) && bun run lint

api-gateway-lint-fix:
	cd $(API_GATEWAY_DIR) && bun run lint:fix

api-gateway-format-check:
	cd $(API_GATEWAY_DIR) && bun run format:check

api-gateway-format-write:
	cd $(API_GATEWAY_DIR) && bun run format:write

api-gateway-test-unit:
	cd $(API_GATEWAY_DIR) && bun run test:unit

api-gateway-test-integration:
	cd $(API_GATEWAY_DIR) && bun run test:integration

collab-service-lint:
	cd $(COLLAB_DIR) && bun run lint

collab-service-lint-fix:
	cd $(COLLAB_DIR) && bun run lint:fix

collab-service-format-check:
	cd $(COLLAB_DIR) && bun run format:check

collab-service-format-write:
	cd $(COLLAB_DIR) && bun run format:write

collab-service-test-unit:
	cd $(COLLAB_DIR) && bun run test:unit

collab-service-test-integration:
	cd $(COLLAB_DIR) && bun run test:integration

ai-service-lint:
	$(MAKE) -C $(AI_DIR) lint

ai-service-lint-fix:
	$(MAKE) -C $(AI_DIR) lint-fix

ai-service-format-check:
	$(MAKE) -C $(AI_DIR) format-check

ai-service-format-write:
	$(MAKE) -C $(AI_DIR) format-write

ai-service-test-unit:
	$(MAKE) -C $(AI_DIR) test-unit

ai-service-test-integration:
	$(MAKE) -C $(AI_DIR) test-integration
