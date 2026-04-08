"""
Agentic AI module for the Caret AI Service.

This package contains PydanticAI agent definitions with tool-use capabilities.
Each agent is defined in its own module and imported here for convenience.

Available agents:
  - general_agent: General-purpose document assistant with read/edit tools.

Public API:
  - build_general_agent: Factory function that creates a fresh Agent per request.
  - GeneralAgentDeps: Dependency injection dataclass for the general agent.
  - get_document_content: Tool function — reads document text from deps.
  - propose_document_replacement: Tool function — queues a full-document edit.
  - GeneralAgent: Backward-compatible sentinel Agent instance (tests only).
"""

from agents.general_agent import (
    GeneralAgent,
    GeneralAgentDeps,
    build_general_agent,
    get_document_content,
    propose_document_replacement,
)

__all__ = [
    "build_general_agent",
    "GeneralAgentDeps",
    "get_document_content",
    "propose_document_replacement",
    "GeneralAgent",
]
