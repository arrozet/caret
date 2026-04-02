# Caret - Infrastructure & Deployment

## Cloud Infrastructure Overview
Caret follows a hybrid serverless and containerized approach on **AWS** for maximum scalability and cost-efficiency. **PostgreSQL** lives in the cloud on **Supabase**; there is no self-hosted database in production or staging.

## Package Managers (Exclusive)
- **Frontend & Node.js services**: **Bun** only (no npm, yarn, or pnpm).
- **Python services (AI)**: **uv** only (no pip, poetry, or pipenv).

---

## Local Development & Deployment (Docker)

Local deployment is fully containerized. Docker Compose orchestrates **all microservices and the frontend** for the recommended full-stack experience.
Individual service runs outside containers are allowed for focused debugging when needed.

### Design Principles
- **No local PostgreSQL**: The app connects to **Supabase** (PostgreSQL in the cloud) via `DATABASE_URL` and Supabase env vars. No `postgres` service in Compose for local dev.
- **Single command**: `docker compose up` brings up the entire stack (frontend + API Gateway, Auth, Document, Collaboration, AI Service).
- **Bun in containers**: Frontend and Node.js services use Bun for install and run inside their Docker images.
- **uv in containers**: The AI Service uses uv for install and run inside its Docker image.

### Services to Orchestrate
| Service            | Stack        | Port (local) | Notes |
|--------------------|--------------|--------------|--------|
| Frontend           | React/Vite   | 5173         | Build and serve with Bun. Calls only the API Gateway (see BACKEND.md). |
| API Gateway        | Node/TS      | 3000         | Single entry point. Frontend uses `/api/v{version}/{service}/*`; Gateway routes to Auth, Document, AI. |
| Auth Service       | Node/TS      | (internal)   | Reached only by the Gateway (no public port). |
| Document Service   | Node/TS      | (internal)   | Reached only by the Gateway (no public port). |
| Collaboration Svc  | Node/TS+Y.js | 3003         | WebSocket; frontend connects here directly (not via Gateway). |
| AI Service         | Python/FastAPI | 8000       | uv + PydanticAI. Reached by the Gateway at `/api/v1/ai/*`. |

### Environment Variables (Local)
Create a `.env` in the repo root and pass it into Compose. Required for Supabase, collaboration auth, and AI:

```
# Supabase (PostgreSQL + Auth in the cloud)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# AI
OPENAI_API_KEY=sk-...
```

### Running Locally
```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- API (Gateway): `http://localhost:3000` — frontend calls this with `/api/v1/...` (see BACKEND.md).
- WebSocket (collab): `ws://localhost:3003/document/{doc_id}?token={jwt}`

All services use the same Supabase-backed PostgreSQL and env config; no local DB container.

### ECS/SST Preparation Note
- Collaboration Service is a dedicated stateful service (persistent WebSocket connections) and is deployed to ECS Fargate via SST in cloud environments.
- Local development remains independent through Docker Compose (`collab-service` container on port `3003`), so local iteration is not blocked by ECS provisioning.

---

## Deployment Targets

### 1. Frontend (Vercel)
- **Hosting**: Static assets and React application (build with Bun).
- **CI/CD**: Deploy on merge/tag via GitHub Actions (see pipeline below).
- **Environments**: Production, Staging, Preview (branch-based).

### 2. Stateless Services (AWS Lambda)
- **Services**: API Gateway, Auth Service, Document Service (and any other stateless Node/TS handlers).
- **IaC/Deploy**: **SST (Serverless Stack)** for the whole backend.
- **Runtime**: Node.js on Lambda. Bun is used only for install and build (e.g. in CI); the Lambda runtime is Node.js.
- **Benefits**: Zero-cost at rest, automatic scaling.
- **Database**: Supabase PostgreSQL via `DATABASE_URL` (use Supabase connection pooler in production).

### 3. Stateful / Long-Running (AWS ECS Fargate)
- **Services**: Collaboration Service (WebSocket), AI Service (long-lived SSE, RAG, agentic workflows).
- **Reasoning**: WebSockets and long-lived streams are not suitable for Lambda; ECS provides always-on containers.
- **Scaling**: Auto-scaling by connection count (collab) or CPU/memory (AI).
- **Database**: Supabase PostgreSQL; pgvector used for RAG (same cloud DB).

### 4. Database (Supabase)
- **PostgreSQL**: Hosted on Supabase; no RDS or self-managed Postgres in this setup.
- **Auth**: Supabase Auth (JWT used by API Gateway and Collaboration Service).
- **pgvector**: Enabled on Supabase for embeddings and RAG.

---

## CI/CD Pipeline

The pipeline runs in this **strict order**: (1) Linting & type checking → (2) Tests → (3) Deploy.

### 1. Linting & Type Checking
- **Frontend / Node (Bun)**: ESLint; TypeScript strict type checking (e.g. `bun run check` or `tsc --noEmit`).
- **Python (uv)**: Ruff for linting; pyright or mypy for type checking.
- **Fail fast**: If this step fails, the pipeline stops; no tests and no deploy.

### 2. Tests
- **Unit**: Vitest (frontend + Node); Pytest (AI Service).
- **Integration**: API tests (Supertest for Node, FastAPI TestClient for Python); DB/RLS against a dedicated Supabase project or test database (separate from production); Y.js sync and AI-to-editor protocol where applicable.
- **E2E**: Playwright against the staging environment. Run on every PR targeting `main`.
- All tests must pass before any deployment step runs.

### 3. Deploy
- **Frontend**: Deploy to **Vercel** using the Vercel GitHub integration (automatic deployments on push/merge).
- **Backend**: Deploy to **AWS**:
  - **Lambda**: Stateless services (API Gateway, Auth, Document) using **SST**.
  - **ECS (Fargate)**: Collaboration Service and AI Service (containers), also managed via SST.
- **Secrets**: Store `DATABASE_URL`, Supabase keys, `OPENAI_API_KEY`, etc. in GitHub Secrets (for Actions), Vercel env (for frontend), and AWS Secrets Manager or Parameter Store (for Lambda/ECS). Never commit secrets to the repo.

### Pipeline Summary
```
Lint + Type check (Bun/Node + uv/Python)
    → Tests (unit, integration, E2E as configured)
        → Deploy Frontend (Vercel)
        → Deploy Backend (Lambda + ECS)
```

- **Staging**: Pre-production environment. Deploy to staging when code is merged into `main`, or when pushing to a dedicated `staging` branch — choose one strategy and document it in the workflow.
- **Production**: Live environment for end users. Deploy to production when a Git tag is created (e.g. `v1.0.0`) or a GitHub Release is published, or when a manual approval step in the pipeline is triggered — choose one and document it.

---

## Infrastructure-as-Code (IaC)
- **Tool**: **SST (Serverless Stack)** for all AWS resources: API Gateway, Lambda, ECS, VPC. Database is not managed here; it stays on Supabase.
- **Resources**: API Gateway (HTTP API), Lambda functions, ECS clusters and tasks, VPC and networking. No RDS or self-hosted Postgres.

## Monitoring & Logging
- **Logging**: AWS CloudWatch for backend (Lambda and ECS). Use for request logs, errors, and metrics.
- **Error tracking**: Sentry (or similar) for frontend and backend to capture exceptions and get alerts.
- **Analytics**: Optional. PostHog, Plausible, or similar for product/usage analytics when needed.
