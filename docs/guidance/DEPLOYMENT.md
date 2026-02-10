# Caret - Infrastructure & Deployment

## Cloud Infrastructure Overview
Caret follows a hybrid serverless and containerized approach on **AWS** for maximum scalability and cost-efficiency.

## Local Development Environment

### Docker Compose Setup
Use `docker-compose.yml` to spin up the full local stack:

```yaml
version: '3.8'
services:
  postgres:
    image: ankane/pgvector:latest
    environment:
      POSTGRES_DB: caret_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/caret_dev
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}
    depends_on:
      - postgres

  ai-service:
    build: ./ai-service
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/caret_dev
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    depends_on:
      - postgres

volumes:
  postgres_data:
```

### Environment Variables
Create a `.env` file in the root:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=sk-...
```

### Running Locally
```bash
docker-compose up -d
cd frontend && bun dev
```

## Deployment Targets

### 1. Frontend (Vercel)
- **Hosting**: Static assets and React application.
- **CI/CD**: Automatic deployments on git push to `main`.
- **Environment**: Production, Staging, and Preview branches.

### 2. Stateless Services (AWS Lambda)
- **Services**: API Gateway, Auth Service, Document Service, AI Service.
- **Framework**: **SST (Serverless Stack)** or Serverless Framework.
- **Runtime**: Node.js (Core) and Python (AI).
- **Benefits**: Zero-cost at rest, automatic scaling.

### 3. Stateful Services (AWS ECS Fargate)
- **Services**: Collaboration Service (WebSocket Server).
- **Reasoning**: WebSockets require long-lived persistent connections which are not suitable for Lambda.
- **Scaling**: Auto-scaling based on active connection count.

## Infrastructure-as-Code (IaC)
- **Tool**: SST (Serverless Stack) for managing AWS resources via TypeScript.
- **Resources**:
  - API Gateway (HTTP API).
  - Lambda Functions.
  - ECS Clusters & Tasks.
  - VPC & Networking.

## CI/CD Pipeline
- **GitHub Actions**:
  - Linting and Type checking.
  - Unit and Integration tests.
  - Deployment to Staging on PR merge.
  - Deployment to Production on Tag/Release.

## Monitoring & Logging
- **Logging**: AWS CloudWatch for backend logs.
- **Error Tracking**: Sentry for frontend and backend exceptions.
- **Analytics**: PostHog or similar for user behavior tracking.
