PYTHON ?= uv
FILES ?=
PY_FILES := $(filter %.py,$(FILES))

.PHONY: lint lint-fix format-check format-write test-unit test-integration test

lint:
	$(PYTHON) run ruff check src tests

lint-fix:
	@if [ -n "$(FILES)" ]; then \
		if [ -n "$(PY_FILES)" ]; then $(PYTHON) run ruff check --fix $(PY_FILES); fi; \
	else \
		$(PYTHON) run ruff check --fix src tests; \
	fi

format-check:
	$(PYTHON) run ruff format --check src tests

format-write:
	@if [ -n "$(FILES)" ]; then \
		if [ -n "$(PY_FILES)" ]; then $(PYTHON) run ruff format $(PY_FILES); fi; \
	elif [ -z "$(FILES)" ]; then \
		$(PYTHON) run ruff format src tests; \
	fi

test-unit:
	$(PYTHON) run pytest tests/unit -q

test-integration:
	$(PYTHON) run pytest tests/integration -q

test: test-unit test-integration
