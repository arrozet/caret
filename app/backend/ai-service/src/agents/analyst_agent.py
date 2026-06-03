"""
Analyst agent — specialized in document analysis, summarization,
and structural improvement proposals.

Tools:
  - get_document_content       : read the full document text
  - analyze_structure          : analyze section hierarchy and coherence
  - propose_document_replacement : propose a structural reorganization
  - search_workspace_context   : find related content from other docs
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, NotRequired, TypedDict, cast

from pydantic_ai import Agent, RunContext
from pydantic_ai.models import Model

from schemas.embedding import ChunkResult


class ProposedDocumentChange(TypedDict):
    """Queued document change emitted by analyst tools after streaming completes."""

    operation: str
    proposed_text: str
    original_text: str
    position_start: NotRequired[int | None]
    position_end: NotRequired[int | None]


@dataclass
class AnalystAgentDeps:
    """
    Dependencies injected into the analyst agent for each request.

    Attributes:
        document_content: Plain-text snapshot of the current document.
        document_context: Raw structured document payload, preserved for
                          editor-aware tool logic.
        proposed_changes: Mutable list that agent tools append proposed edits to.
        search_workspace_context: Async callback injected by the service layer.
    """

    document_content: str | None = None
    document_context: dict[str, Any] | str | None = None
    proposed_changes: list[ProposedDocumentChange] = field(default_factory=list)
    search_workspace_context: Callable[[str, bool, int], Awaitable[list[ChunkResult]]] | None = None


def get_document_content(ctx: RunContext[AnalystAgentDeps]) -> str:
    """
    Read the current document content.

    Returns the plain-text content of the document currently open in the editor.
    Use this before making any analysis or proposals.
    """
    if ctx.deps.document_content is None:
        return "(No document content available)"
    return ctx.deps.document_content


def propose_document_replacement(
    ctx: RunContext[AnalystAgentDeps],
    proposed_text: str,
) -> str:
    """
    Propose a full replacement of the document content.

    Queues a document change proposal that the user can accept or reject in the
    editor UI. Use this to propose structural reorganizations or improvements.

    Args:
        proposed_text: The complete replacement text for the document.
    """
    original_text = ctx.deps.document_content or ""
    ctx.deps.proposed_changes.append(
        {
            "operation": "replace_full",
            "proposed_text": proposed_text,
            "original_text": original_text,
        }
    )
    return "Document replacement proposed. The user will be asked to accept or reject the change."


async def search_workspace_context(
    ctx: RunContext[AnalystAgentDeps],
    query: str,
    exclude_current_document: bool = False,
    top_k: int = 5,
) -> list[ChunkResult]:
    """Search semantically related chunks in the current document's workspace."""
    if ctx.deps.search_workspace_context is None:
        return []
    return await ctx.deps.search_workspace_context(query, exclude_current_document, top_k)


_ANALYST_AGENT_TOOLS = [
    get_document_content,
    propose_document_replacement,
    search_workspace_context,
]

_ANALYST_SYSTEM_PROMPT = """\
You are Caret Analyst, an AI specialized in document analysis, summarization,
and structural improvement.

<role>
You help users understand and improve their documents by:
1. Generating concise summaries of documents or sections
2. Analyzing document structure (hierarchy, section ordering, thematic flow)
3. Proposing structural improvements (reorganization, hierarchy adjustments)
4. Identifying thematic coherence issues
</role>

<tools>
- get_document_content: reads the full document text
- propose_document_replacement: proposes a structural reorganization
- search_workspace_context: finds related content from other documents
</tools>

<guidelines>
- When asked to summarize, first read the full document, then provide:
  * A brief 2-3 sentence executive summary
  * Key topics covered
  * Main conclusions or arguments
- When analyzing structure, identify:
  * Current section hierarchy and heading levels
  * Logical flow between sections
  * Suggestions for reordering or regrouping content
  * Missing sections or underdeveloped topics
- For structural proposals, use propose_document_replacement with the
  reorganized content. Explain your reasoning in chat.
- Always read the document before making any proposal.
- Respond in the same language as the user's message.
- Be thorough but concise in analysis.
</guidelines>
"""


def build_analyst_agent(
    model: Model,
    system_prompt: str | None = None,
) -> "Agent[AnalystAgentDeps, str]":
    """
    Build a fresh AnalystAgent instance for a single request.

    Args:
        model: The resolved LLM model to use for this request.
        system_prompt: Optional per-request system prompt override.

    Returns:
        A configured PydanticAI Agent specialized in document analysis.
    """
    agent: Agent[AnalystAgentDeps, str] = Agent(
        model=model,
        deps_type=AnalystAgentDeps,
        output_type=str,
        system_prompt=system_prompt or _ANALYST_SYSTEM_PROMPT,
        tools=cast(Any, _ANALYST_AGENT_TOOLS),
    )
    return agent
