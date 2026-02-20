import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../lib/config.js";
import * as schema from "./schema.js";

/**
 * Drizzle ORM client for persisting Y.js CRDT updates and snapshots.
 */
const query_client = postgres(config.DATABASE_URL);
export const db = drizzle(query_client, { schema });
