import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../lib/config.js";
import * as schema from "./schema.js";

/**
 * Drizzle ORM client connected to the Supabase PostgreSQL instance.
 * This is the single database connection used by all Repositories in this service.
 * Import `db` from here — never instantiate a new client inside a Repository.
 */
const query_client = postgres(config.DATABASE_URL);
export const db = drizzle(query_client, { schema });
