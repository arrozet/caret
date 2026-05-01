"""
Curated catalog of LLM models available for selection in the Caret AI panel.

Each entry describes a model that can be passed as the `model_id` field in a
stream request.  The list is intentionally static — it avoids a round-trip to
any upstream /models endpoint on every request and gives the product control
over which models are surfaced to users.

Models are divided into two tiers:
  - Free   (is_free=True):  no API cost (OpenRouter :free suffix models).
  - Paid   (is_free=False): billed per token.

All models are routed through OpenRouter (https://openrouter.ai/api/v1) using
OPENROUTER_API_KEY. OpenRouter normalizes tool/function calling across upstream
providers.

Some models are marked as stealth (is_stealth=True).  On OpenRouter, "stealth"
means the model was released anonymously — the AI lab behind it (e.g. OpenAI,
Anthropic, Google) has not been publicly disclosed.  The UI should surface a
note so users know the true creator is unknown.

The `id` field must be the exact model slug expected by OpenRouter
(e.g. "provider/model-name:free" or "provider/model-name").

To add a free model:  append a new ModelEntry with is_free=True  to FREE_MODELS.
To add a paid model:  append a new ModelEntry with is_free=False to PAID_MODELS.
"""

from dataclasses import dataclass
from typing import Literal

Gateway = Literal["openrouter"]
"""Upstream API: all catalog models use the OpenRouter-compatible endpoint."""


@dataclass(frozen=True)
class ModelEntry:
    """Describes a single selectable LLM model."""

    id: str
    """Model slug used when calling the target gateway."""
    name: str
    """Human-readable display name shown in the UI."""
    provider: str
    """Upstream provider name (e.g. 'Z.AI', 'xAI', 'Google')."""
    gateway: Gateway = "openrouter"
    """Which upstream API endpoint to use for this model."""
    is_free: bool = False
    """True when the model has no API cost."""
    context_window: int = 0
    """Maximum context window in tokens (0 = unknown)."""
    description: str = ""
    """Short one-line description shown as a tooltip or subtitle."""
    is_stealth: bool = False
    """True when the AI lab behind the model has not been publicly disclosed.
    These are anonymous releases on OpenRouter where the real creator (e.g. OpenAI,
    Anthropic, Google) is unknown.  The UI should inform users of this."""


# ---------------------------------------------------------------------------
# Free models  (is_free=True, gateway="openrouter")
# ---------------------------------------------------------------------------

FREE_MODELS: list[ModelEntry] = []

# ---------------------------------------------------------------------------
# Paid models  (is_free=False)
# ---------------------------------------------------------------------------

PAID_MODELS: list[ModelEntry] = [
    ModelEntry(
        id="deepseek/deepseek-v4-flash",
        name="DeepSeek V4 Flash",
        provider="DeepSeek",
        gateway="openrouter",
        is_free=False,
        context_window=1_048_576,
        description="Primary model for fast, high-throughput general and coding workloads.",
    ),
    ModelEntry(
        id="minimax/minimax-m2.7",
        name="MiniMax M2.7",
        provider="MiniMax",
        gateway="openrouter",
        is_free=False,
        context_window=196_608,
        description="First fallback model with strong agentic and planning capabilities.",
    ),
    ModelEntry(
        id="xiaomi/mimo-v2.5",
        name="MiMo-V2.5",
        provider="Xiaomi",
        gateway="openrouter",
        is_free=False,
        context_window=1_048_576,
        description="Second fallback model optimized for multimodal and long-context tasks.",
    ),
    ModelEntry(
        id="xiaomi/mimo-v2.5-pro",
        name="MiMo-V2.5-Pro",
        provider="Xiaomi",
        gateway="openrouter",
        is_free=False,
        context_window=1_048_576,
        description="Third fallback model focused on stronger complex reasoning performance.",
    ),
    ModelEntry(
        id="moonshotai/kimi-k2.6",
        name="Kimi K2.6",
        provider="Moonshot AI",
        gateway="openrouter",
        is_free=False,
        context_window=256_000,
        description="Final fallback model for long-horizon coding and orchestration tasks.",
    ),
]

# ---------------------------------------------------------------------------
# Aggregated catalog — free models first, then paid
# ---------------------------------------------------------------------------

OPENROUTER_MODELS: list[ModelEntry] = [*FREE_MODELS, *PAID_MODELS]

# Quick lookup by model id.
MODELS_BY_ID: dict[str, ModelEntry] = {m.id: m for m in OPENROUTER_MODELS}

# Server default model id: ``Settings.openrouter_model`` (env ``OPENROUTER_MODEL``).
# Keep that value in sync with an entry above so GET /ai/models and the editor stay aligned.
