---
name: caret-deployment
description: Caret infrastructure and deployment - Docker Compose local dev, Hetzner VPS production hosting, Coolify open-source PaaS, GitHub Actions CI/CD, Cloudflare DNS, environment variables, firewall, and monitoring. Use when working on Docker, production deployment, CI/CD, infrastructure, environment setup, domains, networking, or any DevOps task in the Caret project.
---

# Caret Deployment

## Package Managers (Strict)

- Frontend + Node.js services: **Bun** only - never npm, yarn, or pnpm
- Python AI Service: **uv** only - never pip, poetry, or pipenv

## Local Development (Docker Compose)

Single command: `docker compose up --build`

| Service | Stack | Port | Notes |
|---|---|---|---|
| Frontend | React/Vite | 5173 | Bun. Calls API Gateway only. |
| API Gateway | Node/TS | 3000 | Routes all `/api/v1/...` calls |
| Auth Service | Node/TS | internal | Reached only by Gateway |
| Document Service | Node/TS | internal | Reached only by Gateway |
| Collaboration | Node/TS + Y.js | 4000 | WebSocket - frontend connects directly |
| AI Service | Python/FastAPI | 8000 | uv + PydanticAI |

**No local PostgreSQL**: all services connect to **Supabase** (cloud) via `DATABASE_URL`.

### Required `.env` (repo root)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
OPENAI_API_KEY=sk-...
```

Local URLs: Frontend `http://localhost:5173`; Gateway `http://localhost:3000`; Collab WS `ws://localhost:4000`

## Production Infrastructure

Caret production runs on a **Hetzner Cloud VPS** with **Coolify** as a self-hosted open-source PaaS. This simulates a PaaS workflow from the GitHub repository while keeping costs low and infrastructure centralized for an academic project.

| Layer | Current Choice | Notes |
|---|---|---|
| Hosting | Hetzner VPS | Single VM, about 9 EUR/month, currently enough for the full stack |
| PaaS | Coolify | Controls deployments, domains, logs, redeploys, and Docker Compose resources |
| Containers | Docker Compose | Production compose file is the deployment unit |
| CI/CD | GitHub Actions + Coolify | CI validates `main`/`prod`; production deploys run after CI passes on `prod` |
| DNS | Cloudflare | Manages `caret.page` and subdomains |
| Database/Auth | Supabase Cloud | Managed PostgreSQL, Auth, and pgvector outside the VPS |
| Firewall | Hetzner firewall | Allow only required public ingress |

### Production Domains

| Domain | Service | Public Access Pattern |
|---|---|---|
| `ops.caret.page` | Coolify dashboard | PaaS control plane for deployments and operations |
| `caret.page` | Frontend | Main user-facing app |
| `www.caret.page` | Frontend alias | CNAME to `caret.page` |
| `api.caret.page` | API Gateway | Public HTTP API entrypoint |
| `ws.caret.page` | Collaboration service | Public WebSocket endpoint, bypasses API Gateway |

The frontend must call `api.caret.page` for HTTP API traffic and connect directly to `ws.caret.page` for collaboration traffic. Do not route the collaboration service through the API Gateway because it uses a different long-lived WebSocket protocol.

### Network And Firewall

- Point Cloudflare DNS records for `caret.page`, `api.caret.page`, `ops.caret.page`, and `ws.caret.page` to the Hetzner VPS public IPv4.
- Keep `www.caret.page` as a CNAME to `caret.page`.
- Use Cloudflare DNS for the domain, currently DNS-only records unless a specific proxy-compatible path is configured.
- Keep the Hetzner firewall focused on required ingress:
  - `22/tcp` for SSH administration.
  - `80/tcp` and `443/tcp` for HTTP/HTTPS traffic and ACME validation.
  - `ICMP` for basic reachability checks.
- Avoid exposing internal service ports directly. Public traffic should enter through Coolify's reverse proxy and configured domains.

### Coolify Deployment Shape

- Configure the Caret project in Coolify from the GitHub repository.
- Use **Docker Compose** as the build pack.
- Use `/docker-compose.prod.yml` as the production compose file.
- Deploy automatically from the `prod` branch.
- Configure domains per compose service in Coolify:
  - Frontend: `https://caret.page`
  - API Gateway: `https://api.caret.page`
  - Collaboration: `https://ws.caret.page`
- Keep service-to-service traffic internal inside Docker networks whenever possible.
- Store production secrets in Coolify environment variables or GitHub Actions secrets, never in the repo.

## Deprecated Production Targets

| Target | Service | Status |
|---|---|---|
| Vercel | Frontend | Considered, but unnecessary because the Hetzner VPS has enough resources and keeps deployment centralized |
| AWS Lambda | API Gateway, Auth, Document | Rejected for production because AWS costs were too high for the academic-project budget |
| AWS ECS Fargate | Collaboration, AI Service | Rejected for production because always-on containers are cheaper and simpler on Hetzner for this project |
| Supabase Cloud | PostgreSQL + Auth + pgvector | Still used as the managed database/auth/vector platform outside the VPS |

- Keep older AWS/SST references only as historical context unless the user explicitly asks to revisit that architecture.
- Prefer Hetzner + Coolify for production deployment work.

## CI/CD Pipeline (GitHub Actions)

```text
Lint + type check (Bun/ESLint/tsc + uv/Ruff/mypy)
    -> Tests (unit -> integration -> E2E)
        -> Build Docker images / validate production compose
            -> Deploy `prod` branch through Coolify
```

- Workflows are checked in under `.github/workflows/`.
- `ci.yml` runs frontend, Node-service, AI-service, production compose, and production image validation on pushes to `main` and `prod`.
- `deploy-production.yml` triggers Coolify after a successful `CI` workflow caused by a remote change on `prod`, or by manual dispatch from `prod`.
- **Production**: deploy automatically from the `prod` branch.
- **Development integration**: use `main` for normal integration work unless a workflow file says otherwise.
- **Secrets**: GitHub Secrets for CI-only values; Coolify environment variables for runtime values.
- **Production smoke tests**: frontend `/health`, API Gateway `/health`, API Gateway `/api/v1`, and collaboration `/health`; internal service health URLs are optional GitHub variables when reachable through a controlled route.
- Never commit secrets to the repo.

## Deployment Configuration

- Treat `docker-compose.prod.yml` as the production source of truth for service topology.
- Keep Coolify-specific domain bindings, runtime environment variables, persistent storage, and deployment hooks in Coolify.
- Keep Cloudflare as the DNS source of truth for `caret.page`.
- Keep Supabase Cloud external to the VPS for PostgreSQL, Auth, and vector search through pgvector.
- Configure services through `DATABASE_URL`, Supabase URL, and service keys.

## Monitoring

- **Logging**: Coolify service logs and container logs
- **Error tracking**: Sentry (frontend + backend)
- **Analytics**: PostHog or Plausible (optional)
