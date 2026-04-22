"""
Translation agent specialised in adapting document text to another language.

The agent is text-only: it reads the current document context and produces a
translated response without proposing document edits.
"""

from dataclasses import dataclass
from typing import Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.models import Model

from agents.prompt_utils import prepend_context
from agents.tools.document_metrics import count_text_characters


@dataclass
class TranslationAgentDeps:
    """Dependencies injected into the translation agent."""

    document_content: str | None = None
    document_context: dict[str, Any] | str | None = None
    target_language: str | None = None


def build_translation_deps(
    document_context: dict[str, Any] | str | None,
    document_content: str | None,
    user_message: str,
) -> TranslationAgentDeps:
    """Build the dependency container for one translation-agent run."""
    return TranslationAgentDeps(
        document_content=document_content,
        document_context=document_context,
    )


_SYSTEM_PROMPT = (
    "You are Caret's translation specialist. Translate the user's document into the requested "
    "language with natural phrasing, local idioms, and context-aware wording.\n\n"
    "Rules:\n"
    "- Preserve meaning, tone, and intent over literal wording.\n"
    "- If the source contains headings, lists, or emphasis, preserve the structure.\n"
    "- If the user does not specify a target language, ask a short clarifying question.\n"
    "- Respond only with the translated content unless the user asks for an explanation.\n"
)


def get_document_content(ctx: RunContext[TranslationAgentDeps]) -> str:
    """Return the current document snapshot for translation."""
    return ctx.deps.document_content or "(No document content available)"


def count_characters(ctx: RunContext[TranslationAgentDeps]) -> int:
    """Count characters in the active document snapshot for length-sensitive translation."""
    return count_text_characters(ctx.deps.document_content)


def build_translation_agent(
    model: Model,
    system_prompt_prefix: str | None = None,
) -> "Agent[TranslationAgentDeps, str]":
    """Build a per-request translation agent."""
    return Agent(
        model=model,
        deps_type=TranslationAgentDeps,
        output_type=str,
        system_prompt=prepend_context(_SYSTEM_PROMPT, system_prompt_prefix),
        tools=[get_document_content, count_characters],
    )
