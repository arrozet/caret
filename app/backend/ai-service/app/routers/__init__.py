"""
FastAPI routers for the AI Service — equivalent to Controllers in the layered architecture.
Each router function: validates the Pydantic schema, calls a Service, returns the response or SSE stream.

Rule: no business logic inside routers.
Rule: no direct Repository or SQLAlchemy imports — delegate to Services.
"""
