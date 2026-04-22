"""
Shared document metrics tools for agentic workflows.

The tools in this module are intentionally side-effect free so they can be
reused by multiple agent variants without coupling them to document editing.
"""

from dataclasses import dataclass

from pydantic_ai import RunContext


@dataclass
class DocumentMetricsDeps:
    """Dependencies required by document metrics tools."""

    document_content: str | None = None


def count_text_characters(document_content: str | None) -> int:
    """Return the number of characters in a plain-text document snapshot."""
    return len(document_content or "")


def count_document_characters(ctx: RunContext[DocumentMetricsDeps]) -> int:
    """Return the number of characters in the current document snapshot."""
    return count_text_characters(ctx.deps.document_content)
