"""
Unit tests for the models catalog module.

Verifies that the static curated model list is correctly defined and that
the MODELS_BY_ID index matches the list, and that ``OPENROUTER_MODEL`` points at a catalog entry.
"""

import pytest

from core.config import settings
from core.models_catalog import MODELS_BY_ID, OPENROUTER_MODELS, ModelEntry


class TestModelEntry:
    """Validate ModelEntry dataclass fields and constraints.

    Ensures that ModelEntry instances have the correct types and sensible
    defaults for optional fields.
    """

    def test_model_entry_is_frozen(self) -> None:
        """ModelEntry is a frozen dataclass — mutations must raise FrozenInstanceError."""
        # Arrange
        entry = ModelEntry(id="test-id", name="Test", provider="TestCo")

        # Act / Assert
        with pytest.raises(Exception):
            entry.id = "other-id"  # type: ignore[misc]

    def test_model_entry_defaults(self) -> None:
        """ModelEntry with only required fields should have sensible defaults."""
        # Arrange / Act
        entry = ModelEntry(id="my-model", name="My Model", provider="Me")

        # Assert
        assert entry.is_free is False
        assert entry.context_window == 0
        assert entry.description == ""

    def test_model_entry_full(self) -> None:
        """ModelEntry with all fields populated should store them correctly."""
        # Arrange / Act
        entry = ModelEntry(
            id="z-ai/glm-4.5-air:free",
            name="GLM-4.5 Air",
            provider="Z.AI",
            is_free=True,
            context_window=128_000,
            description="Fast model",
        )

        # Assert
        assert entry.id == "z-ai/glm-4.5-air:free"
        assert entry.name == "GLM-4.5 Air"
        assert entry.provider == "Z.AI"
        assert entry.is_free is True
        assert entry.context_window == 128_000
        assert entry.description == "Fast model"


class TestOpenRouterModels:
    """Validate the OPENROUTER_MODELS curated list.

    Checks list integrity — all entries must have non-empty ids, names,
    and providers, and context_window must be non-negative.
    """

    def test_models_list_is_non_empty(self) -> None:
        """OPENROUTER_MODELS must contain at least one entry."""
        # Arrange — uses module-level constant

        # Act / Assert
        assert len(OPENROUTER_MODELS) >= 1

    def test_all_models_have_non_empty_id(self) -> None:
        """Every ModelEntry must have a non-empty id string."""
        # Arrange / Act
        empty_ids = [m.id for m in OPENROUTER_MODELS if not m.id]

        # Assert
        assert empty_ids == [], f"Models with empty id: {empty_ids}"

    def test_all_models_have_non_empty_name(self) -> None:
        """Every ModelEntry must have a non-empty name string."""
        # Arrange / Act
        empty_names = [m.id for m in OPENROUTER_MODELS if not m.name]

        # Assert
        assert empty_names == [], f"Models with empty name: {empty_names}"

    def test_all_models_have_non_empty_provider(self) -> None:
        """Every ModelEntry must have a non-empty provider string."""
        # Arrange / Act
        empty_providers = [m.id for m in OPENROUTER_MODELS if not m.provider]

        # Assert
        assert empty_providers == [], f"Models with empty provider: {empty_providers}"

    def test_all_model_ids_are_unique(self) -> None:
        """OPENROUTER_MODELS must not contain duplicate model ids."""
        # Arrange
        ids = [m.id for m in OPENROUTER_MODELS]

        # Act / Assert
        assert len(ids) == len(set(ids)), "Duplicate model IDs detected"

    def test_context_window_is_non_negative(self) -> None:
        """Every model's context_window must be >= 0."""
        # Arrange / Act
        negative = [m.id for m in OPENROUTER_MODELS if m.context_window < 0]

        # Assert
        assert negative == [], f"Models with negative context_window: {negative}"


class TestModelsByIdIndex:
    """Validate the MODELS_BY_ID lookup dictionary.

    Ensures the index is consistent with the OPENROUTER_MODELS list.
    """

    def test_models_by_id_has_same_count(self) -> None:
        """MODELS_BY_ID must contain the same number of entries as OPENROUTER_MODELS."""
        # Arrange / Act / Assert
        assert len(MODELS_BY_ID) == len(OPENROUTER_MODELS)

    def test_models_by_id_keys_match_list(self) -> None:
        """MODELS_BY_ID keys must exactly match the ids in OPENROUTER_MODELS."""
        # Arrange
        expected_ids = {m.id for m in OPENROUTER_MODELS}

        # Act / Assert
        assert set(MODELS_BY_ID.keys()) == expected_ids

    def test_models_by_id_values_are_model_entries(self) -> None:
        """All values in MODELS_BY_ID must be ModelEntry instances."""
        # Arrange / Act
        non_entries = [k for k, v in MODELS_BY_ID.items() if not isinstance(v, ModelEntry)]

        # Assert
        assert non_entries == []


class TestDefaultModelId:
    """Validate configured default model id is present in the catalog."""

    def test_openrouter_model_is_in_list(self) -> None:
        """OPENROUTER_MODEL must correspond to an entry in OPENROUTER_MODELS."""
        all_ids = {m.id for m in OPENROUTER_MODELS}
        assert settings.openrouter_model in all_ids

    def test_openrouter_model_in_models_by_id(self) -> None:
        """OPENROUTER_MODEL must be a key in MODELS_BY_ID."""
        assert settings.openrouter_model in MODELS_BY_ID
