PYTHON ?= uv

.PHONY: lint lint-fix format-check format-write test-unit test-integration test

lint:
	$(PYTHON) run ruff check src tests

lint-fix:
	$(PYTHON) run ruff check --fix src tests

format-check:
	$(PYTHON) run ruff format --check src tests

format-write:
	$(PYTHON) run ruff format src tests

test-unit:
	$(PYTHON) run pytest tests/unit -q

test-integration:
	$(PYTHON) run pytest tests/integration -q

test: test-unit test-integration
