FILES ?=
JS_FILES := $(filter %.ts %.tsx %.js %.jsx %.mjs %.cjs,$(FILES))
PRETTIER_FILES := $(filter %.ts %.tsx %.js %.jsx %.mjs %.cjs %.json %.css %.html %.md %.yml %.yaml %.toml,$(FILES))

PHONY_TARGETS := lint lint-fix format-check format-write test-unit test-integration test

.PHONY: $(PHONY_TARGETS)

lint:
	bun run lint

lint-fix:
	@if [ -n "$(FILES)" ]; then \
		if [ -n "$(JS_FILES)" ]; then bunx eslint --fix $(JS_FILES); fi; \
	else \
		bun run lint:fix; \
	fi

format-check:
	bun run format:check

format-write:
	@if [ -n "$(PRETTIER_FILES)" ]; then \
		bunx prettier --write $(PRETTIER_FILES); \
	elif [ -z "$(FILES)" ]; then \
		bun run format:write; \
	fi

test-unit:
	bun run test:unit

test-integration:
	bun run test:integration

test: test-unit test-integration
