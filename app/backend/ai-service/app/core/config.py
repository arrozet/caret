from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Centralized application settings loaded from environment variables.
    All modules must import `settings` from here — never read os.environ directly.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    APP_ENV: str = "development"
    PORT: int = 8000

    DATABASE_URL: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""

    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    XAI_API_KEY: str = ""
    OPENROUTER_MODEL: str = "grok-4-1-fast-reasoning"

    # Embedding model settings for RAG (Phase 4)
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 1536

    # JWT cache TTL in seconds (default: 5 minutes)
    JWKS_CACHE_TTL_SECONDS: int = 300


settings = Settings()
