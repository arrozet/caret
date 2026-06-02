"""
General-purpose agentic document assistant.

This module defines the PydanticAI agent factory for the "general" agent type.
The general agent has access to document-editing and deterministic metric tools:
  1. get_document_content           — reads the current document text from deps
  2. propose_document_replacement   — queues a full-document replacement proposal
  3. metrics tools                  — compute document counts and reading time

A new Agent instance is created per request via build_general_agent() so the
correct per-request model (resolved from the catalog) is used every time.

Architecture (BACKEND.md):
  - Tools only read/write to `GeneralAgentDeps`; they never touch the database.
  - `proposed_changes` is drained by the service layer after streaming ends,
    which then emits `document_change` SSE events to the client.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, NotRequired, TypedDict, cast

from pydantic_ai import Agent, RunContext
from pydantic_ai.models import Model

from agents.metrics_tools import (
    count_characters,
    count_paragraphs,
    count_sentences,
    count_words,
    estimate_reading_time,
)
from schemas.embedding import ChunkResult

# ---------------------------------------------------------------------------
# Dependency injection container
# ---------------------------------------------------------------------------


class ProposedDocumentChange(TypedDict):
    """Queued document change emitted by agent tools after streaming completes."""

    operation: str
    proposed_text: str
    original_text: str
    position_start: NotRequired[int | None]
    position_end: NotRequired[int | None]


@dataclass
class GeneralAgentDeps:
    """
    Dependencies injected into the general agent for each request.

    Attributes:
        document_content: Plain-text snapshot of the current document.
                          None if no document context is available.
        document_context: Raw structured document payload, preserved for
                          editor-aware tool logic.
        selection: Active editor selection metadata when present.
        proposed_changes: Mutable list that agent tools append proposed edits to.
                          The service layer reads this list after the agent run
                          completes to emit document_change SSE events.
        search_workspace_context: Async callback injected by the service layer.
                                  Searches the current document's workspace
                                  without exposing arbitrary workspace IDs.
    """

    document_content: str | None = None
    document_context: dict[str, Any] | str | None = None
    selection: dict[str, Any] | None = None
    proposed_changes: list[ProposedDocumentChange] = field(default_factory=list)
    search_workspace_context: Callable[[str, bool, int], Awaitable[list[ChunkResult]]] | None = None


# ---------------------------------------------------------------------------
# Tool implementations (plain functions — registered per agent instance)
# ---------------------------------------------------------------------------


def get_document_content(ctx: RunContext[GeneralAgentDeps]) -> str:
    """
    Read the current document content.

    Returns the plain-text content of the document currently open in the editor.
    Use this before making any edit proposals to understand what you are editing.

    Args:
        ctx: PydanticAI run context carrying the GeneralAgentDeps.

    Returns:
        The document text, or a notice string if no document is loaded.
    """
    if ctx.deps.document_content is None:
        return "(No document content available)"
    return ctx.deps.document_content


def get_selection_content(ctx: RunContext[GeneralAgentDeps]) -> str:
    """
    Read the currently active selection when one exists.

    Returns the selection text so the model can focus edits on the user's
    highlighted span instead of the entire document.
    """
    selection = ctx.deps.selection or {}
    selected_text = selection.get("text")
    if isinstance(selected_text, str) and selected_text:
        return selected_text
    return "(No selection available)"


def _selection_offset(selection: dict[str, Any] | None, key: str) -> int | None:
    """Read an integer editor selection offset from a loose selection payload."""
    if selection is None:
        return None
    value = selection.get(key)
    return value if isinstance(value, int) else None


def propose_document_replacement(
    ctx: RunContext[GeneralAgentDeps],
    proposed_text: str,
) -> str:
    """
    Propose a full replacement of the document content.

    Queues a document change proposal that the user can accept or reject in the
    editor UI.  This tool does NOT directly modify the document — the user must
    explicitly accept the change in the accept/reject banner.

    Args:
        ctx: PydanticAI run context carrying the GeneralAgentDeps.
        proposed_text: The complete replacement text for the document, even when
            only the current selection is being edited.

    Returns:
        Confirmation string acknowledging that the proposal has been queued.
    """
    original_text = ctx.deps.document_content or ""
    ctx.deps.proposed_changes.append(
        {
            "operation": "replace_full",
            "proposed_text": proposed_text,
            "original_text": original_text,
            "position_start": _selection_offset(ctx.deps.selection, "from"),
            "position_end": _selection_offset(ctx.deps.selection, "to"),
        }
    )
    return "Document replacement proposed. The user will be asked to accept or reject the change."


async def search_workspace_context(
    ctx: RunContext[GeneralAgentDeps],
    query: str,
    exclude_current_document: bool = False,
    top_k: int = 5,
) -> list[ChunkResult]:
    """Search semantically related chunks in the current document's workspace."""

    if ctx.deps.search_workspace_context is None:
        return []
    return await ctx.deps.search_workspace_context(query, exclude_current_document, top_k)


_GENERAL_AGENT_TOOLS = [
    get_document_content,
    get_selection_content,
    propose_document_replacement,
    search_workspace_context,
    count_words,
    count_characters,
    count_paragraphs,
    count_sentences,
    estimate_reading_time,
]


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are Caret AI, an agentic writing assistant embedded in the Caret document editor.

<role>
Help the user write, revise, translate, and understand the current document.
You can read document context, propose full-document replacements,
compute document metrics, and search related context from the same workspace.
</role>

<toolbox>
- get_document_content: reads the current document text.
- get_selection_content: reads the active editor selection when present.
- propose_document_replacement: proposes a full document replacement.
- search_workspace_context: searches semantically related chunks from the same workspace.
- count_words: counts total words.
- count_characters: counts characters with and without spaces.
- count_paragraphs: counts paragraphs.
- count_sentences: counts sentences.
- estimate_reading_time: estimates reading time.
</toolbox>

<instruction_priority>
1. Follow the user's request exactly when it is compatible with these rules.
2. In this agent, document editing is the default behavior.
3. For document-editing intents, prefer tool use over chat output.
3. For metric intents, compute first with the relevant tool, then answer.
</instruction_priority>

<decision_policy>
Assume the user wants you to update the document unless the request is clearly chat-only.
If the request is ambiguous between replying in chat and updating the document,
choose to update the document.

Treat the request as an edit intent if the user asks you to write, edit,
improve, rewrite, translate, expand, shorten, fix, continue, adapt, format,
or otherwise modify the document.
Treat requests such as 'write it in the document', 'write it directly',
'add to document', 'edit the document', 'put it in the doc',
'put it in the document', 'write it in the doc', 'hazlo en la docu',
'escribelo en la docu', 'ponlo en el documento', or similar as edit intents too.

For edit intents:
1. Call get_document_content before proposing changes.
2. If a selection exists, call get_selection_content and focus the change on that span.
3. You MUST call propose_document_replacement with the complete updated
document text, even if only one sentence changes.
4. Do NOT paste the replacement text in the chat reply.
5. After calling propose_document_replacement, write a short explanation
(1-3 sentences) of what you changed and why.

Only stay in chat without proposing a document change when the user is clearly
asking for one of these things:
- document metrics
- a question about the current document
- a request for related context from other documents in the same workspace
- explanation, analysis, brainstorming, or feedback that should not be applied yet
- a request explicitly asking for options, ideas, or text in chat first
- a request unrelated to changing the current document

For metric intents:
1. When the user asks for document metrics such as words, characters,
paragraphs, sentences, or reading time, you MUST call the relevant
metric tool(s) automatically.
2. Do not ask the user which tool to use. Decide internally.
3. For metric-only requests, do NOT call propose_document_replacement.
Return the metric results clearly in the reply.

If the user asks a document-specific question that requires context, read the document first.
If document context is missing, say so clearly and do not invent content.
</decision_policy>

<output_contract>
- Respond in the same language as the user's message.
- Every chat reply must be valid Markdown.
- Be concise. No padding.
- Never fabricate facts.
- For metric replies, prefer a short Markdown list or table.
- For post-edit replies, use 1-3 sentences in Markdown.
- When proposing replacement text, prefer Markdown for headings, lists,
  blockquotes, code, links, and emphasis.
- If you need richer structures such as tables or task lists beyond Markdown
  support, you may emit valid HTML fragments inside the replacement text
  because the editor will parse them.
</output_contract>

<few_shot_examples>
Example 1 - metric request
User: "How many words are in this document?"
Assistant behavior:
1. Call count_words.
2. Reply in Markdown, for example:
- **Words:** 842

Example 2 - edit request with selection
User: "Rewrite this paragraph to sound more formal and put it in the document."
Assistant behavior:
1. Call get_document_content.
2. Call get_selection_content if a selection exists.
3. Call propose_document_replacement with the full updated document text.
4. Reply in Markdown with a brief explanation, for example:
He reescrito el fragmento seleccionado con un tono más formal
y más claro, manteniendo el sentido original.

Example 3 - default-to-edit behavior
User: "Haz una version mas clara de esto."
Assistant behavior:
1. Treat this as an edit intent by default.
2. Call get_document_content.
3. Call get_selection_content if a selection exists.
4. Call propose_document_replacement with the full updated document text.
5. Reply in Markdown with a brief explanation.

Example 4 - explicit chat-only request
User: "Dame tres opciones para el titulo, pero no lo cambies todavia."
Assistant behavior:
1. Do not call propose_document_replacement.
2. Reply in Markdown with the requested options in chat.

Example 5 - edit request without document access
User: "Translate the document to English."
Assistant behavior:
1. Call get_document_content.
2. If no document content is available, reply in Markdown
   explaining that no document is loaded.
3. Do not invent the document text.
</few_shot_examples>
"""


def build_general_agent(
    model: Model,
    system_prompt: str | None = None,
) -> "Agent[GeneralAgentDeps, str]":
    """
    Build a fresh GeneralAgent instance for a single request.

    A new Agent is created per request so that each request uses the correct
    per-request model without side-effects on a shared module-level instance.
    This avoids the PydanticAI module-level instantiation problem where
    Agent() tries to resolve and validate the API key at import time.

    Args:
        model: The resolved LLM model to use for this request.
        system_prompt: Optional per-request system prompt override.

    Returns:
        A configured PydanticAI Agent with document read/edit tools.
    """
    agent: Agent[GeneralAgentDeps, str] = Agent(
        model=model,
        deps_type=GeneralAgentDeps,
        output_type=str,
        system_prompt=system_prompt or _SYSTEM_PROMPT,
        tools=cast(Any, _GENERAL_AGENT_TOOLS),
    )
    return agent


# ---------------------------------------------------------------------------
# Backward-compatibility shim
# ---------------------------------------------------------------------------
# The test suite imports `GeneralAgent` by name and asserts it is an Agent
# instance.  Provide a sentinel Agent built with a string model identifier
# that can be constructed without a real API key so imports do not crash.
# This shim is NOT used in production — all real requests go through
# build_general_agent(model) which receives a fully resolved Model object.


def _make_sentinel_agent() -> "Agent[GeneralAgentDeps, str]":
    """
    Create a placeholder Agent used only for backward-compatible imports.

    The sentinel is built with the string ``"openai:gpt-4o"`` so that
    PydanticAI's lazy-resolution path is taken (no API key needed at
    construction time in recent PydanticAI versions).  It is never invoked
    in production.

    Returns:
        A GeneralAgentDeps-typed Agent that satisfies isinstance checks.
    """
    return Agent(
        model="openai:gpt-4o",
        deps_type=GeneralAgentDeps,
        output_type=str,
        system_prompt=_SYSTEM_PROMPT,
        tools=cast(Any, _GENERAL_AGENT_TOOLS),
    )


GeneralAgent: "Agent[GeneralAgentDeps, str]" = _make_sentinel_agent()
