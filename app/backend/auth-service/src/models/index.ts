/**
 * Domain models for the Auth Service.
 * These are pure TypeScript types representing internal business entities.
 * They are NOT Drizzle ORM types (those live in db/schema.ts) and NOT DTOs (those live in dtos/).
 *
 * Rule: models are used inside Services and Repositories only.
 * Rule: models are never serialized directly as HTTP responses — map them to DTOs first.
 */
export {};
