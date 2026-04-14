from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Centralized application settings loaded from environment variables.
    All modules must import `settings` from here — never read os.environ directly.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_env: str = Field(default="development", validation_alias="APP_ENV")
    port: int = Field(default=8000, validation_alias="PORT")

    database_url: str = Field(default="", validation_alias="DATABASE_URL")
    supabase_url: str = Field(default="", validation_alias="SUPABASE_URL")
    supabase_anon_key: str = Field(default="", validation_alias="SUPABASE_ANON_KEY")

    openai_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    openrouter_api_key: str = Field(default="", validation_alias="OPENROUTER_API_KEY")
    # Single source of truth for default LLM when the client omits model_id or for GET /ai/models.
    openrouter_model: str = Field(
        default="x-ai/grok-4.1-fast",
        validation_alias="OPENROUTER_MODEL",
    )

    # Embedding model settings for RAG (Phase 4)
    openai_embedding_model: str = Field(
        default="text-embedding-3-small",
        validation_alias="OPENAI_EMBEDDING_MODEL",
    )
    embedding_dimensions: int = Field(default=1536, validation_alias="EMBEDDING_DIMENSIONS")

    # JWT cache TTL in seconds (default: 5 minutes)
    jwks_cache_ttl_seconds: int = Field(default=300, validation_alias="JWKS_CACHE_TTL_SECONDS")


settings = Settings()
