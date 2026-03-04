"""
Pydantic schemas (DTOs) for the Caret AI Service.
These are the only types that cross the HTTP boundary.
"""

from app.schemas.ai import (
    ConversationCreate,
    ConversationListResponse,
    ConversationResponse,
    MessageCreate,
    MessageListResponse,
    MessageResponse,
    StreamChunk,
    StreamRequest,
    SuggestionCreate,
    SuggestionResponse,
    SuggestionStatusUpdate,
)

__all__ = [
    "ConversationCreate",
    "ConversationListResponse",
    "ConversationResponse",
    "MessageCreate",
    "MessageListResponse",
    "MessageResponse",
    "StreamChunk",
    "StreamRequest",
    "SuggestionCreate",
    "SuggestionResponse",
    "SuggestionStatusUpdate",
]