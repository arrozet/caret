# Caret - System Documentation Hub

## Introduction

You are an expert software engineer and AI specialist. Your goal is to implement **Caret**, an agentic, AI-first document editor for collaborative and structured writing. Caret integrates true agentic capabilities into a rich document editor, allowing AI to understand, modify, and enhance documents intelligently.

## Vision & Problem Statement

### Vision
Caret addresses a critical gap in the market: while agentic IDEs like Cursor and Copilot have transformed code writing, document editing remains stagnant. Current solutions offer limited agentic capabilities—they're essentially chat toggles with minimal document interaction. Caret aims to change this by providing true agentic capabilities integrated into a rich document editor.

### Problem Statement
Document writing is not as "agile" as code writing with modern AI tools. No major company is effectively integrating AI into Word/Google Docs-like editors with genuine agentic capabilities.

## What's in a Name?

**Caret** (^) - The caret symbol indicates the cursor position where text will be inserted. It was chosen because it is:
- Concise and memorable.
- Directly related to document writing and editing.
- Technically meaningful yet distinctive.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│                  Tiptap + TailwindCSS + TypeScript              │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌─────────────┐  ┌──────────────────┐
│ Real-time    │  │ Document    │  │ Agentic AI       │
│ Collab       │  │ Management  │  │ Integration      │
│ (Y.js)       │  │ (Node.js)   │  │ (Python)         │
└──────┬───────┘  └──────┬──────┘  └────────┬─────────┘
       │                 │                  │
       └─────────────────┼──────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ PostgreSQL   │  │ pgvector     │  │ Cache/Queue  │
│ (Supabase)   │  │ (Embeddings) │  │ (Redis)      │
└──────────────┘  └──────────────┘  └──────────────┘
```

## System Documentation Index

This hub connects all detailed technical specifications for the Caret project.

| File | Description |
|:---|:---|
| **[FRONTEND.md](./FRONTEND.md)** | Design system, UI components, and React architecture. |
| **[BACKEND.md](./BACKEND.md)** | Microservices architecture, API specifications, and Node.js/Python services. |
| **[DATABASE.md](./DATABASE.md)** | PostgreSQL schema, Supabase configuration, and Vector storage (pgvector). |
| **[DEPLOYMENT.md](./DEPLOYMENT.md)** | Infrastructure-as-Code, AWS services (Lambda/ECS), and CI/CD pipelines. |
| **[TESTING.md](./TESTING.md)** | QA strategies, E2E testing (Playwright), and unit testing standards. |
| **[ROADMAP.md](./ROADMAP.md)** | Execution phases and step-by-step engineering checklist. |
