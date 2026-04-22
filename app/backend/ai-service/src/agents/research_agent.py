"""
Research agent specialised in investigating questions with external sources.

The agent uses document context and web search capability, but it does not
propose document edits. If the environment cannot support web search, the
capability layer can fall back per provider.
"""

from dataclasses import dataclass
from typing import Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.capabilities import WebSearch
from pydantic_ai.models import Model

from agents.prompt_utils import prepend_context
from agents.tools.document_metrics import count_text_characters


@dataclass
class ResearchAgentDeps:
    """Dependencies injected into the research agent."""

    document_content: str | None = None
    document_context: dict[str, Any] | str | None = None
    query: str | None = None


def build_research_deps(
    document_context: dict[str, Any] | str | None,
    document_content: str | None,
    user_message: str,
) -> ResearchAgentDeps:
    """Build the dependency container for one research-agent run."""
    return ResearchAgentDeps(
        document_content=document_content,
        document_context=document_context,
        query=user_message,
    )


_SYSTEM_PROMPT = (
    "You are Caret's research specialist. Investigate the user's question using web search, "
    "the provided document context, and careful source synthesis.\n\n"
    "Rules:\n"
    "- Distinguish evidence from inference.\n"
    "- Summarize what you found and cite the most relevant sources in plain language.\n"
    "- If the question cannot be answered confidently, say what is missing.\n"
    "- Do not fabricate citations or source details.\n"
)


def get_document_content(ctx: RunContext[ResearchAgentDeps]) -> str:
    """Return the current document snapshot for context-aware research."""
    return ctx.deps.document_content or "(No document content available)"


def count_characters(ctx: RunContext[ResearchAgentDeps]) -> int:
    """Count characters in the active document snapshot."""
    return count_text_characters(ctx.deps.document_content)


def build_research_agent(
    model: Model,
    system_prompt_prefix: str | None = None,
) -> "Agent[ResearchAgentDeps, str]":
    """Build a per-request research agent with web-search capability."""
    return Agent(
        model=model,
        deps_type=ResearchAgentDeps,
        output_type=str,
        system_prompt=prepend_context(_SYSTEM_PROMPT, system_prompt_prefix),
        capabilities=[WebSearch()],
        tools=[get_document_content, count_characters],
    )
