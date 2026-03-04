from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine, async_sessionmaker, create_async_engine

from app.core.config import settings


def _normalize_database_url(url: str) -> tuple[str, dict]:
    """
    Rewrite DATABASE_URL for asyncpg compatibility.

    Two transformations are applied:

    1. Scheme — Supabase/Heroku supply ``postgresql://`` or ``postgres://``,
       which SQLAlchemy maps to the synchronous psycopg2 driver.  asyncpg
       requires ``postgresql+asyncpg://``.

    2. SSL — asyncpg does not accept the libpq ``sslmode`` query parameter.
       We strip it from the URL and translate it to an ``ssl`` entry in
       ``connect_args`` (``ssl=True`` enables TLS with the system CA bundle,
       which is correct for Supabase).

    Returns a (url, connect_args) tuple ready for ``create_async_engine``.
    """
    # 1. Normalise scheme
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    # 2. Strip sslmode and convert to asyncpg-native ssl connect_arg
    parsed = make_url(url)
    query_params = dict(parsed.query)
    sslmode = query_params.pop("sslmode", None)
    # render_as_string(hide_password=False) is required — str(url) in
    # SQLAlchemy 2.0 replaces the password with "***" for safety, which would
    # cause asyncpg to authenticate with a literal "***" as the password.
    clean_url = parsed.set(query=query_params).render_as_string(hide_password=False)

    connect_args: dict = {}
    if sslmode and sslmode != "disable":
        import ssl as _ssl

        # asyncpg requires an ssl.SSLContext, not a bare string.
        # sslmode=require in libpq means "encrypt the connection but do NOT
        # verify the server certificate".  Supabase's cert chain contains a
        # self-signed root, so strict verification (ssl=True / CERT_REQUIRED)
        # raises SSLCertVerificationError.  We match the libpq semantics by
        # disabling hostname and certificate verification.
        ssl_ctx = _ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
        connect_args["ssl"] = ssl_ctx

    # Supabase's Transaction Pooler (Supavisor) runs in transaction mode
    # (pgbouncer-compatible) and does not support named prepared statements.
    #
    # Two separate cache settings are required — they operate at different layers:
    #
    # 1. ``statement_cache_size=0`` — asyncpg-level parameter (asyncpg docs).
    #    When the asyncpg statement cache is disabled, asyncpg uses the
    #    PostgreSQL *unnamed* prepared-statement slot (empty string name)
    #    instead of generating named statements like ``__asyncpg_stmt_2__``.
    #    Unnamed statements are local to each backend connection and are
    #    implicitly deallocated after execution, so they are safe with
    #    transaction-mode poolers.  This is the root fix for
    #    DuplicatePreparedStatementError.
    #
    # 2. ``prepared_statement_cache_size=0`` — SQLAlchemy-level parameter.
    #    Controls SQLAlchemy's own prepared-statement cache (independent of
    #    asyncpg's cache).  Setting it to 0 ensures SQLAlchemy does not
    #    maintain its own server-side statement handles across requests,
    #    which could also cause conflicts in a pooled environment.
    connect_args["statement_cache_size"] = 0
    connect_args["prepared_statement_cache_size"] = 0

    return clean_url, connect_args


def _build_engine() -> AsyncEngine | None:
    """
    Create the async SQLAlchemy engine only when DATABASE_URL is configured.
    Returns None during local health-check runs where no DB is needed yet.
    """
    if not settings.DATABASE_URL:
        return None

    db_url, connect_args = _normalize_database_url(settings.DATABASE_URL)
    return create_async_engine(
        db_url,
        echo=False,
        pool_size=5,
        max_overflow=10,
        connect_args=connect_args,
    )


engine = _build_engine()

async_session_factory = (
    async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    if engine is not None
    else None
)
