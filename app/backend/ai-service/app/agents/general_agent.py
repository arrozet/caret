"""
General-purpose agentic document assistant.

This module defines the PydanticAI agent factory for the "general" agent type.
The general agent has access to two tools:
  1. get_document_content           — reads the current document text from deps
  2. propose_document_replacement   — queues a full-document replacement proposal

A new Agent instance is created per request via build_general_agent() so the
correct per-request model (resolved from the catalog) is used every time.

Architecture (BACKEND.md):
  - Tools only read/write to `GeneralAgentDeps`; they never touch the database.
  - `proposed_changes` is drained by the service layer after streaming ends,
    which then emits `document_change` SSE events to the client.
"""

from dataclasses import dataclass, field

from pydantic_ai import Agent, RunContext
from pydantic_ai.models import Model

# ---------------------------------------------------------------------------
# Dependency injection container
# ---------------------------------------------------------------------------


@dataclass
class GeneralAgentDeps:
    """
    Dependencies injected into the general agent for each request.

    Attributes:
        document_content: Plain-text snapshot of the current document.
                          None if no document context is available.
        proposed_changes: Mutable list that agent tools append proposed edits to.
                          The service layer reads this list after the agent run
                          completes to emit document_change SSE events.
    """

    document_content: str | None = None
    proposed_changes: list[dict] = field(default_factory=list)


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
        proposed_text: The complete replacement text for the document.

    Returns:
        Confirmation string acknowledging that the proposal has been queued.
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


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "You are Caret AI, an agentic writing assistant embedded in the Caret document editor.\n\n"
    "## CRITICAL: HOW TO USE YOUR TOOLS\n\n"
    "You have two tools:\n"
    "  1. get_document_content — reads the current document text\n"
    "  2. propose_document_replacement — proposes a full document replacement\n\n"
    "### MANDATORY RULES — NEVER BREAK THESE:\n\n"
    "RULE 1: Whenever the user asks you to WRITE, EDIT, IMPROVE, REWRITE, TRANSLATE, or "
    "MODIFY the document in ANY way — you MUST call propose_document_replacement with "
    "the complete new document text. DO NOT write the document text in your chat reply.\n\n"
    "RULE 2: Before proposing changes, call get_document_content to read what is there.\n\n"
    "RULE 3: After calling propose_document_replacement, write a SHORT explanation "
    "(1-3 sentences) of what you changed and why.\n\n"
    "RULE 4: If the user says 'write it in the document', 'write it directly', "
    "'add to document', 'edit the document', or similar — this ALWAYS means you must "
    "call propose_document_replacement. Not write in chat.\n\n"
    "### General guidelines:\n"
    "- Respond in the same language as the user's message.\n"
    "- Be concise. No padding.\n"
    "- Never fabricate facts.\n"
)


def build_general_agent(model: Model) -> "Agent[GeneralAgentDeps, str]":
    """
    Build a fresh GeneralAgent instance for a single request.

    A new Agent is created per request so that each request uses the correct
    per-request model without side-effects on a shared module-level instance.
    This avoids the PydanticAI module-level instantiation problem where
    Agent() tries to resolve and validate the API key at import time.

    Args:
        model: The resolved LLM model to use for this request.

    Returns:
        A configured PydanticAI Agent with document read/edit tools.
    """
    agent: Agent[GeneralAgentDeps, str] = Agent(
        model=model,
        deps_type=GeneralAgentDeps,
        output_type=str,
        system_prompt=_SYSTEM_PROMPT,
        tools=[get_document_content, propose_document_replacement],
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
        tools=[get_document_content, propose_document_replacement],
    )


GeneralAgent: "Agent[GeneralAgentDeps, str]" = _make_sentinel_agent()
