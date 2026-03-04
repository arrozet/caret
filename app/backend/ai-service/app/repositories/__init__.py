"""
Repositories for the AI Service.
Each Repository class encapsulates all SQLAlchemy queries for one domain aggregate.
Repositories receive the AsyncSession via FastAPI Depends() injection.

Rule: all SQL/ORM logic lives here — never in Services or Routers.
Rule: accept and return SQLAlchemy models (domain layer), never Pydantic schemas.
"""
