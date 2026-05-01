"""Deterministic document metrics tools for the general agent.

These tools operate on plain-text document snapshots and return structured JSON
payloads so the agent can reason over reproducible metrics without touching the
editor mutation flow.
"""

import re
from dataclasses import dataclass
from math import ceil
from typing import Any, Literal

from pydantic import BaseModel, Field
from pydantic_ai import RunContext

DEFAULT_READING_WPM = 200


class CharacterCountValue(BaseModel):
    """Character-count result payload."""

    with_spaces: int
    without_spaces: int


class ReadingTimeValue(BaseModel):
    """Reading-time result payload."""

    minutes: int
    seconds: int
    total_seconds: int
    word_count: int
    words_per_minute: int


MetricValue = int | CharacterCountValue | ReadingTimeValue


class MetricResult(BaseModel):
    """Structured metric tool result returned to the agent."""

    ok: bool = True
    metric_name: Literal[
        "count_words",
        "count_characters",
        "count_paragraphs",
        "count_sentences",
        "estimate_reading_time",
    ]
    value: MetricValue
    metadata: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


@dataclass
class ResolvedMetricText:
    """Resolved text and metadata shared by metric tools."""

    text: str
    source: Literal["provided_text", "document_content", "empty_document"]
    warnings: list[str]


def _normalize_text(text: str) -> str:
    """Normalize line endings so metrics are stable across platforms."""

    return text.replace("\r\n", "\n").replace("\r", "\n")


def _resolve_metric_text(ctx: RunContext[Any], text: str | None) -> ResolvedMetricText:
    """Resolve explicit text or fall back to the current document snapshot."""

    if isinstance(text, str):
        return ResolvedMetricText(
            text=_normalize_text(text),
            source="provided_text",
            warnings=[],
        )

    document_content = getattr(ctx.deps, "document_content", None)
    if isinstance(document_content, str):
        return ResolvedMetricText(
            text=_normalize_text(document_content),
            source="document_content",
            warnings=[],
        )

    return ResolvedMetricText(
        text="",
        source="empty_document",
        warnings=["No document content was available; metric was calculated on empty text."],
    )


def _count_words(text: str) -> int:
    """Count whitespace-delimited words deterministically."""

    return len(re.findall(r"\S+", text))


def _count_paragraphs(text: str) -> int:
    """Count non-empty text blocks separated by line breaks."""

    stripped_text = text.strip()
    if not stripped_text:
        return 0

    return len([segment for segment in re.split(r"\n+", stripped_text) if segment.strip()])


def _count_sentences(text: str) -> int:
    """Count sentence-like spans split by terminal punctuation or final text."""

    normalized = " ".join(text.replace("\n", " ").split())
    if not normalized:
        return 0

    return len([match for match in re.findall(r"[^.!?]+(?:[.!?]+|$)", normalized) if match.strip()])


def count_words(ctx: RunContext[Any], text: str | None = None) -> MetricResult:
    """Return the total number of words in the target text."""

    resolved = _resolve_metric_text(ctx, text)
    word_count = _count_words(resolved.text)
    return MetricResult(
        metric_name="count_words",
        value=word_count,
        metadata={
            "text_source": resolved.source,
            "text_length": len(resolved.text),
            "tokenization": "whitespace",
        },
        warnings=resolved.warnings,
    )


def count_characters(ctx: RunContext[Any], text: str | None = None) -> MetricResult:
    """Return character counts with and without whitespace."""

    resolved = _resolve_metric_text(ctx, text)
    return MetricResult(
        metric_name="count_characters",
        value=CharacterCountValue(
            with_spaces=len(resolved.text),
            without_spaces=len(re.sub(r"\s+", "", resolved.text)),
        ),
        metadata={
            "text_source": resolved.source,
            "text_length": len(resolved.text),
        },
        warnings=resolved.warnings,
    )


def count_paragraphs(ctx: RunContext[Any], text: str | None = None) -> MetricResult:
    """Return the number of paragraphs in the target text."""

    resolved = _resolve_metric_text(ctx, text)
    paragraph_count = _count_paragraphs(resolved.text)
    return MetricResult(
        metric_name="count_paragraphs",
        value=paragraph_count,
        metadata={
            "text_source": resolved.source,
            "text_length": len(resolved.text),
            "paragraph_rule": "non-empty line blocks",
        },
        warnings=resolved.warnings,
    )


def count_sentences(ctx: RunContext[Any], text: str | None = None) -> MetricResult:
    """Return the number of sentences in the target text."""

    resolved = _resolve_metric_text(ctx, text)
    sentence_count = _count_sentences(resolved.text)
    return MetricResult(
        metric_name="count_sentences",
        value=sentence_count,
        metadata={
            "text_source": resolved.source,
            "text_length": len(resolved.text),
            "sentence_rule": "terminal punctuation or trailing text",
        },
        warnings=resolved.warnings,
    )


def estimate_reading_time(
    ctx: RunContext[Any],
    text: str | None = None,
    words_per_minute: int = DEFAULT_READING_WPM,
) -> MetricResult:
    """Estimate reading time for the target text using a configurable WPM."""

    resolved = _resolve_metric_text(ctx, text)
    safe_wpm = words_per_minute if words_per_minute > 0 else DEFAULT_READING_WPM
    warnings = list(resolved.warnings)
    if words_per_minute <= 0:
        warnings.append(
            f"Invalid words_per_minute={words_per_minute}; defaulted to {DEFAULT_READING_WPM}."
        )

    word_count = _count_words(resolved.text)
    total_seconds = ceil((word_count / safe_wpm) * 60) if word_count > 0 else 0

    return MetricResult(
        metric_name="estimate_reading_time",
        value=ReadingTimeValue(
            minutes=total_seconds // 60,
            seconds=total_seconds % 60,
            total_seconds=total_seconds,
            word_count=word_count,
            words_per_minute=safe_wpm,
        ),
        metadata={
            "text_source": resolved.source,
            "text_length": len(resolved.text),
            "estimation_basis": "word_count / words_per_minute",
        },
        warnings=warnings,
    )


__all__ = [
    "CharacterCountValue",
    "DEFAULT_READING_WPM",
    "MetricResult",
    "ReadingTimeValue",
    "count_characters",
    "count_paragraphs",
    "count_sentences",
    "count_words",
    "estimate_reading_time",
]
