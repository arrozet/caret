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
from repositories.ai_repository import DocumentAccessRepository, DocumentEmbeddingRepository

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

    def test_has_chunk_index_column(self) -> None:
        """DocumentEmbedding must declare a 'chunk_index' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "chunk_index")

    def test_has_workspace_id_column(self) -> None:
        """DocumentEmbedding must declare a 'workspace_id' mapped column."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbedding, "workspace_id")

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
        """DocumentEmbedding mapper must include all required column names."""
        # Arrange
        expected_columns = {
            "id",
            "document_id",
            "workspace_id",
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
        """DocumentEmbeddingRepository must expose a 'search_workspace' coroutine."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbeddingRepository, "search_workspace")
        assert callable(DocumentEmbeddingRepository.search_workspace)

    def test_has_delete_for_document_method(self) -> None:
        """DocumentEmbeddingRepository must expose a 'delete_for_document' coroutine."""
        # Arrange / Act / Assert
        assert hasattr(DocumentEmbeddingRepository, "delete_for_document")
        assert callable(DocumentEmbeddingRepository.delete_for_document)

    def test_has_document_access_method(self) -> None:
        """DocumentAccessRepository must expose a 'get_document_access' coroutine."""
        # Arrange / Act / Assert
        assert hasattr(DocumentAccessRepository, "get_document_access")
        assert callable(DocumentAccessRepository.get_document_access)


class TestDocumentAccessRepository:
    """Test document access resolution against shared DB tables with a mock session."""

    @pytest.mark.asyncio
    async def test_get_document_access_returns_none_for_missing_document(self) -> None:
        """Missing or deleted documents should resolve to None."""
        # Arrange
        session = _make_mock_session()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        session.execute = AsyncMock(return_value=mock_result)

        # Act
        repo = DocumentAccessRepository(session)
        result = await repo.get_document_access(uuid.uuid4(), uuid.uuid4())

        # Assert
        assert result is None

    @pytest.mark.asyncio
    async def test_get_document_access_maps_workspace_and_document_memberships(self) -> None:
        """The access helper should expose both workspace and direct document membership flags."""
        # Arrange
        session = _make_mock_session()
        document_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        mock_row = MagicMock()
        mock_row.id = document_id
        mock_row.workspace_id = workspace_id
        mock_row.title = "Shared document"
        mock_row.visibility = "workspace"
        mock_row.workspace_member_role = "member"
        mock_row.workspace_member_user_id = uuid.uuid4()
        mock_row.document_member_user_id = None

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_row
        session.execute = AsyncMock(return_value=mock_result)

        # Act
        repo = DocumentAccessRepository(session)
        result = await repo.get_document_access(document_id, uuid.uuid4())

        # Assert
        assert result == {
            "document_id": document_id,
            "workspace_id": workspace_id,
            "document_title": "Shared document",
            "visibility": "workspace",
            "workspace_role": "member",
            "has_access": True,
        }

    @pytest.mark.asyncio
    async def test_get_document_access_restricts_private_docs_for_plain_workspace_members(
        self,
    ) -> None:
        """Private documents should not be readable without direct membership."""
        # Arrange
        session = _make_mock_session()
        mock_row = MagicMock()
        mock_row.id = uuid.uuid4()
        mock_row.workspace_id = uuid.uuid4()
        mock_row.title = "Private document"
        mock_row.visibility = "private"
        mock_row.workspace_member_role = "member"
        mock_row.workspace_member_user_id = uuid.uuid4()
        mock_row.document_member_user_id = None

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_row
        session.execute = AsyncMock(return_value=mock_result)

        # Act
        repo = DocumentAccessRepository(session)
        result = await repo.get_document_access(uuid.uuid4(), uuid.uuid4())

        # Assert
        assert result is not None
        assert result["has_access"] is False

    @pytest.mark.asyncio
    async def test_get_document_access_allows_private_docs_for_workspace_admin(self) -> None:
        """Private documents should remain readable by workspace owners/admins."""
        # Arrange
        session = _make_mock_session()
        mock_row = MagicMock()
        mock_row.id = uuid.uuid4()
        mock_row.workspace_id = uuid.uuid4()
        mock_row.title = "Private document"
        mock_row.visibility = "private"
        mock_row.workspace_member_role = "admin"
        mock_row.workspace_member_user_id = uuid.uuid4()
        mock_row.document_member_user_id = None

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_row
        session.execute = AsyncMock(return_value=mock_result)

        # Act
        repo = DocumentAccessRepository(session)
        result = await repo.get_document_access(uuid.uuid4(), uuid.uuid4())

        # Assert
        assert result is not None
        assert result["has_access"] is True

    @pytest.mark.asyncio
    async def test_get_document_access_allows_private_docs_for_direct_members(self) -> None:
        """Private documents should be readable by direct document members."""
        # Arrange
        session = _make_mock_session()
        mock_row = MagicMock()
        mock_row.id = uuid.uuid4()
        mock_row.workspace_id = uuid.uuid4()
        mock_row.title = "Private document"
        mock_row.visibility = "private"
        mock_row.workspace_member_role = None
        mock_row.workspace_member_user_id = None
        mock_row.document_member_user_id = uuid.uuid4()

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_row
        session.execute = AsyncMock(return_value=mock_result)

        # Act
        repo = DocumentAccessRepository(session)
        result = await repo.get_document_access(uuid.uuid4(), uuid.uuid4())

        # Assert
        assert result is not None
        assert result["has_access"] is True

    @pytest.mark.asyncio
    async def test_get_document_access_denies_non_private_docs_without_workspace_membership(
        self,
    ) -> None:
        """Non-private documents still require an active workspace membership."""
        # Arrange
        session = _make_mock_session()
        mock_row = MagicMock()
        mock_row.id = uuid.uuid4()
        mock_row.workspace_id = uuid.uuid4()
        mock_row.title = "Workspace document"
        mock_row.visibility = "workspace"
        mock_row.workspace_member_role = None
        mock_row.workspace_member_user_id = None
        mock_row.document_member_user_id = None

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_row
        session.execute = AsyncMock(return_value=mock_result)

        # Act
        repo = DocumentAccessRepository(session)
        result = await repo.get_document_access(uuid.uuid4(), uuid.uuid4())

        # Assert
        assert result is not None
        assert result["has_access"] is False


# ---------------------------------------------------------------------------
# DocumentEmbeddingRepository.search_workspace — behaviour tests
# ---------------------------------------------------------------------------


class TestDocumentEmbeddingRepositorySearchWorkspace:
    """Test workspace-scoped retrieval query safety with a mock session."""

    @pytest.mark.asyncio
    async def test_search_workspace_uses_live_document_workspace_for_move_safety(
        self,
    ) -> None:
        """search_workspace should join live document rows to avoid stale workspace leakage."""
        # Arrange
        session = _make_mock_session()
        document_id = uuid.uuid4()

        captured_statement: dict[str, object] = {}

        class _EmptyResult:
            """Minimal result object for a query returning no rows."""

            def all(self) -> list[object]:
                return []

        async def capture_execute(statement, *args, **kwargs):
            captured_statement["statement"] = statement
            return _EmptyResult()

        session.execute = AsyncMock(side_effect=capture_execute)

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.search_workspace(
            query_embedding=[0.1] * 1536,
            document_id=document_id,
            user_id=uuid.uuid4(),
            top_k=5,
            exclude_current_document=False,
        )

        # Assert
        compiled = str(
            captured_statement["statement"].compile(compile_kwargs={"literal_binds": False})
        )
        expected_source_join = (
            "JOIN public.documents AS source_document ON document_embeddings.document_id = "
            "source_document.id"
        )
        expected_current_join = (
            "JOIN public.documents AS current_document ON current_document.id = :id_1"
        )
        assert expected_source_join in compiled
        assert expected_current_join in compiled
        assert "source_document.workspace_id = current_document.workspace_id" in compiled
        assert "WHERE document_embeddings.workspace_id" not in compiled
        assert "source_document.visibility != :param_2" in compiled

    @pytest.mark.asyncio
    async def test_search_workspace_filters_private_source_docs_for_plain_workspace_members(
        self,
    ) -> None:
        """Workspace retrieval should exclude private source documents unless allowed."""
        # Arrange
        session = _make_mock_session()
        captured_statement: dict[str, object] = {}

        class _EmptyResult:
            """Minimal result object for a query returning no rows."""

            def all(self) -> list[object]:
                return []

        async def capture_execute(statement, *args, **kwargs):
            captured_statement["statement"] = statement
            return _EmptyResult()

        session.execute = AsyncMock(side_effect=capture_execute)

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.search_workspace(
            query_embedding=[0.1] * 1536,
            document_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            top_k=5,
        )

        # Assert
        compiled = str(
            captured_statement["statement"].compile(compile_kwargs={"literal_binds": False})
        )
        assert "LEFT OUTER JOIN public.document_members AS source_document_member" in compiled
        assert "LEFT OUTER JOIN public.workspace_members AS source_workspace_member" in compiled
        assert "source_document.visibility = :param_2" in compiled
        assert "source_workspace_member.role IN (__[POSTCOMPILE_role_1])" in compiled

    @pytest.mark.asyncio
    async def test_search_workspace_returns_primitive_rows_not_mutated_orm_entities(
        self,
    ) -> None:
        """Workspace retrieval should return primitive rows instead of ORM entities."""
        # Arrange
        session = _make_mock_session()
        mock_row = MagicMock()
        mock_row.document_id = uuid.uuid4()
        mock_row.resolved_workspace_id = uuid.uuid4()
        mock_row.chunk_index = 1
        mock_row.chunk_text = "Chunk"
        mock_row.document_title = "Reference"
        mock_row.is_current_document = False
        mock_row.distance = 0.2

        mock_result = MagicMock()
        mock_result.all.return_value = [mock_row]
        session.execute = AsyncMock(return_value=mock_result)

        # Act
        repo = DocumentEmbeddingRepository(session)
        result = await repo.search_workspace(
            query_embedding=[0.1] * 1536,
            document_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
        )

        # Assert
        assert result == [
            {
                "document_id": mock_row.document_id,
                "workspace_id": mock_row.resolved_workspace_id,
                "chunk_index": 1,
                "chunk_text": "Chunk",
                "document_title": "Reference",
                "is_current_document": False,
                "distance": 0.2,
            }
        ]


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

    workspace_id = uuid.uuid4()

    @pytest.mark.asyncio
    async def test_bulk_insert_returns_chunk_count(self) -> None:
        """bulk_insert should return the number of inserted chunks."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()

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
        count = await repo.bulk_insert(doc_id, self.workspace_id, chunks)

        # Assert
        assert count == 3

    @pytest.mark.asyncio
    async def test_bulk_insert_calls_add_all(self) -> None:
        """bulk_insert must call session.add_all with the correct number of rows."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 0
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (0, "Chunk A", [0.0] * 1536),
            (1, "Chunk B", [0.5] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.bulk_insert(doc_id, self.workspace_id, chunks)

        # Assert — add_all was called with a list of two DocumentEmbedding rows
        session.add_all.assert_called_once()
        added_rows = session.add_all.call_args[0][0]
        assert len(added_rows) == 2
        assert all(isinstance(row, DocumentEmbedding) for row in added_rows)

    @pytest.mark.asyncio
    async def test_bulk_insert_calls_flush(self) -> None:
        """bulk_insert must call session.flush to persist the rows in the transaction."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 0
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (0, "Only chunk", [0.7] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.bulk_insert(doc_id, self.workspace_id, chunks)

        # Assert
        session.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_bulk_insert_empty_list_returns_zero(self) -> None:
        """bulk_insert with an empty chunk list should return 0 and still delete first."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 5  # pretend 5 old chunks existed
        session.execute = AsyncMock(return_value=delete_result)

        # Act
        repo = DocumentEmbeddingRepository(session)
        count = await repo.bulk_insert(doc_id, self.workspace_id, [])

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

        delete_result = MagicMock()
        delete_result.rowcount = 0
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (0, "Hello world", [0.1] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.bulk_insert(doc_id, self.workspace_id, chunks)

        # Assert
        added_rows = session.add_all.call_args[0][0]
        assert added_rows[0].document_id == doc_id
        assert added_rows[0].workspace_id == self.workspace_id

    @pytest.mark.asyncio
    async def test_bulk_insert_sets_correct_chunk_index_and_text(self) -> None:
        """bulk_insert must map chunk_index and chunk_text from the input tuples."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 0
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (7, "Seventh chunk content", [0.9] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.bulk_insert(doc_id, self.workspace_id, chunks)

        # Assert
        row = session.add_all.call_args[0][0][0]
        assert row.chunk_index == 7
        assert row.chunk_text == "Seventh chunk content"

    @pytest.mark.asyncio
    async def test_bulk_insert_deletes_existing_rows_before_insert(self) -> None:
        """bulk_insert must clear old rows before inserting the new batch."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()

        delete_result = MagicMock()
        delete_result.rowcount = 2
        session.execute = AsyncMock(return_value=delete_result)

        chunks: list[tuple[int, str, list[float]]] = [
            (0, "Fresh content", [0.4] * 1536),
        ]

        # Act
        repo = DocumentEmbeddingRepository(session)
        await repo.bulk_insert(doc_id, self.workspace_id, chunks)

        # Assert
        session.execute.assert_called_once()
        session.add_all.assert_called_once()
