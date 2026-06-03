# CI/CD Pipeline

Caret uses GitHub Actions for repository CI and production deployment verification. Coolify deploys production automatically from the `prod` branch through its GitHub integration/webhook.

## Branches

- `main`: integration branch for normal development work.
- `prod`: production branch watched by Coolify on the Hetzner VPS.
- Feature branches: validated locally through pre-commit and pre-push hooks; GitHub Actions CI does not run on feature branches.

## Workflows

| Workflow | File | Trigger | Purpose |
| --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml` | Pushes to `main` and `prod` | Runs formatting checks, linting, type/build checks, unit tests, integration tests, frontend E2E smoke tests, production compose validation, and production image builds. |
| Verify Production | `.github/workflows/deploy-production.yml` | Successful `CI` workflow after a remote change on `prod`, manual dispatch from `prod` | Waits until Coolify reports the target commit as deployed, then runs production smoke checks against the public endpoints. |

## GitHub Environment

Create a `production` environment in GitHub repository settings if environment metadata or manual smoke-test approvals are needed.

## Required GitHub Secrets

| Secret | Purpose |
| --- | --- |
| `COOLIFY_API_TOKEN` | Read-only Coolify API token used to verify that the target commit was deployed. Rotate it before its expiry date. |
| `COOLIFY_API_URL` | Coolify API base URL, currently `https://ops.caret.page/api/v1`. This may be stored as a secret or a repository variable. |

Optional:

| Secret or variable | Purpose |
| --- | --- |
| `COOLIFY_RESOURCE_UUID` | Exact Coolify application/resource UUID. If unset, the workflow tries to discover the resource from branch `prod` and `caret.page`. |

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

Before smoke tests, the production verification workflow polls Coolify for up to 15 minutes and fails if the Coolify API token is expired, revoked, blocked by API access settings, or if the target commit never becomes the active production commit.

After the target commit is active, it always checks:

- `GET {PRODUCTION_FRONTEND_URL}/health`
- `GET {PRODUCTION_API_URL}/health`
- `GET {PRODUCTION_API_URL}/api/v1`
- `GET {PRODUCTION_WS_URL}/health`

Optional internal service health URLs can be configured with GitHub variables. Keep internal auth, document, and AI services private unless there is a deliberate controlled route for smoke checks.
