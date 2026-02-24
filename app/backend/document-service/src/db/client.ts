import { resolve4 } from "node:dns/promises";
import { appendFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../lib/config.js";
import * as schema from "./schema.js";

/**
 * Force IPv4 DNS resolution for the database hostname.
 *
 * Bun's node:dns compat layer ignores `setDefaultResultOrder`, so Docker
 * containers often resolve Supabase hostnames to unreachable IPv6 addresses.
 * We query for A records explicitly and pin the result in /etc/hosts so that
 * every subsequent connection (including inside postgres.js) uses IPv4.
 */
async function pin_hostname_to_ipv4(): Promise<void> {
  try {
    const hostname = new URL(config.DATABASE_URL).hostname;
    const addresses = await resolve4(hostname);
    if (addresses.length > 0) {
      appendFileSync("/etc/hosts", `${addresses[0]} ${hostname}\n`);
    }
  } catch {
    // Silently fall back to default DNS resolution
  }
}

await pin_hostname_to_ipv4();

/**
 * Drizzle ORM client connected to the Supabase PostgreSQL instance.
 * This is the single database connection used by all Repositories in this service.
 * Import `db` from here — never instantiate a new client inside a Repository.
 */
const query_client = postgres(config.DATABASE_URL);
export const db = drizzle(query_client, { schema });
