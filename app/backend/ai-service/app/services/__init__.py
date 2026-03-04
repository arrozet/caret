"""
Services for the AI Service.
Contain all business logic: PydanticAI agent orchestration, RAG pipeline, streaming coordination.
Receive Repositories via constructor injection (DI).

Rule: no FastAPI/HTTP concepts (Request, Response) inside Services.
Rule: no direct SQLAlchemy imports — delegate all DB access to Repositories.
Rule: map Pydantic schemas → SQLAlchemy models on the way in, and models → schemas on the way out.
"""
