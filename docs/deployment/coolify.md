# Coolify Production Deployment

Caret production is deployed from the `prod` branch to the Hetzner server managed by Coolify.

GitHub Actions validates changes before production deployment. See `docs/deployment/ci-cd.md` for workflow triggers, required GitHub secrets, variables, and smoke checks.

## Domains

Create these Cloudflare DNS records as `DNS only` while certificates are being issued:

| Name | Type | Target |
| --- | --- | --- |
| `caret.page` | `A` | Hetzner IPv4 |
| `www.caret.page` | `CNAME` | `caret.page` |
| `api.caret.page` | `A` | Hetzner IPv4 |
| `ws.caret.page` | `A` | Hetzner IPv4 |
| `ops.caret.page` | `A` | Hetzner IPv4 |

## Coolify Resource

Use the `Caret` project and add a Docker Compose resource from GitHub:

- Branch: `prod`
- Compose file: `docker-compose.prod.yml`
- Public services:
  - `frontend` on port `8080` with domain `https://caret.page`
  - `api-gateway` on port `3000` with domain `https://api.caret.page`
  - `collab-service` on port `3003` with domain `https://ws.caret.page`

The remaining services are internal and should not receive public domains.

## CI/CD Trigger

Create a Coolify deploy webhook for the Caret Docker Compose resource and store it as the GitHub secret `COOLIFY_DEPLOY_WEBHOOK_URL`.

The checked-in production deployment workflow runs only after the `CI` workflow succeeds on the `prod` branch, or when manually dispatched from the `prod` branch. Runtime environment variables remain in Coolify.

## Required Variables

Set these variables in the Coolify resource before deploying:

```env
ALLOWED_ORIGINS=https://caret.page,https://www.caret.page

VITE_API_BASE_URL=https://api.caret.page/api/v1
VITE_API_URL=https://api.caret.page/api/v1
VITE_COLLABORATION_WS_URL=wss://ws.caret.page/document
VITE_COLLAB_WS_URL=wss://ws.caret.page/document
VITE_ENABLE_COLLABORATION=true
VITE_APP_ORIGIN=https://caret.page
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
DATABASE_URL=
JWT_SECRET=

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=deepseek/deepseek-v4-flash
```

## Firewall

Keep inbound `80/tcp` and `443/tcp` open. Restrict `22/tcp` to trusted IPs when possible. Do not expose `8000/tcp` after the Coolify instance URL is configured.
