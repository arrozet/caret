#!/usr/bin/env bash
# scripts/install-hooks.sh
# Configures git to use the project-managed hooks in .githooks/.
# Run once after cloning: bash scripts/install-hooks.sh

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"

echo "Installing Caret git hooks from .githooks/ ..."
git config core.hooksPath .githooks
chmod +x "$ROOT/.githooks/pre-commit"
chmod +x "$ROOT/.githooks/pre-push"
echo "Done. Hooks active:"
echo "  pre-commit  — tests for staged services before every commit"
echo "  pre-push    — full test suite before every push"
