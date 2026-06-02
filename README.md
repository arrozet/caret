# Caret

<p align="center">
  <img src="app/frontend/public/logo.svg" alt="Caret logo" width="96" />
</p>

<p align="center">
  <strong>An agentic, AI-first, collaborative document editor for structured writing.</strong>
</p>

<p align="center">
  <a href="https://github.com/arrozet/caret/actions/workflows/ci.yml"><img alt="CI status" src="https://img.shields.io/github/actions/workflow/status/arrozet/caret/ci.yml?branch=main&label=CI&style=flat-square&logo=githubactions&logoColor=white" /></a>
  <a href="https://github.com/arrozet/caret/actions/workflows/deploy-production.yml"><img alt="Production deploy status" src="https://img.shields.io/github/actions/workflow/status/arrozet/caret/deploy-production.yml?branch=prod&label=deploy&style=flat-square&logo=githubactions&logoColor=white" /></a>
  <a href="https://caret.page/"><img alt="Live app" src="https://img.shields.io/badge/live-caret.page-16A34A?style=flat-square&logo=googlechrome&logoColor=white" /></a>
  <a href="https://mintlify.wiki/arrozet/caret"><img alt="Documentation" src="https://img.shields.io/badge/docs-Mintlify-0F172A?style=flat-square&logo=readthedocs&logoColor=white" /></a>
</p>

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Coolify](https://img.shields.io/badge/Coolify-111827?style=flat-square&logo=docker&logoColor=white)
![Hetzner](https://img.shields.io/badge/Hetzner-D50C2D?style=flat-square&logo=hetzner&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?style=flat-square&logo=bun&logoColor=white)
![uv](https://img.shields.io/badge/uv-DE5FE9?style=flat-square&logo=astral&logoColor=white)

Caret brings the agentic workflow of modern coding tools into document writing. Instead of a detached chat sidebar, Caret gives AI real document context, rich editor awareness, collaborative state, and the ability to help draft, revise, structure, and improve documents directly.

## Why Caret

Agentic IDEs have changed how developers write code, but document editing still feels mostly static. Most AI features in word processors behave like chat sidebars with limited document interaction; Caret is built around the idea that AI should work inside the document surface, with enough context to restructure drafts, adapt tone, coordinate feedback, and improve writing directly.

The name comes from the caret (`^`): the insertion point where text begins. It is short, tied to writing, and quietly technical without sounding like another generic AI tool.

## Highlights

- React 19 frontend with TypeScript, Vite, TailwindCSS v4, Tiptap 3, and Y.js.
- Express API Gateway that exposes the public HTTP API under `/api/v1`.
- Independent Node.js services for auth, documents, and realtime collaboration.
- FastAPI AI service with PydanticAI, SQLAlchemy async, Alembic, and SSE streaming.
- Supabase Cloud for PostgreSQL, Auth, and pgvector.
- Production deployment with Docker Compose, Coolify, Hetzner VPS, and Cloudflare.

## Architecture

```text
React/Tiptap frontend
  | REST/SSE: /api/v1
  v
API Gateway :3000
  | /auth, /documents, /workspaces, /folders
  v
Auth Service :3001 + Document Service :3002

Frontend collaboration WebSocket
  -> Collab Service :3003 /document/{doc_id}?token={jwt}

AI requests
  -> API Gateway -> AI Service :8000

All services
  -> Supabase Cloud PostgreSQL/Auth/pgvector
```

| Service | Stack | Local | Production |
| --- | --- | --- | --- |
| `frontend` | React, Vite, Tiptap | `http://localhost:5173` | `https://app.example.com` |
| `api-gateway` | Express, TypeScript | `http://localhost:3000` | `https://api.example.com` |
| `auth-service` | Express, TypeScript | `http://localhost:3001` | Internal |
| `document-service` | Express, TypeScript, Drizzle | `http://localhost:3002` | Internal |
| `collab-service` | ws, Y.js, TypeScript | `ws://localhost:3003` | `wss://ws.example.com/document` |
| `ai-service` | FastAPI, PydanticAI | `http://localhost:8000` | Internal |

> [!IMPORTANT]
> Docker Compose does not run a local PostgreSQL database. Local and production environments connect to Supabase Cloud through `DATABASE_URL`.

## Requirements

- Docker and Docker Compose.
- Bun for the frontend and Node.js services.
- uv for the Python AI service.
- A Supabase project with PostgreSQL/Auth.
- At least one AI provider key for agentic features (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENROUTER_API_KEY`).

## Local Setup

Create a root `.env` file:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
JWT_SECRET=replace-with-a-long-random-secret

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=deepseek/deepseek-v4-flash
```

Start the full local stack:

```bash
docker compose up --build
```

Useful commands:

```bash
make up          # docker compose up --build
make down        # stop containers
make logs        # follow logs
make ps          # show service status
```

Local URLs:

| Target | URL |
| --- | --- |
| App | `http://localhost:5173` |
| API Gateway | `http://localhost:3000` |
| API health | `http://localhost:3000/health` |
| AI Service | `http://localhost:8000` |
| AI health | `http://localhost:8000/health` |
| Collaboration WS | `ws://localhost:3003` |

## Development Without Docker

Use Bun for the frontend and Node.js services:

```bash
cd app/frontend
bun install
bun run dev
```

```bash
cd app/backend/api-gateway
bun install
bun run dev
```

Use uv for the AI service:

```bash
cd app/backend/ai-service
uv sync
uv run fastapi dev src/app/main.py
```

> [!NOTE]
> The project standardizes on Bun for JavaScript/TypeScript and uv for Python. Avoid mixing npm, yarn, pnpm, pip, Poetry, or Pipenv unless a future change explicitly documents it.

## Quality And Tests

The root `Makefile` exposes service-level tasks:

```bash
make frontend-lint
make frontend-test-unit
make api-gateway-test-unit
make auth-service-test-integration
make document-service-test-integration
make collab-service-test-unit
make ai-service-lint
make ai-service-test-unit
```

GitHub Actions CI validates pushes to `main` and `prod` with formatting checks, linting, type/build checks, unit tests, integration tests, frontend E2E smoke tests, production compose validation, and production image builds.

## Cloud Deployment

Production runs on a Hetzner VPS managed by Coolify. Cloudflare manages DNS for your application domain; Supabase remains outside the VPS as the managed database, Auth, and pgvector platform.

> [!NOTE]
> Replace the example domains below with the real domains configured in your Cloudflare and Coolify environments.

### Deployment Labels

| Label | Value |
| --- | --- |
| Hosting | `Hetzner VPS` |
| PaaS | `Coolify` |
| Deployment unit | `docker-compose.prod.yml` |
| Production branch | `prod` |
| CI/CD | `GitHub Actions -> Coolify webhook` |
| DNS | `Cloudflare` |
| Database/Auth | `Supabase Cloud` |
| Public app | `https://app.example.com` |
| Public API | `https://api.example.com` |
| Public WebSocket | `wss://ws.example.com/document` |
| Operations | `https://ops.example.com` |

### Cloudflare DNS

Configure records as `DNS only` while certificates are being issued:

| Name | Type | Target |
| --- | --- | --- |
| `app.example.com` | `A` | Hetzner IPv4 |
| `www.example.com` | `CNAME` | `app.example.com` |
| `api.example.com` | `A` | Hetzner IPv4 |
| `ws.example.com` | `A` | Hetzner IPv4 |
| `ops.example.com` | `A` | Hetzner IPv4 |

### Firewall

Allow only the required public ingress:

| Port | Purpose |
| --- | --- |
| `22/tcp` | SSH, ideally restricted to trusted IPs |
| `80/tcp` | HTTP and ACME validation |
| `443/tcp` | HTTPS |
| `ICMP` | Basic reachability checks |

Do not expose internal ports such as `3001`, `3002`, or `8000` directly to the internet.

### Coolify Resource

In Coolify, create a `Caret` project and add a Docker Compose resource from GitHub:

| Field | Value |
| --- | --- |
| Branch | `prod` |
| Compose file | `docker-compose.prod.yml` |
| Build pack | Docker Compose |

Assign domains only to public services:

| Service | Internal port | Domain |
| --- | --- | --- |
| `frontend` | `8080` | `https://app.example.com` |
| `api-gateway` | `3000` | `https://api.example.com` |
| `collab-service` | `3003` | `https://ws.example.com` |

`auth-service`, `document-service`, and `ai-service` should remain internal to the Docker network.

### Production Variables In Coolify

Set these variables in the Coolify resource:

```env
ALLOWED_ORIGINS=https://app.example.com,https://www.example.com

VITE_API_BASE_URL=https://api.example.com/api/v1
VITE_API_URL=https://api.example.com/api/v1
VITE_COLLABORATION_WS_URL=wss://ws.example.com/document
VITE_COLLAB_WS_URL=wss://ws.example.com/document
VITE_ENABLE_COLLABORATION=true
VITE_APP_ORIGIN=https://app.example.com
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

> [!WARNING]
> Do not commit secrets to the repository. Runtime credentials live in Coolify; GitHub only needs CI/CD secrets.

### Production CI/CD

1. Create a Coolify deploy webhook for the Caret Docker Compose resource.
2. Save the webhook in GitHub as `COOLIFY_DEPLOY_WEBHOOK_URL`.
3. Optionally save `COOLIFY_DEPLOY_TOKEN` if the webhook requires a bearer token.
4. Push or merge to `prod`.
5. GitHub Actions runs `CI`.
6. If `CI` passes, `deploy-production.yml` calls the Coolify webhook.
7. The workflow runs production smoke checks.

Built-in smoke checks:

```text
GET https://app.example.com/health
GET https://api.example.com/health
GET https://api.example.com/api/v1
GET https://ws.example.com/health
```

## Repository Structure

```text
app/
  frontend/                  React, Vite, Tiptap
  backend/
    api-gateway/             Public REST gateway
    auth-service/            Auth/docs runtime service
    document-service/        Workspaces, folders, and documents
    collab-service/          WebSocket collaboration with Y.js
    ai-service/              FastAPI agentic AI service
docs/deployment/             Coolify and CI/CD deployment docs
docker-compose.yml           Local stack
docker-compose.prod.yml      Production stack
Makefile                     Common local commands
AGENTS.md                    System documentation hub for agents
```

## Documentation

- `AGENTS.md`: project vision, architecture, and agent working rules.
- `.agents/skills/caret-frontend/SKILL.md`: frontend, UI, Tiptap, and collaboration.
- `.agents/skills/caret-backend/SKILL.md`: backend services and protocols.
- `.agents/skills/caret-database/SKILL.md`: Supabase, PostgreSQL, RLS, and pgvector.
- `.agents/skills/caret-deployment/SKILL.md`: Docker, Coolify, Hetzner, Cloudflare, and CI/CD.
- `.agents/skills/caret-testing/SKILL.md`: testing strategy.
- `.agents/skills/caret-roadmap/SKILL.md`: project status and next steps.
