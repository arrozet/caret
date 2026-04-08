"""
Unit tests for Pydantic schema validation (DTOs).

Verifies that all request and response schemas enforce correct field types,
required fields, and custom validators — without touching the database or LLMs.
"""

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from models.ai import AiMessageRole, AiSuggestionStatus
from schemas.ai import (
    ConversationCreate,
    MessageCreate,
    ModelInfo,
    ModelsResponse,
    StreamChunk,
    StreamRequest,
    SuggestionCreate,
    SuggestionStatusUpdate,
)


def _utcnow() -> datetime:
    """Return the current UTC datetime for use in test fixtures."""
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# ConversationCreate
# ---------------------------------------------------------------------------


class TestConversationCreate:
    """Validate ConversationCreate request body schema.

    Ensures document_id is required, must be a valid UUID, and title is
    optional with a maximum length constraint.
    """

    def test_valid_minimal(self) -> None:
        """ConversationCreate with only document_id should succeed."""
        # Arrange
        doc_id = uuid.uuid4()

        # Act
        schema = ConversationCreate(document_id=doc_id)

        # Assert
        assert schema.document_id == doc_id
        assert schema.title is None

    def test_valid_with_title(self) -> None:
        """ConversationCreate with an optional title should accept it."""
        # Arrange
        doc_id = uuid.uuid4()
        title = "My document session"

        # Act
        schema = ConversationCreate(document_id=doc_id, title=title)

        # Assert
        assert schema.title == title

    def test_invalid_document_id_raises(self) -> None:
        """ConversationCreate with a non-UUID document_id must raise ValidationError."""
        # Arrange
        bad_id = "not-a-uuid"

        # Act / Assert
        with pytest.raises(ValidationError):
            ConversationCreate(document_id=bad_id)  # type: ignore[arg-type]

    def test_missing_document_id_raises(self) -> None:
        """ConversationCreate without document_id must raise ValidationError."""
        # Arrange — intentionally missing required field

        # Act / Assert
        with pytest.raises(ValidationError):
            ConversationCreate()  # type: ignore[call-arg]

    def test_title_max_length_enforced(self) -> None:
        """Title longer than 255 characters must raise ValidationError."""
        # Arrange
        long_title = "x" * 256

        # Act / Assert
        with pytest.raises(ValidationError):
            ConversationCreate(document_id=uuid.uuid4(), title=long_title)


# ---------------------------------------------------------------------------
# MessageCreate
# ---------------------------------------------------------------------------


class TestMessageCreate:
    """Validate MessageCreate request body schema.

    Checks min/max length constraints on content and enum validation on role.
    """

    def test_valid_user_message(self) -> None:
        """MessageCreate with minimal valid content should parse correctly."""
        # Arrange
        content = "Hello AI"

        # Act
        schema = MessageCreate(content=content)

        # Assert
        assert schema.content == content
        assert schema.role == AiMessageRole.user

    def test_empty_content_raises(self) -> None:
        """MessageCreate with empty content must raise ValidationError (min_length=1)."""
        # Arrange
        empty = ""

        # Act / Assert
        with pytest.raises(ValidationError):
            MessageCreate(content=empty)

    def test_content_exceeds_max_length_raises(self) -> None:
        """MessageCreate with content > 32000 characters must raise ValidationError."""
        # Arrange
        too_long = "a" * 32_001

        # Act / Assert
        with pytest.raises(ValidationError):
            MessageCreate(content=too_long)

    def test_invalid_role_raises(self) -> None:
        """MessageCreate with an unknown role string must raise ValidationError."""
        # Arrange
        bad_role = "superuser"

        # Act / Assert
        with pytest.raises(ValidationError):
            MessageCreate(content="Hello", role=bad_role)  # type: ignore[arg-type]

    def test_explicit_assistant_role_accepted(self) -> None:
        """MessageCreate should accept 'assistant' as a valid role."""
        # Arrange / Act
        schema = MessageCreate(content="I can help", role=AiMessageRole.assistant)

        # Assert
        assert schema.role == AiMessageRole.assistant


# ---------------------------------------------------------------------------
# StreamRequest
# ---------------------------------------------------------------------------


class TestStreamRequest:
    """Validate StreamRequest body schema.

    Verifies message is required and constrained, document_context and
    model_id are optional.
    """

    def test_valid_minimal(self) -> None:
        """StreamRequest with only message should succeed."""
        # Arrange
        msg = "Improve my writing"

        # Act
        schema = StreamRequest(message=msg)

        # Assert
        assert schema.message == msg
        assert schema.document_context is None
        assert schema.model_id is None

    def test_valid_with_all_fields(self) -> None:
        """StreamRequest with all optional fields should parse correctly."""
        # Arrange
        schema = StreamRequest(
            message="Summarise",
            document_context="The quick brown fox.",
            model_id="z-ai/glm-4.5-air:free",
        )

        # Assert
        assert schema.document_context == "The quick brown fox."
        assert schema.model_id == "z-ai/glm-4.5-air:free"

    def test_empty_message_raises(self) -> None:
        """StreamRequest with empty message must raise ValidationError."""
        # Arrange / Act / Assert
        with pytest.raises(ValidationError):
            StreamRequest(message="")

    def test_message_too_long_raises(self) -> None:
        """StreamRequest with message > 32000 chars must raise ValidationError."""
        # Arrange / Act / Assert
        with pytest.raises(ValidationError):
            StreamRequest(message="x" * 32_001)

    def test_document_context_too_long_raises(self) -> None:
        """StreamRequest with document_context > 64000 chars must raise ValidationError."""
        # Arrange / Act / Assert
        with pytest.raises(ValidationError):
            StreamRequest(message="hi", document_context="y" * 64_001)


# ---------------------------------------------------------------------------
# StreamChunk
# ---------------------------------------------------------------------------


class TestStreamChunk:
    """Validate StreamChunk SSE payload schema.

    Verifies type enum constraint and optional message_id field.
    """

    def test_delta_chunk_valid(self) -> None:
        """StreamChunk with type='delta' and content must be valid."""
        # Arrange / Act
        chunk = StreamChunk(type="delta", content="Hello")

        # Assert
        assert chunk.type == "delta"
        assert chunk.content == "Hello"

    def test_done_chunk_with_message_id(self) -> None:
        """StreamChunk with type='done' and message_id must be valid."""
        # Arrange
        msg_id = uuid.uuid4()

        # Act
        chunk = StreamChunk(type="done", content="Full text", message_id=msg_id)

        # Assert
        assert chunk.type == "done"
        assert chunk.message_id == msg_id

    def test_error_chunk_valid(self) -> None:
        """StreamChunk with type='error' should be accepted."""
        # Arrange / Act
        chunk = StreamChunk(type="error", content="Something went wrong")

        # Assert
        assert chunk.type == "error"

    def test_invalid_type_raises(self) -> None:
        """StreamChunk with type not in (delta|done|error) must raise ValidationError."""
        # Arrange / Act / Assert
        with pytest.raises(ValidationError):
            StreamChunk(type="unknown", content="")

    def test_missing_type_raises(self) -> None:
        """StreamChunk without type must raise ValidationError."""
        # Arrange / Act / Assert
        with pytest.raises(ValidationError):
            StreamChunk(content="hello")  # type: ignore[call-arg]

    def test_default_content_is_empty_string(self) -> None:
        """StreamChunk with omitted content should default to empty string."""
        # Arrange / Act
        chunk = StreamChunk(type="done")

        # Assert
        assert chunk.content == ""

    def test_chunk_json_round_trip(self) -> None:
        """StreamChunk.model_dump_json must produce valid JSON parseable back to a chunk."""
        # Arrange
        original = StreamChunk(type="delta", content="token")

        # Act
        json_str = original.model_dump_json()
        restored = StreamChunk.model_validate_json(json_str)

        # Assert
        assert restored.type == original.type
        assert restored.content == original.content


# ---------------------------------------------------------------------------
# SuggestionCreate
# ---------------------------------------------------------------------------


class TestSuggestionCreate:
    """Validate SuggestionCreate internal schema.

    Checks required suggested_text and optional position fields.
    """

    def test_valid_minimal(self) -> None:
        """SuggestionCreate with only required fields must succeed."""
        # Arrange
        conv_id = uuid.uuid4()
        doc_id = uuid.uuid4()

        # Act
        schema = SuggestionCreate(
            document_id=doc_id,
            conversation_id=conv_id,
            suggested_text="Better phrasing here.",
        )

        # Assert
        assert schema.suggested_text == "Better phrasing here."
        assert schema.position_start is None
        assert schema.position_end is None

    def test_empty_suggested_text_raises(self) -> None:
        """SuggestionCreate with empty suggested_text must raise ValidationError."""
        # Arrange / Act / Assert
        with pytest.raises(ValidationError):
            SuggestionCreate(
                document_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                suggested_text="",
            )


# ---------------------------------------------------------------------------
# SuggestionStatusUpdate
# ---------------------------------------------------------------------------


class TestSuggestionStatusUpdate:
    """Validate SuggestionStatusUpdate PATCH schema."""

    def test_valid_applied(self) -> None:
        """SuggestionStatusUpdate with 'applied' status must succeed."""
        # Arrange / Act
        schema = SuggestionStatusUpdate(status=AiSuggestionStatus.applied)

        # Assert
        assert schema.status == AiSuggestionStatus.applied

    def test_invalid_status_raises(self) -> None:
        """SuggestionStatusUpdate with unknown status string must raise ValidationError."""
        # Arrange / Act / Assert
        with pytest.raises(ValidationError):
            SuggestionStatusUpdate(status="unknown_status")  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# ModelInfo / ModelsResponse
# ---------------------------------------------------------------------------


class TestModelInfo:
    """Validate ModelInfo schema for the models catalog endpoint."""

    def test_valid_model_info(self) -> None:
        """ModelInfo with all required fields must parse correctly."""
        # Arrange / Act
        info = ModelInfo(
            id="z-ai/glm-4.5-air:free",
            name="GLM-4.5 Air",
            provider="Z.AI",
            gateway="openrouter",
            is_free=True,
            is_stealth=False,
            context_window=128_000,
            description="Fast general-purpose model.",
        )

        # Assert
        assert info.id == "z-ai/glm-4.5-air:free"
        assert info.is_free is True

    def test_models_response_structure(self) -> None:
        """ModelsResponse must contain a non-empty models list and default_model_id."""
        # Arrange
        model = ModelInfo(
            id="z-ai/glm-4.5-air:free",
            name="GLM-4.5 Air",
            provider="Z.AI",
            gateway="openrouter",
            is_free=True,
            is_stealth=False,
            context_window=128_000,
            description="desc",
        )

        # Act
        response = ModelsResponse(
            models=[model],
            default_model_id="z-ai/glm-4.5-air:free",
        )

        # Assert
        assert len(response.models) == 1
        assert response.default_model_id == "z-ai/glm-4.5-air:free"
