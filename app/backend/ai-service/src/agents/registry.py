"""
Agent registry for dispatching predefined Caret agents.

This keeps the service layer simple: stream_response resolves the requested
agent slug once and then delegates to the selected factory.
"""

from dataclasses import dataclass
from importlib import import_module
from typing import Any

from pydantic_ai.models import Model

from agents.types import AgentType


@dataclass(frozen=True)
class AgentFactoryEntry:
    """Metadata for a registered agent factory."""

    slug: AgentType
    description: str
    module_path: str
    builder_name: str
    deps_builder_name: str

    def build(self, model: Model, system_prompt_prefix: str | None = None) -> object:
        """Import and execute the agent factory on demand."""
        module = import_module(self.module_path)
        builder = getattr(module, self.builder_name)
        if system_prompt_prefix is None:
            return builder(model)
        try:
            return builder(model, system_prompt_prefix=system_prompt_prefix)
        except TypeError as exc:
            if "unexpected keyword argument" not in str(exc):
                raise
            return builder(model)

    def build_deps(
        self,
        document_context: Any,
        normalized_document_context: str | None,
        user_message: str,
    ) -> object:
        """Import and execute the agent dependency builder on demand."""
        module = import_module(self.module_path)
        deps_builder = getattr(module, self.deps_builder_name)
        return deps_builder(
            document_context=document_context,
            document_content=normalized_document_context,
            user_message=user_message,
        )


AGENT_REGISTRY: dict[AgentType, AgentFactoryEntry] = {
    "general": AgentFactoryEntry(
        slug="general",
        description="General-purpose agentic document editor",
        module_path="agents.general_agent",
        builder_name="build_general_agent",
        deps_builder_name="build_general_deps",
    ),
    "translation": AgentFactoryEntry(
        slug="translation",
        description="Context-aware translation specialist",
        module_path="agents.translation_agent",
        builder_name="build_translation_agent",
        deps_builder_name="build_translation_deps",
    ),
    "summary": AgentFactoryEntry(
        slug="summary",
        description="Document summarization specialist",
        module_path="agents.summary_agent",
        builder_name="build_summary_agent",
        deps_builder_name="build_summary_deps",
    ),
    "research": AgentFactoryEntry(
        slug="research",
        description="Research specialist with web search",
        module_path="agents.research_agent",
        builder_name="build_research_agent",
        deps_builder_name="build_research_deps",
    ),
}


def get_agent_factory(agent_type: AgentType | None) -> AgentFactoryEntry:
    """Return the registered factory for the requested agent type."""
    return AGENT_REGISTRY[agent_type or "general"]
