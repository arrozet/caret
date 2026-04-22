"""
Utilities for composing agent system prompts.
"""


def prepend_context(base_prompt: str, context: str | None) -> str:
    """Prefix `base_prompt` with optional runtime context."""
    if not context or not context.strip():
        return base_prompt
    return f"{context.strip()}\n\n{base_prompt}"
