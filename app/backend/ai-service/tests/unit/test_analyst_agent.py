"""
Unit tests for the analyst agent tools.

Validates that the analyst agent tools (get_document_content,
propose_document_replacement, search_workspace_context) work correctly
in isolation without any real LLM calls or DB connections.
"""

import os
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy-key-for-unit-tests")  # noqa: SIM112

from agents.analyst_agent import (  # noqa: E402
    AnalystAgentDeps,
    build_analyst_agent,
    get_document_content,
    propose_document_replacement,
    search_workspace_context,
)
from schemas.embedding import ChunkResult  # noqa: E402


def make_ctx(deps: AnalystAgentDeps) -> MagicMock:
    """Build a minimal fake RunContext with .deps set."""
    ctx = MagicMock()
    ctx.deps = deps
    return ctx


class TestAnalystAgentDeps:
    """Unit tests for AnalystAgentDeps defaults and building."""

    def test_default_document_content_is_none(self):
        """AnalystAgentDeps.document_content defaults to None."""
        # Arrange
        deps = AnalystAgentDeps()

        # Assert
        assert deps.document_content is None

    def test_proposed_changes_starts_empty(self):
        """AnalystAgentDeps.proposed_changes defaults to an empty list."""
        # Arrange
        deps = AnalystAgentDeps()

        # Assert
        assert deps.proposed_changes == []

    def test_proposed_changes_is_mutable(self):
        """Appending to proposed_changes must work in-place."""
        # Arrange
        deps = AnalystAgentDeps()

        # Act
        deps.proposed_changes.append({"operation": "replace_full", "proposed_text": "test"})

        # Assert
        assert len(deps.proposed_changes) == 1
        assert deps.proposed_changes[0]["proposed_text"] == "test"


class TestGetDocumentContent:
    """Unit tests for the get_document_content tool."""

    def test_returns_document_content_when_present(self):
        """When document_content is set, the tool must return it verbatim."""
        # Arrange
        deps = AnalystAgentDeps(document_content="Hello world document")
        ctx = make_ctx(deps)

        # Act
        result = get_document_content(ctx)

        # Assert
        assert result == "Hello world document"

    def test_returns_placeholder_when_no_document(self):
        """When document_content is None, the tool must return a notice string."""
        # Arrange
        deps = AnalystAgentDeps()
        ctx = make_ctx(deps)

        # Act
        result = get_document_content(ctx)

        # Assert
        assert "No document content" in result


class TestProposeDocumentReplacement:
    """Unit tests for the propose_document_replacement tool."""

    def test_appends_to_proposed_changes(self):
        """Calling the tool must append a change dict to deps.proposed_changes."""
        # Arrange
        original = "Original document text"
        deps = AnalystAgentDeps(document_content=original)
        ctx = make_ctx(deps)

        # Act
        propose_document_replacement(ctx, "New improved text")

        # Assert
        assert len(deps.proposed_changes) == 1
        change = deps.proposed_changes[0]
        assert change["operation"] == "replace_full"
        assert change["proposed_text"] == "New improved text"
        assert change["original_text"] == original

    def test_returns_confirmation_message(self):
        """The tool must return a human-readable confirmation string."""
        # Arrange
        deps = AnalystAgentDeps(document_content="doc")
        ctx = make_ctx(deps)

        # Act
        result = propose_document_replacement(ctx, "new")

        # Assert
        assert "proposed" in result.lower()
        assert "accept" in result.lower()

    def test_original_text_is_empty_when_no_document(self):
        """When document_content is None, original_text must be empty string."""
        # Arrange
        deps = AnalystAgentDeps()
        ctx = make_ctx(deps)

        # Act
        propose_document_replacement(ctx, "new text")

        # Assert
        assert deps.proposed_changes[0]["original_text"] == ""


class TestSearchWorkspaceContext:
    """Unit tests for the search_workspace_context tool."""

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_search_callback(self):
        """When search_workspace_context callback is None, return empty list."""
        # Arrange
        deps = AnalystAgentDeps()
        ctx = make_ctx(deps)

        # Act
        result = await search_workspace_context(ctx, "query")

        # Assert
        assert result == []

    @pytest.mark.asyncio
    async def test_delegates_to_callback(self):
        """When callback is set, it must be called with correct args and result returned."""
        # Arrange
        doc_id = uuid.uuid4()
        ws_id = uuid.uuid4()
        expected: list[ChunkResult] = [
            ChunkResult(
                document_id=doc_id,
                workspace_id=ws_id,
                chunk_index=0,
                chunk_text="matching text",
                document_title="Test Doc",
                is_current_document=False,
                score=0.95,
            )
        ]
        mock_callback = AsyncMock(return_value=expected)
        deps = AnalystAgentDeps(search_workspace_context=mock_callback)
        ctx = make_ctx(deps)

        # Act
        result = await search_workspace_context(
            ctx, "test query", exclude_current_document=True, top_k=3
        )

        # Assert
        mock_callback.assert_called_once_with("test query", True, 3)
        assert result == expected
        assert len(result) == 1
        assert result[0].chunk_text == "matching text"
        assert result[0].score == 0.95


class TestBuildAnalystAgent:
    """Unit tests for the build_analyst_agent factory."""

    def test_build_returns_callable_agent(self):
        """build_analyst_agent must return an Agent that can be called."""
        # Arrange
        from pydantic_ai.messages import ModelResponse, TextPart
        from pydantic_ai.models.function import FunctionModel

        model = FunctionModel(function=lambda: ModelResponse(parts=[TextPart("ok")]))

        # Act
        agent = build_analyst_agent(model)

        # Assert
        assert agent is not None
        assert hasattr(agent, "run")
        assert callable(agent.run)
