# CI/CD Pipeline

Caret uses GitHub Actions for repository CI and a controlled production deployment trigger into Coolify.

## Branches

- `main`: integration branch for normal development work.
- `prod`: production branch watched by Coolify on the Hetzner VPS.
- Feature branches: validated locally through pre-commit and pre-push hooks; GitHub Actions CI does not run on feature branches.

## Workflows

| Workflow | File | Trigger | Purpose |
| --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml` | Pushes to `main` and `prod` | Runs formatting checks, linting, type/build checks, unit tests, integration tests, frontend E2E smoke tests, production compose validation, and production image builds. |
| Deploy Production | `.github/workflows/deploy-production.yml` | Successful `CI` workflow after a remote change on `prod`, manual dispatch from `prod` | Calls the Coolify deployment webhook, then runs production smoke checks. |

## GitHub Environment

Create a `production` environment in GitHub repository settings. Configure required reviewers there if production deploys should require manual approval.

## Required GitHub Secrets

| Secret | Purpose |
| --- | --- |
| `COOLIFY_DEPLOY_WEBHOOK_URL` | Coolify deploy webhook URL for the Caret Docker Compose resource. |
| `COOLIFY_DEPLOY_TOKEN` | Optional bearer token if the Coolify webhook is protected by an extra token. |

Runtime secrets such as `DATABASE_URL`, Supabase keys, provider API keys, and JWT secrets stay in Coolify environment variables, not GitHub workflow files.

## GitHub Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRODUCTION_FRONTEND_URL` | `https://caret.page` | Public frontend base URL for deployment environment metadata and smoke tests. |
| `PRODUCTION_API_URL` | `https://api.caret.page` | Public API Gateway base URL. |
| `PRODUCTION_WS_URL` | `https://ws.caret.page` | Public collaboration service base URL for HTTP health checks. |
| `PRODUCTION_AUTH_HEALTH_URL` | unset | Optional auth-service health URL if exposed through a private runner or controlled internal route. |
| `PRODUCTION_DOCUMENT_HEALTH_URL` | unset | Optional document-service health URL if exposed through a private runner or controlled internal route. |
| `PRODUCTION_AI_HEALTH_URL` | unset | Optional AI-service health URL if exposed through a private runner or controlled internal route. |

## Production Smoke Tests

The production deployment workflow always checks:

- `GET {PRODUCTION_FRONTEND_URL}/health`
- `GET {PRODUCTION_API_URL}/health`
- `GET {PRODUCTION_API_URL}/api/v1`
- `GET {PRODUCTION_WS_URL}/health`

Optional internal service health URLs can be configured with GitHub variables. Keep internal auth, document, and AI services private unless there is a deliberate controlled route for smoke checks.
