---
name: caret-deployment
description: Caret infrastructure and deployment — Docker Compose local dev, AWS Lambda/ECS/Vercel targets, SST IaC, CI/CD pipeline, environment variables, and monitoring. Use when working on Docker, deployment configuration, CI/CD, infrastructure, environment setup, or any DevOps task in the Caret project.
---

# Caret Deployment

## Package Managers (Strict)

- Frontend + Node.js services: **Bun** only — never npm, yarn, or pnpm
- Python AI Service: **uv** only — never pip, poetry, or pipenv

## Local Development (Docker Compose)

Single command: `docker compose up --build`

| Service | Stack | Port | Notes |
|---|---|---|---|
| Frontend | React/Vite | 5173 | Bun. Calls API Gateway only. |
| API Gateway | Node/TS | 3000 | Routes all `/api/v1/...` calls |
| Auth Service | Node/TS | internal | Reached only by Gateway |
| Document Service | Node/TS | internal | Reached only by Gateway |
| Collaboration | Node/TS + Y.js | 4000 | WebSocket — frontend connects directly |
| AI Service | Python/FastAPI | 8000 | uv + PydanticAI |

**No local PostgreSQL**: all services connect to **Supabase** (cloud) via `DATABASE_URL`.

### Required `.env` (repo root)

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
OPENAI_API_KEY=sk-...
```

Local URLs: Frontend `http://localhost:5173` · Gateway `http://localhost:3000` · Collab WS `ws://localhost:4000`

## Production Deployment Targets

| Target | Service | Tool |
|---|---|---|
| **Vercel** | Frontend | GitHub integration (auto on push/merge) |
| **AWS Lambda** | API Gateway, Auth, Document | SST (Serverless Stack) — `sst.config.ts` |
| **AWS ECS Fargate** | Collaboration, AI Service | SST — always-on containers |
| **Supabase** | PostgreSQL + Auth + pgvector | Managed — no RDS |

- Lambda runtime is **Node.js** (Bun is used for install/build in CI only)
- ECS needed for WebSocket (stateful) and long-lived SSE (AI) — Lambda has timeout constraints

## CI/CD Pipeline (GitHub Actions)

```
Lint + type check (Bun/ESLint/tsc + uv/Ruff/pyright)
    → Tests (unit → integration → E2E)
        → Deploy Frontend (Vercel)
        → Deploy Backend (Lambda + ECS via SST)
```

- **Staging**: deploy on merge to `main`
- **Production**: deploy on Git tag (e.g. `v1.0.0`) or GitHub Release
- **Secrets**: GitHub Secrets (CI) · Vercel env vars (frontend) · AWS Secrets Manager (Lambda/ECS)
- Never commit secrets to the repo

## IaC

- **SST (Serverless Stack)**: single `sst.config.ts` manages all AWS resources
  - HTTP API, Lambda functions, ECS clusters/tasks, VPC, networking
  - Does NOT manage Supabase (external managed service)

## Monitoring

- **Logging**: AWS CloudWatch (Lambda + ECS)
- **Error tracking**: Sentry (frontend + backend)
- **Analytics**: PostHog or Plausible (optional)
