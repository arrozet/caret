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

from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.openai import OpenAIProvider
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai import AiMessageRole
from app.repositories.ai_repository import (
    AiConversationRepository,
    AiMessageRepository,
    AiSuggestionRepository,
)
from app.schemas.ai import (
    ConversationResponse,
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


# ---------------------------------------------------------------------------
# Model selector
# ---------------------------------------------------------------------------


def _build_model(model_id: str | None = None) -> OpenAIChatModel | AnthropicModel:
    """
    Return the best available LLM model based on configured API keys.

    If `model_id` is provided and OPENROUTER_API_KEY is set, the specified
    model is used on OpenRouter.  Falls back to the server default model when
    model_id is None.

    Priority:
      1. OpenRouter if OPENROUTER_API_KEY is set (OpenAI Chat Completions-compatible)
      2. OpenAI GPT-4o if OPENAI_API_KEY is set
      3. Anthropic Claude 3.5 Sonnet if ANTHROPIC_API_KEY is set

    Raises:
        RuntimeError if no LLM API key is configured.
    """
    if settings.OPENROUTER_API_KEY:
        resolved_model = model_id or settings.OPENROUTER_MODEL
        provider = OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.OPENROUTER_API_KEY,
        )
        return OpenAIChatModel(resolved_model, provider=provider)
    if settings.OPENAI_API_KEY:
        provider = OpenAIProvider(api_key=settings.OPENAI_API_KEY)
        return OpenAIChatModel("gpt-4o", provider=provider)
    if settings.ANTHROPIC_API_KEY:
        return AnthropicModel("claude-3-5-sonnet-latest", api_key=settings.ANTHROPIC_API_KEY)
    raise RuntimeError(
        "No LLM API key configured. "
        "Set OPENROUTER_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY in the environment."
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

    # ------------------------------------------------------------------
    # SSE streaming
    # ------------------------------------------------------------------

    async def stream_response(
        self,
        conversation_id: uuid.UUID,
        user_message: str,
        document_context: str | None = None,
        model_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Persist the user message, run the PydanticAI agent with streaming,
        yield SSE-formatted chunks, then persist the completed assistant reply.

        SSE event format (one line per yield):
            ``data: <JSON>\\n\\n``

        Chunk types:
            - delta : partial LLM token(s)
            - done  : final sentinel with full text and persisted message_id
            - error : unrecoverable error description

        Args:
            conversation_id: The conversation to append messages to.
            user_message: Text submitted by the user.
            document_context: Optional plain-text document snapshot for context.

        Yields:
            SSE-formatted strings to be sent directly to the client.
        """
        # 1. Persist the user message ------------------------------------------
        await self._msg_repo.create(
            conversation_id=conversation_id,
            role=AiMessageRole.user,
            content=user_message,
        )

        # 2. Build history for the agent's context window ----------------------
        history_messages = await self._msg_repo.list_for_conversation(conversation_id)

        # Build the PydanticAI message list (system + history + new user msg)
        system_prompt = _SYSTEM_PROMPT
        if document_context:
            system_prompt += (
                f"\n\n--- Current document context ---\n{document_context}\n---"
            )

        # Format history as a single string prompt (simplified for initial version)
        # A full implementation would use pydantic_ai.messages for structured history
        history_text = "\n".join(
            f"{msg.role.value.upper()}: {msg.content}"
            for msg in history_messages
            if msg.role != AiMessageRole.system
        )

        full_prompt = f"{history_text}\nASSISTANT:"

        # 3. Build and run the agent with streaming ----------------------------
        try:
            model = _build_model(model_id)
        except RuntimeError as exc:
            error_chunk = StreamChunk(type="error", content=str(exc))
            yield f"data: {error_chunk.model_dump_json()}\n\n"
            return

        agent: Agent[None, str] = Agent(
            model=model,
            system_prompt=system_prompt,
            output_type=str,
        )

        full_text = ""
        token_count = 0

        try:
            async with agent.run_stream(full_prompt) as result:
                async for delta in result.stream_text(delta=True):
                    full_text += delta
                    token_count += len(delta.split())  # approximate; LLM usage may override

                    delta_chunk = StreamChunk(type="delta", content=delta)
                    yield f"data: {delta_chunk.model_dump_json()}\n\n"

        except Exception as exc:
            logger.exception("PydanticAI streaming error: %s", exc)
            error_chunk = StreamChunk(type="error", content="AI service error. Please try again.")
            yield f"data: {error_chunk.model_dump_json()}\n\n"
            return

        # 4. Persist the completed assistant message ---------------------------
        assistant_msg = await self._msg_repo.create(
            conversation_id=conversation_id,
            role=AiMessageRole.assistant,
            content=full_text,
            token_count=token_count,
        )

        done_chunk = StreamChunk(
            type="done",
            content=full_text,
            message_id=assistant_msg.id,
        )
        yield f"data: {done_chunk.model_dump_json()}\n\n"
