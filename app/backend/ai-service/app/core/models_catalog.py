"""
Curated catalog of LLM models available for selection in the Caret AI panel.

Each entry describes a model that can be passed as the `model_id` field in a
stream request.  The list is intentionally static — it avoids a round-trip to
any upstream /models endpoint on every request and gives the product control
over which models are surfaced to users.

Models are divided into two tiers:
  - Free   (is_free=True):  no API cost (OpenRouter :free suffix models).
  - Paid   (is_free=False): billed per token.

They are also divided by gateway — the upstream API endpoint used to call them:
  - "openrouter": Routed through https://openrouter.ai/api/v1 (requires OPENROUTER_API_KEY).
  - "xai":        Called directly via https://api.x.ai/v1        (requires XAI_API_KEY).

Some models are marked as stealth (is_stealth=True).  On OpenRouter, "stealth"
means the model was released anonymously — the AI lab behind it (e.g. OpenAI,
Anthropic, Google) has not been publicly disclosed.  The UI should surface a
note so users know the true creator is unknown.

The `id` field must be the exact model slug expected by the target gateway.
  - OpenRouter slugs look like  "provider/model-name:free"  or  "provider/model-name".
  - xAI slugs look like         "grok-4-1-fast-reasoning"   (no provider prefix).

To add a free model:  append a new ModelEntry with is_free=True  to FREE_MODELS.
To add a paid model:  append a new ModelEntry with is_free=False to PAID_MODELS.
"""

from dataclasses import dataclass
from typing import Literal

Gateway = Literal["openrouter", "xai"]
"""Which upstream API endpoint handles this model."""


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

FREE_MODELS: list[ModelEntry] = [
    ModelEntry(
        id="z-ai/glm-4.5-air:free",
        name="GLM-4.5 Air",
        provider="Z.AI",
        gateway="openrouter",
        is_free=True,
        context_window=128_000,
        description="Lightweight, fast general-purpose model from Z.AI.",
    ),
    ModelEntry(
        id="stepfun/step-3.5-flash:free",
        name="Step 3.5 Flash",
        provider="StepFun",
        gateway="openrouter",
        is_free=True,
        context_window=256_000,
        description="Efficient MoE reasoning model, fast at long contexts.",
    ),
    ModelEntry(
        id="arcee-ai/trinity-large-preview:free",
        name="Trinity Large Preview",
        provider="Arcee AI",
        gateway="openrouter",
        is_free=True,
        context_window=131_000,
        description="400B MoE frontier model, excels in creative writing and reasoning.",
    ),
    ModelEntry(
        id="qwen/qwen3-coder:free",
        name="Qwen3 Coder 480B",
        provider="Qwen",
        gateway="openrouter",
        is_free=True,
        context_window=262_000,
        description="480B MoE code generation model, optimized for complex reasoning.",
    ),
    ModelEntry(
        id="openrouter/healer-alpha",
        name="Healer Alpha",
        provider="OpenRouter",
        gateway="openrouter",
        is_free=True,
        is_stealth=True,
        context_window=262_144,
        description=(
            "Frontier omni-modal model with vision, hearing, reasoning and action capabilities."
        ),
    ),
    ModelEntry(
        id="openrouter/hunter-alpha",
        name="Hunter Alpha",
        provider="OpenRouter",
        gateway="openrouter",
        is_free=True,
        is_stealth=True,
        context_window=1_048_576,
        description="1T-parameter frontier model built for agentic use with 1M token context.",
    ),
]

# ---------------------------------------------------------------------------
# Paid models  (is_free=False)
# ---------------------------------------------------------------------------

PAID_MODELS: list[ModelEntry] = [
    ModelEntry(
        id="grok-4-1-fast-reasoning",
        name="Grok 4.1 Fast Reasoning",
        provider="xAI",
        gateway="xai",
        is_free=False,
        context_window=2_000_000,
        description="Reasoning-enabled Grok model optimised for agentic tasks.",
    ),
]

# ---------------------------------------------------------------------------
# Aggregated catalog — free models first, then paid
# ---------------------------------------------------------------------------

OPENROUTER_MODELS: list[ModelEntry] = [*FREE_MODELS, *PAID_MODELS]

# Quick lookup by model id.
MODELS_BY_ID: dict[str, ModelEntry] = {m.id: m for m in OPENROUTER_MODELS}

# Default model id shown/used by the frontend selector.
DEFAULT_MODEL_ID = "grok-4-1-fast-reasoning"
