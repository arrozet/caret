"""
PydanticAI agent service — orchestrates LLM calls and SSE streaming.

Architecture note (BACKEND.md):
  - This service is the ONLY layer that calls PydanticAI.
  - Routers call this service; this service calls Repositories.
  - The AI Service NEVER writes document state to the DB.
    Flow: AI streams SSE → Frontend Tiptap Transaction → Y.js sync.

SSE event format (NDJSON over text/event-stream):
  data: {"type": "delta", "content": "<token>"}
  data: {"type": "done",  "content": "<full_text>", "message_id": "<uuid>"}
  data: {"type": "error", "content": "<message>"}
"""

import json
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from pydantic import BaseModel
from pydantic_ai import (
    Agent,
    AgentRunResultEvent,
    FunctionToolCallEvent,
    PartDeltaEvent,
    PartStartEvent,
    TextPartDelta,
)
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    SystemPromptPart,
    TextPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.models_catalog import MODELS_BY_ID
from models.ai import AiMessageRole
from repositories.ai_repository import (
    AiConversationRepository,
    AiMessageRepository,
    AiSuggestionRepository,
)
from schemas.ai import (
    ConversationListByDocumentResponse,
    ConversationListItemResponse,
    ConversationResponse,
    DocumentChangePayload,
    MessageListResponse,
    MessageResponse,
    StreamChunk,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are Caret AI, an expert writing assistant embedded inside the Caret
document editor.  Your goal is to help users write, improve, and understand
their documents.

Guidelines:
- Be concise and precise. Avoid padding or unnecessary repetition.
- When suggesting edits, produce clean prose that fits the document's tone.
- Never fabricate facts. If uncertain, say so.
- Respond in the same language as the user's message.
- If document context is provided, ground your answer in it.
"""


def _normalize_document_context(
    document_context: BaseModel | dict[str, Any] | str | None,
) -> str | None:
    """Normalize structured or plain-text document context into agent-ready text."""
    if document_context is None:
        return None
    if isinstance(document_context, str):
        return document_context
    if isinstance(document_context, BaseModel):
        payload = document_context.model_dump(mode="json", exclude_none=True)
        content_text = payload.get("content_text")
        if isinstance(content_text, str) and content_text.strip():
            return content_text
        content_json = payload.get("content_json")
        if content_json is not None:
            return json.dumps(content_json, ensure_ascii=False)
        selection = payload.get("selection")
        if isinstance(selection, dict):
            selected_text = selection.get("text")
            if isinstance(selected_text, str) and selected_text.strip():
                return selected_text
        return json.dumps(payload, ensure_ascii=False)
    content_text = document_context.get("content_text")
    if isinstance(content_text, str) and content_text.strip():
        return content_text
    content_json = document_context.get("content_json")
    if content_json is not None:
        return json.dumps(content_json, ensure_ascii=False)
    selection = document_context.get("selection")
    if isinstance(selection, dict):
        selected_text = selection.get("text")
        if isinstance(selected_text, str) and selected_text.strip():
            return selected_text
    return json.dumps(document_context, ensure_ascii=False)


def _build_message_history(history_messages: list) -> list[ModelMessage]:
    """Convert persisted chat rows into structured PydanticAI message history."""
    history: list[ModelMessage] = []
    for message in history_messages:
        if message.role == AiMessageRole.user:
            history.append(
                ModelRequest(
                    parts=[UserPromptPart(content=message.content)],
                    timestamp=message.created_at,
                )
            )
        elif message.role == AiMessageRole.assistant:
            history.append(
                ModelResponse(
                    parts=[TextPart(content=message.content)],
                    timestamp=message.created_at,
                )
            )
        elif message.role == AiMessageRole.system:
            history.append(
                ModelRequest(
                    parts=[SystemPromptPart(content=message.content)],
                    timestamp=message.created_at,
                )
            )
        elif message.role == AiMessageRole.tool:
            history.append(
                ModelResponse(
                    parts=[ToolReturnPart(tool_name="tool", content=message.content)],
                    timestamp=message.created_at,
                )
            )
    return history


# ---------------------------------------------------------------------------
# Model selector
# ---------------------------------------------------------------------------


def _build_model(model_id: str | None = None) -> OpenAIChatModel | AnthropicModel:
    """
    Return the correct LLM client for the requested model.

    Routing is driven by the `gateway` field on the model's catalog entry,
    not by string-prefix heuristics.  This makes it safe to add new models
    from any provider without touching this function.

    Priority when model_id is None or not found in the catalog:
      1. OpenRouter  if OPENROUTER_API_KEY is set
      2. OpenAI      if OPENAI_API_KEY is set
      3. Anthropic   if ANTHROPIC_API_KEY is set

    All curated catalog models use the OpenRouter gateway.

    Args:
        model_id: Optional model slug from the catalog.  When omitted the
                  server uses ``settings.openrouter_model`` (``OPENROUTER_MODEL``).

    Raises:
        RuntimeError: If the required API key for the requested model is missing,
                      or if no API key at all is configured.
    """
    entry = MODELS_BY_ID.get(model_id or settings.openrouter_model) if model_id else None

    # Route to the gateway declared in the catalog entry.
    if entry is not None:
        if entry.gateway == "openrouter":
            if not settings.openrouter_api_key:
                raise RuntimeError(
                    "OPENROUTER_API_KEY is required for model "
                    f"'{entry.name}' but is not configured."
                )
            provider = OpenAIProvider(
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.openrouter_api_key,
            )
            return OpenAIChatModel(entry.id, provider=provider)

    # Fallback: model_id not in catalog — try available keys in priority order.
    if settings.openrouter_api_key:
        resolved = model_id or settings.openrouter_model
        provider = OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key,
        )
        return OpenAIChatModel(resolved, provider=provider)
    if settings.openai_api_key:
        provider = OpenAIProvider(api_key=settings.openai_api_key)
        return OpenAIChatModel("gpt-4o", provider=provider)
    if settings.anthropic_api_key:
        return AnthropicModel("claude-3-5-sonnet-latest")
    raise RuntimeError(
        "No LLM API key configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY."
    )


# ---------------------------------------------------------------------------
# AiAgentService
# ---------------------------------------------------------------------------


class AiAgentService:
    """
    Orchestrates AI conversations: creates/retrieves conversations, persists
    messages, and streams LLM responses back as SSE chunks.

    Each method receives an AsyncSession so the service participates in the
    same request-scoped transaction managed by the FastAPI dependency.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._conv_repo = AiConversationRepository(session)
        self._msg_repo = AiMessageRepository(session)
        self._suggestion_repo = AiSuggestionRepository(session)

    # ------------------------------------------------------------------
    # Conversation lifecycle
    # ------------------------------------------------------------------

    async def get_or_create_conversation(
        self,
        document_id: uuid.UUID,
        user_id: uuid.UUID,
        title: str | None = None,
    ) -> ConversationResponse:
        """
        Return the most-recent conversation for the given document/user pair,
        or create a new one if none exists.

        Args:
            document_id: Target document UUID.
            user_id: Authenticated user UUID.
            title: Optional title for a newly created conversation.

        Returns:
            ConversationResponse DTO.
        """
        rows, _ = await self._conv_repo.list_for_document(
            document_id=document_id,
            user_id=user_id,
            limit=1,
        )

        if rows:
            conv = rows[0]
        else:
            conv = await self._conv_repo.create(
                document_id=document_id,
                user_id=user_id,
                title=title,
            )

        return ConversationResponse.model_validate(conv)

    async def create_conversation(
        self,
        document_id: uuid.UUID,
        user_id: uuid.UUID,
        title: str | None = None,
    ) -> ConversationResponse:
        """
        Always create a fresh conversation (used when the client explicitly
        starts a new session).

        Args:
            document_id: Target document UUID.
            user_id: Authenticated user UUID.
            title: Optional display title.

        Returns:
            ConversationResponse DTO for the new conversation.
        """
        conv = await self._conv_repo.create(
            document_id=document_id,
            user_id=user_id,
            title=title,
        )
        return ConversationResponse.model_validate(conv)

    async def list_messages(
        self,
        conversation_id: uuid.UUID,
    ) -> MessageListResponse:
        """
        Return all messages in a conversation ordered by creation time.

        Args:
            conversation_id: Target conversation UUID.

        Returns:
            MessageListResponse containing the ordered message list.
        """
        messages = await self._msg_repo.list_for_conversation(conversation_id)
        items = [MessageResponse.model_validate(m) for m in messages]
        return MessageListResponse(items=items, total=len(items))

    async def list_conversations_for_document(
        self,
        document_id: uuid.UUID,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> ConversationListByDocumentResponse:
        """
        List persisted conversations for a document owned by the given user.

        Args:
            document_id: Document UUID to scope conversation history.
            user_id: Authenticated owner user UUID.
            limit: Maximum rows to return.
            offset: Number of rows to skip.

        Returns:
            ConversationListByDocumentResponse sorted by updated_at desc.
        """
        rows, total = await self._conv_repo.list_for_document(
            document_id=document_id,
            user_id=user_id,
            limit=limit,
            offset=offset,
        )
        items = [ConversationListItemResponse.model_validate(row) for row in rows]
        return ConversationListByDocumentResponse(items=items, total=total)

    # ------------------------------------------------------------------
    # RAG retrieval
    # ------------------------------------------------------------------

    async def _retrieve_rag_context(
        self,
        document_id: uuid.UUID,
        query: str,
        top_k: int = 5,
    ) -> str:
        """
        Retrieve the most relevant document chunks for `query` using vector
        similarity search and format them as a context block for the system prompt.

        Returns an empty string if no embeddings are stored for the document
        (graceful degradation — RAG is optional, not required).

        Args:
            document_id: Document whose embeddings to search.
            query: The user's message text used as the search query.
            top_k: Maximum number of chunks to retrieve.

        Returns:
            A formatted multi-line string with ranked context chunks, or "" if
            no embeddings are found or an error occurs.
        """
        try:
            # Lazy import to avoid circular dependency between services.
            from services.embedding_service import EmbeddingService  # noqa: PLC0415

            emb_service = EmbeddingService(self._session)
            chunks = await emb_service.search_similar_chunks(
                query=query,
                document_id=document_id,
                top_k=top_k,
            )
            if not chunks:
                return ""
            lines = ["--- Relevant document context (RAG) ---"]
            for i, chunk in enumerate(chunks, 1):
                lines.append(f"[{i}] {chunk.chunk_text}")
            lines.append("--- End of context ---")
            return "\n".join(lines)
        except Exception:
            logger.warning("RAG retrieval failed; continuing without context.", exc_info=True)
            return ""

    # ------------------------------------------------------------------
    # SSE streaming
    # ------------------------------------------------------------------

    async def stream_response(
        self,
        conversation_id: uuid.UUID,
        user_message: str,
        document_context: BaseModel | dict[str, Any] | str | None = None,
        model_id: str | None = None,
        document_id: uuid.UUID | None = None,
        agent_type: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Persist the user message, run the PydanticAI agent with streaming,
        yield SSE-formatted chunks, then persist the completed assistant reply.

        SSE event format (one line per yield):
            ``data: <JSON>\\n\\n``

        Chunk types:
            - delta           : partial LLM token(s)
            - done            : final sentinel with full text and persisted message_id
            - error           : unrecoverable error description
            - document_change : agent-proposed document edit (agentic mode only)
            - tool_call       : agent tool usage marker (agentic mode only)

        When `agent_type` is ``"general"``, the general PydanticAI agent is used
        instead of the plain chat agent. After text streaming completes, any
        proposed document changes accumulated in the agent's deps are emitted as
        ``document_change`` SSE events before the ``done`` event.

        When `document_id` is provided the method calls `_retrieve_rag_context`
        to fetch semantically similar document chunks and appends them to the
        system prompt.  If retrieval fails or returns no results the prompt is
        unchanged (graceful degradation).

        Args:
            conversation_id: The conversation to append messages to.
            user_message: Text submitted by the user.
            document_context: Optional structured or plain-text document snapshot for context.
            model_id: Optional LLM model slug to override the server default.
            document_id: Optional document UUID for RAG chunk retrieval.
            agent_type: Optional agent type; ``"general"`` activates the agentic
                        document-editing mode. Defaults to plain chat mode.

        Yields:
            SSE-formatted strings to be sent directly to the client.
        """
        # 1. Persist the user message ------------------------------------------
        await self._msg_repo.create(
            conversation_id=conversation_id,
            role=AiMessageRole.user,
            content=user_message,
        )
        await self._conv_repo.touch_updated_at(conversation_id)

        # 2. Build history for the agent's context window ----------------------
        history_messages = await self._msg_repo.list_for_conversation(conversation_id)
        if (
            history_messages
            and history_messages[-1].role == AiMessageRole.user
            and history_messages[-1].content == user_message
        ):
            history_messages = history_messages[:-1]
        message_history = _build_message_history(history_messages)

        normalized_document_context = _normalize_document_context(document_context)

        # Build the PydanticAI message list (system + history + new user msg)
        system_prompt = _SYSTEM_PROMPT
        if normalized_document_context:
            system_prompt += (
                f"\n\n--- Current document context ---\n{normalized_document_context}\n---"
            )

        # 2b. Optionally inject RAG context from document embeddings -----------
        # This runs only when a document_id is supplied.  Failure is silently
        # swallowed by _retrieve_rag_context so streaming is never blocked.
        if document_id is not None:
            rag_context = await self._retrieve_rag_context(
                document_id=document_id,
                query=user_message,
            )
            if rag_context:
                system_prompt += f"\n\n{rag_context}"

        # 3. Build and run the agent with streaming ----------------------------
        try:
            model = _build_model(model_id)
        except RuntimeError as exc:
            error_chunk = StreamChunk(type="error", content=str(exc))
            yield f"data: {error_chunk.model_dump_json()}\n\n"
            return

        full_text = ""
        token_count = 0

        if agent_type == "general":
            from agents.general_agent import (  # noqa: PLC0415
                GeneralAgentDeps,
                build_general_agent,
            )

            selection_payload: dict[str, Any] | None = None
            if isinstance(document_context, BaseModel):
                selection_payload = document_context.model_dump(mode="json", exclude_none=True).get(
                    "selection"
                )
            elif isinstance(document_context, dict):
                raw_sel = document_context.get("selection")
                selection_payload = raw_sel if isinstance(raw_sel, dict) else None

            deps = GeneralAgentDeps(
                document_content=normalized_document_context,
                document_context=document_context,
                selection=selection_payload,
            )
            agent_instance = build_general_agent(model)
            fallback_proposed_texts: list[str] = []

            try:
                async for event in agent_instance.run_stream_events(
                    user_message,
                    message_history=message_history,
                    deps=deps,
                ):
                    if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
                        initial_text = event.part.content
                        if initial_text:
                            full_text += initial_text
                            token_count += len(initial_text.split())
                            delta_chunk = StreamChunk(type="delta", content=initial_text)
                            yield f"data: {delta_chunk.model_dump_json()}\n\n"
                        continue

                    if isinstance(event, PartDeltaEvent) and isinstance(event.delta, TextPartDelta):
                        delta = event.delta.content_delta
                        if delta:
                            full_text += delta
                            token_count += len(delta.split())
                            delta_chunk = StreamChunk(type="delta", content=delta)
                            yield f"data: {delta_chunk.model_dump_json()}\n\n"
                        continue

                    if isinstance(event, FunctionToolCallEvent):
                        tool_chunk = StreamChunk(
                            type="tool_call",
                            content="",
                            tool_name=event.part.tool_name,
                        )
                        yield f"data: {tool_chunk.model_dump_json()}\n\n"

                        if event.part.tool_name != "propose_document_replacement":
                            continue

                        args_dict: dict[str, object] = {}
                        try:
                            args_dict = event.part.args_as_dict()
                        except Exception:
                            args = getattr(event.part, "args", None)
                            if isinstance(args, dict):
                                args_dict = args

                        proposed_text = args_dict.get("proposed_text")
                        replacement_text = args_dict.get("replacement_text")
                        candidate_text = proposed_text or replacement_text

                        if isinstance(candidate_text, str) and candidate_text.strip():
                            fallback_proposed_texts.append(candidate_text)
                        continue

                    if isinstance(event, AgentRunResultEvent) and isinstance(
                        event.result.output, str
                    ):
                        full_text = event.result.output

            except Exception as exc:
                logger.exception("General agent streaming error: %s", exc)
                error_chunk = StreamChunk(
                    type="error", content="AI service error. Please try again."
                )
                yield f"data: {error_chunk.model_dump_json()}\n\n"
                return

            changes_to_emit = list(deps.proposed_changes)
            if not changes_to_emit and fallback_proposed_texts:
                seen_texts: set[str] = set()
                for proposed_text in fallback_proposed_texts:
                    if proposed_text in seen_texts:
                        continue
                    seen_texts.add(proposed_text)
                    changes_to_emit.append(
                        {
                            "operation": "replace_full",
                            "proposed_text": proposed_text,
                            "original_text": normalized_document_context or "",
                        }
                    )

            for change in changes_to_emit:
                change_payload = DocumentChangePayload(
                    operation=change["operation"],
                    proposed_text=change["proposed_text"],
                    original_text=change["original_text"],
                    position_start=change.get("position_start"),
                    position_end=change.get("position_end"),
                )
                change_chunk = StreamChunk(
                    type="document_change",
                    content="",
                    document_change=change_payload,
                )
                yield f"data: {change_chunk.model_dump_json()}\n\n"

        else:
            agent: Agent[None, str] = Agent(
                model=model,
                system_prompt=system_prompt,
                output_type=str,
            )

            try:
                async with agent.run_stream(
                    user_message,
                    message_history=message_history,
                ) as result:
                    async for delta in result.stream_text(delta=True):
                        if delta:
                            full_text += delta
                            token_count += len(delta.split())  # approximate; LLM usage may override

                            delta_chunk = StreamChunk(type="delta", content=delta)
                            yield f"data: {delta_chunk.model_dump_json()}\n\n"

            except Exception as exc:
                logger.exception("PydanticAI streaming error: %s", exc)
                error_chunk = StreamChunk(
                    type="error", content="AI service error. Please try again."
                )
                yield f"data: {error_chunk.model_dump_json()}\n\n"
                return

        # 4. Persist the completed assistant message ---------------------------
        assistant_msg = await self._msg_repo.create(
            conversation_id=conversation_id,
            role=AiMessageRole.assistant,
            content=full_text,
            token_count=token_count,
        )
        await self._conv_repo.touch_updated_at(conversation_id)

        done_chunk = StreamChunk(
            type="done",
            content=full_text,
            message_id=assistant_msg.id,
        )
        yield f"data: {done_chunk.model_dump_json()}\n\n"
