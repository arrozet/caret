COMPOSE ?= docker compose

.PHONY: up up-nocache down logs ps

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
