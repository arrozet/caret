"""
Curated catalog of OpenRouter models available for selection in the Caret AI panel.

Each entry describes a model that can be passed as the `model_id` field in a
stream request.  The list is intentionally static — it avoids a round-trip to
the OpenRouter /api/v1/models endpoint on every request and gives the product
control over which models are surfaced to users.

To add a model: append a new ModelEntry to OPENROUTER_MODELS.
The `id` field must match the OpenRouter model slug exactly (e.g. the value
you would pass to the model field in a Chat Completions request).
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ModelEntry:
    """Describes a single selectable LLM model."""

    id: str
    """OpenRouter model slug, e.g. 'z-ai/glm-4.5-air:free'."""
    name: str
    """Human-readable display name shown in the UI."""
    provider: str
    """Upstream provider name (e.g. 'Z.AI', 'Meta', 'Google')."""
    is_free: bool = False
    """True when the model has a :free tier on OpenRouter (no API cost)."""
    context_window: int = 0
    """Maximum context window in tokens (0 = unknown)."""
    description: str = ""
    """Short one-line description shown as a tooltip or subtitle."""


# ---------------------------------------------------------------------------
# Curated model list
# ---------------------------------------------------------------------------

OPENROUTER_MODELS: list[ModelEntry] = [
    ModelEntry(
        id="z-ai/glm-4.5-air:free",
        name="GLM-4.5 Air",
        provider="Z.AI",
        is_free=True,
        context_window=128_000,
        description="Lightweight, fast general-purpose model from Z.AI.",
    ),
]

# Quick lookup by model id.
MODELS_BY_ID: dict[str, ModelEntry] = {m.id: m for m in OPENROUTER_MODELS}

# Default model id — mirrors the OPENROUTER_MODEL env-var default.
DEFAULT_MODEL_ID = "z-ai/glm-4.5-air:free"
