# scripts/install-hooks.ps1
# Configures git to use the project-managed hooks in .githooks/.
# Run once after cloning: .\scripts\install-hooks.ps1

$root = git rev-parse --show-toplevel

Write-Host "Installing Caret git hooks from .githooks/ ..."
git config core.hooksPath .githooks
Write-Host "Done. Hooks active:"
Write-Host "  pre-commit  -- tests for staged services before every commit"
Write-Host "  pre-push    -- full test suite before every push"
Write-Host ""
Write-Host "Note: Git Bash must be available for the hooks to execute on Windows."
