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

FREE_MODELS: list[ModelEntry] = [
    ModelEntry(
        id="google/gemma-4-31b-it:free",
        name="Gemma 4 31B",
        provider="Google",
        gateway="openrouter",
        is_free=True,
        context_window=262_144,
        description="Instruction-tuned Gemma with native function calling and long context.",
    ),
    ModelEntry(
        id="z-ai/glm-4.5-air:free",
        name="GLM-4.5 Air",
        provider="Z.AI",
        gateway="openrouter",
        is_free=True,
        context_window=128_000,
        description="Lightweight, fast general-purpose model from Z.AI.",
    ),
]

# ---------------------------------------------------------------------------
# Paid models  (is_free=False)
# ---------------------------------------------------------------------------

PAID_MODELS: list[ModelEntry] = [
    ModelEntry(
        id="x-ai/grok-4.1-fast",
        name="Grok 4.1 Fast",
        provider="xAI",
        gateway="openrouter",
        is_free=False,
        context_window=2_000_000,
        description=(
            "Agentic tool-calling model for support, research, and long context via OpenRouter."
        ),
    ),
    ModelEntry(
        id="openai/gpt-5-nano",
        name="GPT-5 Nano",
        provider="OpenAI",
        gateway="openrouter",
        is_free=False,
        context_window=400_000,
        description="Smallest GPT-5 family variant — fast, low-latency developer workflows.",
    ),
    ModelEntry(
        id="openai/gpt-5.4-nano",
        name="GPT-5.4 Nano",
        provider="OpenAI",
        gateway="openrouter",
        is_free=False,
        context_window=400_000,
        description="Lightweight GPT-5.4 tier for speed, volume, and sub-agent style tasks.",
    ),
    ModelEntry(
        id="google/gemini-3.1-flash-lite-preview",
        name="Gemini 3.1 Flash Lite",
        provider="Google",
        gateway="openrouter",
        is_free=False,
        context_window=1_048_576,
        description="High-efficiency Gemini preview for volume, RAG, translation, and code.",
    ),
    ModelEntry(
        id="z-ai/glm-4.7-flash",
        name="GLM 4.7 Flash",
        provider="Z.AI",
        gateway="openrouter",
        is_free=False,
        context_window=202_752,
        description="30B-class model tuned for coding, planning, and tool collaboration.",
    ),
    ModelEntry(
        id="deepseek/deepseek-v3.2",
        name="DeepSeek V3.2",
        provider="DeepSeek",
        gateway="openrouter",
        is_free=False,
        context_window=163_840,
        description="Reasoning and agentic tool-use focused general model.",
    ),
    ModelEntry(
        id="xiaomi/mimo-v2-flash",
        name="MiMo-V2 Flash",
        provider="Xiaomi",
        gateway="openrouter",
        is_free=False,
        context_window=262_144,
        description="Open MoE foundation model with hybrid-thinking toggle.",
    ),
    ModelEntry(
        id="moonshotai/kimi-k2.5",
        name="Kimi K2.5",
        provider="Moonshot AI",
        gateway="openrouter",
        is_free=False,
        context_window=262_144,
        description="Native multimodal model with strong visual coding and agent-style use.",
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
