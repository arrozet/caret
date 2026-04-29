"""
Unit tests for the general agent tools.

These tests verify the tool functions in app/agents/general_agent.py without
making any real LLM calls.  The tool functions decorated with @GeneralAgent.tool
return the original callable unchanged, so they can be imported and invoked
directly with a fake RunContext.

Note: A dummy OPENAI_API_KEY is set before importing the agent module because
PydanticAI's Agent() constructor validates that the key exists at import time
when the model string is "openai:gpt-4o".  The key is never used in these tests.
"""

import os

# Set a dummy key so PydanticAI can construct the Agent at module level without
# reaching out to any real LLM endpoint.
os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy-key-for-unit-tests")

from unittest.mock import MagicMock  # noqa: E402

from pydantic_ai.messages import ModelResponse, TextPart  # noqa: E402
from pydantic_ai.models.function import FunctionModel  # noqa: E402

from agents.general_agent import (  # noqa: E402
    GeneralAgent,
    GeneralAgentDeps,
    build_general_agent,
    get_document_content,
    propose_document_replacement,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_ctx(deps: GeneralAgentDeps) -> MagicMock:
    """
    Build a minimal fake RunContext whose `.deps` attribute is set to `deps`.

    PydanticAI tool functions receive a RunContext as their first argument.
    For unit testing the pure Python logic of the tools, a MagicMock that
    exposes only the `.deps` attribute is sufficient.

    Args:
        deps: The GeneralAgentDeps instance to attach to the fake context.

    Returns:
        MagicMock configured with ctx.deps = deps.
    """
    ctx = MagicMock()
    ctx.deps = deps
    return ctx


# ---------------------------------------------------------------------------
# GeneralAgentDeps defaults
# ---------------------------------------------------------------------------


class TestGeneralAgentDepsDefaults:
    """Verify the default values of the GeneralAgentDeps dataclass."""

    def test_general_agent_deps_defaults(self) -> None:
        """GeneralAgentDeps() must initialise with document_content=None and
        empty proposed_changes."""
        deps = GeneralAgentDeps()
        assert deps.document_content is None
        assert deps.proposed_changes == []

    def test_general_agent_deps_proposed_changes_is_independent(self) -> None:
        """Each GeneralAgentDeps instance must have its own proposed_changes list (no shared
        default).
        """
        deps_a = GeneralAgentDeps()
        deps_b = GeneralAgentDeps()
        deps_a.proposed_changes.append({"key": "value"})
        # deps_b must not be affected by the mutation of deps_a
        assert deps_b.proposed_changes == []


# ---------------------------------------------------------------------------
# get_document_content tool
# ---------------------------------------------------------------------------


class TestGetDocumentContent:
    """Unit tests for the get_document_content tool function."""

    def test_get_document_content_returns_content(self) -> None:
        """get_document_content returns deps.document_content when it is set."""
        deps = GeneralAgentDeps(document_content="Hello, world!")
        ctx = make_ctx(deps)
        result = get_document_content(ctx)
        assert result == "Hello, world!"

    def test_get_document_content_returns_notice_when_none(self) -> None:
        """get_document_content returns the no-content notice when document_content is None."""
        deps = GeneralAgentDeps(document_content=None)
        ctx = make_ctx(deps)
        result = get_document_content(ctx)
        assert result == "(No document content available)"

    def test_get_document_content_returns_empty_string_as_is(self) -> None:
        """get_document_content returns an empty string when document_content is set to ''."""
        deps = GeneralAgentDeps(document_content="")
        ctx = make_ctx(deps)
        # Empty string is NOT None, so it should be returned verbatim.
        result = get_document_content(ctx)
        assert result == ""


# ---------------------------------------------------------------------------
# propose_document_replacement tool
# ---------------------------------------------------------------------------


class TestProposeDocumentReplacement:
    """Unit tests for the propose_document_replacement tool function."""

    def test_propose_document_replacement_appends_change(self) -> None:
        """propose_document_replacement appends a change dict to deps.proposed_changes."""
        deps = GeneralAgentDeps(document_content="Original text.")
        ctx = make_ctx(deps)
        propose_document_replacement(ctx, proposed_text="New text.")
        assert len(deps.proposed_changes) == 1
        change = deps.proposed_changes[0]
        assert "operation" in change
        assert "proposed_text" in change
        assert "original_text" in change

    def test_propose_document_replacement_returns_confirmation(self) -> None:
        """propose_document_replacement returns a non-empty confirmation string."""
        deps = GeneralAgentDeps(document_content="Some content.")
        ctx = make_ctx(deps)
        result = propose_document_replacement(ctx, proposed_text="Replacement.")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_propose_document_replacement_preserves_original(self) -> None:
        """original_text in the appended change must match deps.document_content."""
        original = "The original document text."
        deps = GeneralAgentDeps(document_content=original)
        ctx = make_ctx(deps)
        propose_document_replacement(ctx, proposed_text="Proposed replacement.")
        assert deps.proposed_changes[0]["original_text"] == original

    def test_propose_document_replacement_stores_proposed_text(self) -> None:
        """proposed_text in the appended change must match the argument passed to the tool."""
        proposed = "Brand new content."
        deps = GeneralAgentDeps(document_content="Old content.")
        ctx = make_ctx(deps)
        propose_document_replacement(ctx, proposed_text=proposed)
        assert deps.proposed_changes[0]["proposed_text"] == proposed

    def test_propose_document_replacement_operation_is_replace_full(self) -> None:
        """The operation field in the appended change must be 'replace_full'."""
        deps = GeneralAgentDeps(document_content="Original.")
        ctx = make_ctx(deps)
        propose_document_replacement(ctx, proposed_text="New.")
        assert deps.proposed_changes[0]["operation"] == "replace_full"

    def test_propose_document_replacement_original_text_none_becomes_empty(self) -> None:
        """When document_content is None, original_text in the change must be an empty string."""
        deps = GeneralAgentDeps(document_content=None)
        ctx = make_ctx(deps)
        propose_document_replacement(ctx, proposed_text="Something.")
        assert deps.proposed_changes[0]["original_text"] == ""

    def test_propose_document_replacement_multiple_calls_append(self) -> None:
        """Multiple calls to propose_document_replacement must each append a new entry."""
        deps = GeneralAgentDeps(document_content="Doc.")
        ctx = make_ctx(deps)
        propose_document_replacement(ctx, proposed_text="First replacement.")
        propose_document_replacement(ctx, proposed_text="Second replacement.")
        assert len(deps.proposed_changes) == 2
        assert deps.proposed_changes[0]["proposed_text"] == "First replacement."
        assert deps.proposed_changes[1]["proposed_text"] == "Second replacement."


# ---------------------------------------------------------------------------
# Smoke test: agent is importable and has tools registered
# ---------------------------------------------------------------------------


class TestGeneralAgentRegistration:
    """Verify that the agent object is properly configured (no real LLM calls)."""

    def test_general_agent_is_agent_instance(self) -> None:
        """GeneralAgent must be a PydanticAI Agent instance."""
        from pydantic_ai import Agent

        assert isinstance(GeneralAgent, Agent)

    def test_general_agent_deps_type(self) -> None:
        """GeneralAgent must have GeneralAgentDeps as its deps_type."""
        # PydanticAI exposes _deps_type on Agent
        assert GeneralAgent._deps_type is GeneralAgentDeps

    def test_build_general_agent_registers_metric_tools(self) -> None:
        """The general agent should expose the metric tool pack on the single agent instance."""

        agent = build_general_agent(
            FunctionModel(lambda messages, info: ModelResponse(parts=[TextPart(content="ok")]))
        )

        tool_names = set(agent._function_toolset.tools.keys())

        assert "count_words" in tool_names
        assert "count_characters" in tool_names
        assert "count_paragraphs" in tool_names
        assert "count_sentences" in tool_names
        assert "estimate_reading_time" in tool_names

    def test_system_prompt_requires_automatic_metric_tool_usage(self) -> None:
        """The prompt should force internal metric-tool selection for metric intents."""

        agent = build_general_agent(
            FunctionModel(lambda messages, info: ModelResponse(parts=[TextPart(content="ok")]))
        )

        system_prompt = agent._system_prompts[0]
        normalized_prompt = " ".join(system_prompt.split())

        assert "When the user asks for document metrics" in normalized_prompt
        assert "MUST call the relevant metric tool(s) automatically" in normalized_prompt
        assert "Do not ask the user which tool to use" in normalized_prompt

    def test_system_prompt_requires_markdown_chat_replies(self) -> None:
        """The prompt should require Markdown formatting for normal chat replies."""

        agent = build_general_agent(
            FunctionModel(lambda messages, info: ModelResponse(parts=[TextPart(content="ok")]))
        )

        system_prompt = agent._system_prompts[0]

        assert "Every chat reply must be valid Markdown" in system_prompt

    def test_system_prompt_defaults_to_document_edits_when_ambiguous(self) -> None:
        """
        The prompt should default to editing the document unless
        the request is clearly chat-only.
        """

        agent = build_general_agent(
            FunctionModel(lambda messages, info: ModelResponse(parts=[TextPart(content="ok")]))
        )

        system_prompt = agent._system_prompts[0]
        normalized_prompt = " ".join(system_prompt.split())

        assert (
            "Assume the user wants you to update the document unless "
            "the request is clearly chat-only"
        ) in normalized_prompt
        assert (
            "If the request is ambiguous between replying in chat and "
            "updating the document, choose to update the document"
        ) in normalized_prompt
