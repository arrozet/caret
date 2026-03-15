"""
Unit tests for the DocumentChangePayload and updated StreamChunk schema.

These tests verify that:
  - DocumentChangePayload validates and serialises correctly.
  - StreamChunk accepts the new "document_change" type.
  - StreamChunk rejects unknown types (regression guard).
"""

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.ai import DocumentChangePayload, StreamChunk


class TestDocumentChangePayload:
    """Tests for the DocumentChangePayload schema."""

    def test_valid_replace_full(self) -> None:
        """DocumentChangePayload with operation='replace_full' should be valid."""
        payload = DocumentChangePayload(
            operation="replace_full",
            proposed_text="New document content here.",
            original_text="Old document content.",
        )
        assert payload.operation == "replace_full"
        assert payload.proposed_text == "New document content here."
        assert payload.original_text == "Old document content."

    def test_serialise_to_json(self) -> None:
        """DocumentChangePayload.model_dump_json() must include all three fields."""
        payload = DocumentChangePayload(
            operation="replace_full",
            proposed_text="proposed",
            original_text="original",
        )
        json_str = payload.model_dump_json()
        assert '"operation"' in json_str
        assert '"proposed_text"' in json_str
        assert '"original_text"' in json_str

    def test_missing_required_fields(self) -> None:
        """DocumentChangePayload without required fields must raise ValidationError."""
        with pytest.raises(ValidationError):
            DocumentChangePayload()  # type: ignore[call-arg]

    def test_empty_proposed_text_is_allowed(self) -> None:
        """An empty proposed_text is allowed (valid edge-case for clearing a document)."""
        payload = DocumentChangePayload(
            operation="replace_full",
            proposed_text="",
            original_text="some original",
        )
        assert payload.proposed_text == ""


class TestStreamChunkDocumentChange:
    """Tests for the updated StreamChunk schema with 'document_change' type."""

    def test_delta_chunk_still_valid(self) -> None:
        """StreamChunk with type='delta' should remain valid after schema update."""
        chunk = StreamChunk(type="delta", content="Hello ")
        assert chunk.type == "delta"
        assert chunk.document_change is None

    def test_done_chunk_still_valid(self) -> None:
        """StreamChunk with type='done' should remain valid with optional message_id."""
        msg_id = uuid.uuid4()
        chunk = StreamChunk(type="done", content="Full text", message_id=msg_id)
        assert chunk.type == "done"
        assert chunk.message_id == msg_id

    def test_error_chunk_still_valid(self) -> None:
        """StreamChunk with type='error' should remain valid."""
        chunk = StreamChunk(type="error", content="Something went wrong")
        assert chunk.type == "error"

    def test_document_change_chunk_valid(self) -> None:
        """StreamChunk with type='document_change' must accept a DocumentChangePayload."""
        payload = DocumentChangePayload(
            operation="replace_full",
            proposed_text="New text",
            original_text="Old text",
        )
        chunk = StreamChunk(type="document_change", content="", document_change=payload)
        assert chunk.type == "document_change"
        assert chunk.document_change is not None
        assert chunk.document_change.proposed_text == "New text"

    def test_document_change_chunk_serialises(self) -> None:
        """StreamChunk of type 'document_change' must serialise the nested payload."""
        payload = DocumentChangePayload(
            operation="replace_full",
            proposed_text="proposed",
            original_text="original",
        )
        chunk = StreamChunk(type="document_change", content="", document_change=payload)
        json_str = chunk.model_dump_json()
        assert '"document_change"' in json_str
        assert '"proposed_text"' in json_str

    def test_invalid_type_rejected(self) -> None:
        """StreamChunk must reject unknown type values (regression guard)."""
        with pytest.raises(ValidationError):
            StreamChunk(type="unknown_type", content="")

    def test_document_change_type_without_payload_defaults_to_none(self) -> None:
        """document_change field is optional and defaults to None for non-change chunks."""
        chunk = StreamChunk(type="delta", content="token")
        assert chunk.document_change is None
