"""
SQLAlchemy ORM models for the AI Service.
Each class maps to a PostgreSQL table: ai_conversations, ai_messages, ai_suggestions.

Rule: these are DB-layer types used exclusively in Repositories.
Rule: never return SQLAlchemy models directly from a Router — map them to Pydantic schemas first.
"""

from models.ai import AiConversation, AiMessage, AiMessageRole, AiSuggestion, AiSuggestionStatus

__all__ = [
    "AiConversation",
    "AiMessage",
    "AiMessageRole",
    "AiSuggestion",
    "AiSuggestionStatus",
]
