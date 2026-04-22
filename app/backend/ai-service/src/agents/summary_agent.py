"""
Summary agent specialised in synthesising document content.

The summary agent can inspect the current document snapshot and count
characters when the user asks for a character-limited output.
"""

from dataclasses import dataclass
from typing import Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.models import Model

from agents.prompt_utils import prepend_context
from agents.tools.document_metrics import count_text_characters


@dataclass
class SummaryAgentDeps:
    """Dependencies injected into the summary agent."""

    document_content: str | None = None
    document_context: dict[str, Any] | str | None = None
    max_characters: int | None = None


def build_summary_deps(
    document_context: dict[str, Any] | str | None,
    document_content: str | None,
    user_message: str,
) -> SummaryAgentDeps:
    """Build the dependency container for one summary-agent run."""
    return SummaryAgentDeps(
        document_content=document_content,
        document_context=document_context,
    )


_SYSTEM_PROMPT = (
    "You are Caret's summary specialist. Synthesize the provided document into a clear, "
    "faithful summary that keeps the essential ideas and drops repetition.\n\n"
    "Rules:\n"
    "- Preserve the user's intent and important nuance.\n"
    "- Prefer concise but complete summaries.\n"
    "- If the user gives a character limit, obey it and mention when the limit is too small.\n"
    "- Respond in the same language as the user's request.\n"
)


def get_document_content(ctx: RunContext[SummaryAgentDeps]) -> str:
    """Return the current document snapshot for summarisation."""
    return ctx.deps.document_content or "(No document content available)"


def count_characters(ctx: RunContext[SummaryAgentDeps]) -> int:
    """Count characters in the active document snapshot."""
    return count_text_characters(ctx.deps.document_content)


def build_summary_agent(
    model: Model,
    system_prompt_prefix: str | None = None,
) -> "Agent[SummaryAgentDeps, str]":
    """Build a per-request summary agent."""
    return Agent(
        model=model,
        deps_type=SummaryAgentDeps,
        output_type=str,
        system_prompt=prepend_context(_SYSTEM_PROMPT, system_prompt_prefix),
        tools=[get_document_content, count_characters],
    )
