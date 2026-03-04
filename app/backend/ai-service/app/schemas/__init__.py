"""
Pydantic schemas (DTOs) for the AI Service.
These define the exact shape of HTTP request bodies and SSE response payloads.
FastAPI validates them automatically at the Router boundary.

Rule: schemas are used in Routers and Service mapping logic only.
Rule: schemas must never be passed to Repositories — map them to SQLAlchemy models first.
Rule: do NOT mix Pydantic schemas with SQLAlchemy models.
"""
