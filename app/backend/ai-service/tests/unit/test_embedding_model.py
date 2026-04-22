"""
Unit tests for the DocumentEmbedding ORM model and DocumentEmbeddingRepository.

These tests verify the model structure (table name, columns, inheritance) and
repository behaviour using mock sessions — no database or real pgvector
installation required.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from models.ai import Base, DocumentEmbedding
from repositories.ai_repository import DocumentEmbeddingRepository

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_session() -> MagicMock:
    """Return a MagicMock that satisfies the AsyncSession interface."""
    session = MagicMock()
    session.add = MagicMock()
    session.add_all = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    return session


# ---------------------------------------------------------------------------
# DocumentEmbedding model — structural tests
# ---------------------------------------------------------------------------


class TestDocumentEmbeddingModel:
    """Verify the DocumentEmbedding ORM model structure.

    These tests are pure Python introspection — they do not touch a database.
    """

    def test_table_name(self) -> None:
        """DocumentEmbedding must map to the 'document_embeddings' table."""
        # Arrange / Act / Assert
        assert DocumentEmbedding.__tablename__ == "document_embeddings"

    def test_inherits_from_base(self) -> None:
        """DocumentEmbedding must be a subclass of the shared DeclarativeBase."""
        # Arrange / Act / Assert
        assert issubclass(DocumentEmbedding, Base)

    def test_has_id_column(self) -> None:
        """DocumentEmbedding must declare an 'id' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "id")

    def test_has_document_id_column(self) -> None:
        """DocumentEmbedding must declare a 'document_id' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "document_id")

    def test_has_workspace_id_column(self) -> None:
        """DocumentEmbedding must declare a 'workspace_id' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "workspace_id")

    def test_has_folder_id_column(self) -> None:
        """DocumentEmbedding must declare a nullable 'folder_id' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "folder_id")

    def test_has_chunk_index_column(self) -> None:
        """DocumentEmbedding must declare a 'chunk_index' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "chunk_index")

    def test_has_chunk_text_column(self) -> None:
        """DocumentEmbedding must declare a 'chunk_text' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "chunk_text")

    def test_has_embedding_column(self) -> None:
        """DocumentEmbedding must declare an 'embedding' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "embedding")

    def test_has_created_at_column(self) -> None:
        """DocumentEmbedding must declare a 'created_at' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "created_at")

    def test_has_updated_at_column(self) -> None:
        """DocumentEmbedding must declare an 'updated_at' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "updated_at")

    def test_all_required_columns_present(self) -> None:
        """DocumentEmbedding mapper must include all seven required column names."""
        # Arrange
        expected_columns = {
            "id",
            "document_id",
            "workspace_id",
            "folder_id",
            "chunk_index",
            "chunk_text",
            "embedding",
            "created_at",
            "updated_at",
        }

        # Act
        mapper = DocumentEmbedding.__mapper__
        actual_columns = {col.key for col in mapper.columns}

        # Assert
        assert expected_columns.issubset(actual_columns)


# ---------------------------------------------------------------------------
# DocumentEmbeddingRepository — interface tests
# ---------------------------------------------------------------------------


class TestDocumentEmbeddingRepositoryInterface:
    """Verify that DocumentEmbeddingRepository exposes the required public API."""

    def test_has_bulk_insert_method(self) -> None:
        """DocumentEmbeddingRepository must expose a 'bulk_insert' coroutine."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbeddingRepository, "bulk_insert")
        assert callable(DocumentEmbeddingRepository.bulk_insert)

    def test_has_search_method(self) -> None:
        """DocumentEmbeddingRepository must expose a 'search' coroutine."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbeddingRepository, "search")
        assert callable(DocumentEmbeddingRepository.search)

    def test_has_delete_for_document_method(self) -> None:
        """DocumentEmbeddingRepository must expose a 'delete_for_document' coroutine."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbeddingRepository, "delete_for_document")
        assert callable(DocumentEmbeddingRepository.delete_for_document)


# ---------------------------------------------------------------------------
# DocumentEmbeddingRepository.delete_for_document — behaviour tests
# ---------------------------------------------------------------------------


class TestDocumentEmbeddingRepositoryDeleteForDocument:
    """Test delete_for_document with a mock session."""

    @pytest.mark.asyncio
    async def test_delete_returns_rowcount(self) -> None:
        """delete_for_document should return the number of rows deleted."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()

        mock_result = MagicMock()
        mock_result.rowcount = 3
        session.execute = AsyncMock(return_value=mock_result)

        # Act
        repo = DocumentEmbeddingRepository(session)
        count = await repo.delete_for_document(doc_id)

        # Assert
        assert count == 3
        session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_returns_zero_when_nothing_deleted(self) -> None:
        """delete_for_document should return 0 when no matching rows exist."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()

        mock_result = MagicMock()
        mock_result.rowcount = 0
        session.execute = AsyncMock(return_value=mock_result)

        # Act
        repo = DocumentEmbeddingRepository(session)
        count = await repo.delete_for_document(doc_id)

        # Assert
        assert count == 0

    @pytest.mark.asyncio
    async def test_delete_passes_correct_document_id(self) -> None:
        """delete_for_document must issue exactly one execute call per invocation."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()

        mock_result = MagicMock()
        mock_result.rowcount = 1
        session.execute = AsyncMock(return_value=mock_result)

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.delete_for_document(doc_id)

        # Assert — one DELETE statement was executed
        assert session.execute.call_count == 1


# ---------------------------------------------------------------------------
# DocumentEmbeddingRepository.bulk_insert — behaviour tests
# ---------------------------------------------------------------------------


class TestDocumentEmbeddingRepositoryBulkInsert:
    """Test bulk_insert with a mock session."""

    @pytest.mark.asyncio
    async def test_bulk_insert_returns_chunk_count(self) -> None:
        """bulk_insert should return the number of inserted chunks."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        # delete_for_document uses session.execute; make it return rowcount=0
        delete_result = MagicMock()
        delete_result.rowcount = 0
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (0, "First chunk text.", [0.1] * 1536),
            (1, "Second chunk text.", [0.2] * 1536),
            (2, "Third chunk text.", [0.3] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        count = await repo.bulk_insert(doc_id, chunks, workspace_id=workspace_id)

        # Assert
        assert count == 3

    @pytest.mark.asyncio
    async def test_search_in_workspace_returns_results(self) -> None:
        """search_in_workspace should execute a query and return row tuples."""
        # Arrange
        session = _make_mock_session()
        workspace_id = uuid.uuid4()
        doc_id = uuid.uuid4()
        chunk = MagicMock(spec=DocumentEmbedding)
        chunk.chunk_index = 1
        chunk.chunk_text = "Workspace chunk"

        mock_row = MagicMock()
        mock_row.DocumentEmbedding = chunk
        mock_row.distance = 0.2
        session.execute = AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[mock_row])))

        repo = DocumentEmbeddingRepository(session)

        # Act
        results = await repo.search_in_workspace(
            query_embedding=[0.1] * 1536,
            workspace_id=workspace_id,
            document_id=doc_id,
        )

        # Assert
        assert results[0][0] == chunk
        assert results[0][1] == 0.2

    @pytest.mark.asyncio
    async def test_bulk_insert_calls_add_all(self) -> None:
        """bulk_insert must call session.add_all with the correct number of rows."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        folder_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 0
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (0, "Chunk A", [0.0] * 1536),
            (1, "Chunk B", [0.5] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.bulk_insert(doc_id, chunks, workspace_id=workspace_id, folder_id=folder_id)

        # Assert — add_all was called with a list of two DocumentEmbedding rows
        session.add_all.assert_called_once()
        added_rows = session.add_all.call_args[0][0]
        assert len(added_rows) == 2
        assert all(isinstance(row, DocumentEmbedding) for row in added_rows)
        assert all(row.workspace_id == workspace_id for row in added_rows)
        assert all(row.folder_id == folder_id for row in added_rows)

    @pytest.mark.asyncio
    async def test_bulk_insert_calls_flush(self) -> None:
        """bulk_insert must call session.flush to persist the rows in the transaction."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 0
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (0, "Only chunk", [0.7] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.bulk_insert(doc_id, chunks, workspace_id=workspace_id)

        # Assert
        session.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_bulk_insert_empty_list_returns_zero(self) -> None:
        """bulk_insert with an empty chunk list should return 0 and still delete first."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 5  # pretend 5 old chunks existed
        session.execute = AsyncMock(return_value=delete_result)

        # Act
        repo = DocumentEmbeddingRepository(session)
        count = await repo.bulk_insert(doc_id, [], workspace_id=workspace_id)

        # Assert
        assert count == 0
        # The delete still fired, and add_all was called with an empty list
        session.add_all.assert_called_once_with([])

    @pytest.mark.asyncio
    async def test_bulk_insert_sets_correct_document_id_on_rows(self) -> None:
        """Each inserted DocumentEmbedding row must carry the provided document_id."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 0
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (0, "Hello world", [0.1] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.bulk_insert(doc_id, chunks, workspace_id=workspace_id)

        # Assert
        added_rows = session.add_all.call_args[0][0]
        assert added_rows[0].document_id == doc_id
        assert added_rows[0].workspace_id == workspace_id

    @pytest.mark.asyncio
    async def test_bulk_insert_sets_correct_chunk_index_and_text(self) -> None:
        """bulk_insert must map chunk_index and chunk_text from the input tuples."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        folder_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 0
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (7, "Seventh chunk content", [0.9] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.bulk_insert(doc_id, chunks, workspace_id=workspace_id, folder_id=folder_id)

        # Assert
        row = session.add_all.call_args[0][0][0]
        assert row.chunk_index == 7
        assert row.chunk_text == "Seventh chunk content"
        assert row.workspace_id == workspace_id
        assert row.folder_id == folder_id

    @pytest.mark.asyncio
    async def test_bulk_insert_deletes_existing_rows_before_insert(self) -> None:
        """bulk_insert must clear old rows before inserting the new batch."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 2
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (0, "Fresh content", [0.4] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.bulk_insert(doc_id, chunks, workspace_id=workspace_id)

        # Assert
        session.execute.assert_called_once()
        session.add_all.assert_called_once()
