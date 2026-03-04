/**
 * Repositories for the Auth Service.
 * Each Repository class encapsulates all Drizzle ORM queries for one domain aggregate.
 * Repositories receive the db client via constructor injection (DI).
 *
 * Rule: all SQL/ORM logic lives here — never in Services.
 * Rule: repositories accept and return domain Models, never DTOs or raw ORM rows.
 */
export {};
