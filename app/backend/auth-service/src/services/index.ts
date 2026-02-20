/**
 * Services for the Auth Service.
 * Services contain all business logic and orchestrate one or more Repositories.
 * They receive Repositories via constructor injection (DI) — never import them directly.
 *
 * Rule: no HTTP concepts (req, res, status codes) inside Services.
 * Rule: no direct ORM/SQL imports — delegate all DB access to Repositories.
 * Rule: map DTOs → Models on the way in, and Models → DTOs on the way out.
 */
export {};
