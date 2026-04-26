PHONY_TARGETS := lint lint-fix format-check format-write test-unit test-integration test

.PHONY: $(PHONY_TARGETS)

lint:
	bun run lint

lint-fix:
	bun run lint:fix

format-check:
	bun run format:check

format-write:
	bun run format:write

test-unit:
	bun run test:unit

test-integration:
	bun run test:integration

test: test-unit test-integration
