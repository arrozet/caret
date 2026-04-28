"""Unit tests for deterministic metric tools.

These tests validate the metric helper tools used by the general agent without
making any real model calls.
"""

import os
from unittest.mock import MagicMock

os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy-key-for-unit-tests")

from agents.general_agent import GeneralAgentDeps  # noqa: E402
from agents.metrics_tools import (  # noqa: E402
    DEFAULT_READING_WPM,
    CharacterCountValue,
    ReadingTimeValue,
    count_characters,
    count_paragraphs,
    count_sentences,
    count_words,
    estimate_reading_time,
)


def make_ctx(document_content: str | None) -> MagicMock:
    """Build a minimal fake run context for tool testing."""

    ctx = MagicMock()
    ctx.deps = GeneralAgentDeps(document_content=document_content)
    return ctx


class TestCountWords:
    """Unit tests for the count_words tool."""

    def test_count_words_returns_total_words(self) -> None:
        """count_words should count whitespace-delimited words."""

        result = count_words(make_ctx("Hola mundo desde Caret"))

        assert result.ok is True
        assert result.metric_name == "count_words"
        assert result.value == 4
        assert result.metadata["text_source"] == "document_content"
        assert result.warnings == []

    def test_count_words_uses_explicit_text_when_provided(self) -> None:
        """count_words should prefer the explicit text argument over deps content."""

        result = count_words(make_ctx("Ignorado"), text="Uno dos tres")

        assert result.value == 3
        assert result.metadata["text_source"] == "provided_text"

    def test_count_words_warns_when_document_is_missing(self) -> None:
        """count_words should return zero and a warning for missing document content."""

        result = count_words(make_ctx(None))

        assert result.value == 0
        assert result.metadata["text_source"] == "empty_document"
        assert len(result.warnings) == 1


class TestCountCharacters:
    """Unit tests for the count_characters tool."""

    def test_count_characters_returns_both_variants(self) -> None:
        """count_characters should return counts with and without whitespace."""

        result = count_characters(make_ctx("A B\nC"))

        assert result.metric_name == "count_characters"
        assert isinstance(result.value, CharacterCountValue)
        assert result.value.with_spaces == 5
        assert result.value.without_spaces == 3


class TestCountParagraphs:
    """Unit tests for the count_paragraphs tool."""

    def test_count_paragraphs_ignores_blank_lines(self) -> None:
        """count_paragraphs should count only non-empty text blocks."""

        result = count_paragraphs(make_ctx("Uno\n\nDos\nTres\n\n"))

        assert result.metric_name == "count_paragraphs"
        assert result.value == 3

    def test_count_paragraphs_returns_zero_for_whitespace(self) -> None:
        """count_paragraphs should return zero for blank input."""

        result = count_paragraphs(make_ctx("   \n\n  "))

        assert result.value == 0


class TestCountSentences:
    """Unit tests for the count_sentences tool."""

    def test_count_sentences_counts_punctuated_and_trailing_text(self) -> None:
        """count_sentences should count terminal punctuation and final text spans."""

        result = count_sentences(make_ctx("Hola mundo. Como estas? Bien! Ultima"))

        assert result.metric_name == "count_sentences"
        assert result.value == 4


class TestEstimateReadingTime:
    """Unit tests for the estimate_reading_time tool."""

    def test_estimate_reading_time_uses_default_wpm(self) -> None:
        """estimate_reading_time should use the stable default WPM when omitted."""

        result = estimate_reading_time(make_ctx("uno dos tres cuatro cinco seis"))

        assert result.metric_name == "estimate_reading_time"
        assert isinstance(result.value, ReadingTimeValue)
        assert result.value.word_count == 6
        assert result.value.words_per_minute == DEFAULT_READING_WPM
        assert result.value.total_seconds == 2

    def test_estimate_reading_time_falls_back_for_invalid_wpm(self) -> None:
        """estimate_reading_time should warn and fall back when WPM is invalid."""

        result = estimate_reading_time(make_ctx("uno dos"), words_per_minute=0)

        assert result.value.words_per_minute == DEFAULT_READING_WPM
        assert any("Invalid words_per_minute=0" in warning for warning in result.warnings)
