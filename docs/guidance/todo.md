# Caret - Project Todo List

This file tracks upcoming tasks, design decisions, and feature requirements that need to be detailed in `AGENTS.md` or implemented in future development phases.

## 🎨 Frontend Design & Style Guidelines
- [ ] Define **"Simple, Minimalist & Techy"** visual style (e.g., subtle glassmorphism, high-quality typography, professional dark/light modes). Focus on absolute simplicity.
- [ ] Implement **Mobile-First** approach for all UI components.
- [ ] Detail UI interactions for the Tiptap editor and AI command bar.

## 🏗️ Backend & Data Architecture
- [ ] Design initial **Database Schema** (PostgreSQL/Supabase):
    - `users` (profiles, preferences, metadata only - NO passwords).
    - `documents`, `folders`, `templates`, `smart_folders`.
    - Relationship mappings for sharing and permissions.
- [ ] Implement **OAuth Exclusive Authentication** via Supabase Auth (no local user/password storage).
- [ ] Setup **pgvector** indexing strategy for document content.

## 🧪 Testing Strategy
- [ ] Define **Unit Testing** standards (Vitest for Frontend, Jest/Mocha for Node, Pytest for AI Service).
- [ ] Plan **Integration Tests** for real-time collaboration (Y.js).
- [ ] Plan **E2E Tests** (Playwright or Cypress) for core user flows.

## 🚀 Advanced Features
- [ ] **LaTeX Support**: Integrated editor mode for scientific and mathematical documents.
- [ ] **Smart Folders**: Implement indexed context sharing where the AI has access to all documents within a folder to provide cross-document intelligence.

## 🖥️ Dashboard (Post-Auth) Requirements
- [ ] **Google Docs-like Layout**:
    - **Top Section**: Template Gallery (Blank, Predefined, User-uploaded).
    - **Smart Recommendations**: AI-suggested templates based on user activity.
    - **Bottom Section**: List/Grid of recent documents and folders.
    - **Previews**: Visual thumbnails showing the first page of each document.

## 🛠️ Infrastructure & Dev
- [ ] Configure `docker-compose.yml` for local orchestration of all 5 microservices.
- [ ] Setup CI/CD pipeline structure for Vercel, AWS Lambda, and AWS ECS.
