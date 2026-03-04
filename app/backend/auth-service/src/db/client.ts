import { resolve4 } from "node:dns/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../lib/config.js";
import * as schema from "./schema.js";

/**
 * Resolve the database hostname to an IPv4 address.
 *
 * Bun's node:dns compat layer ignores `setDefaultResultOrder`, so Docker
 * containers often resolve Supabase hostnames to unreachable IPv6 addresses.
 * We query for A records explicitly and pass the resolved IPv4 address
 * directly to the postgres driver's `host` option, avoiding the fragile
 * /etc/hosts write hack.
 *
 * @returns The IPv4 address, or undefined to fall back to default resolution.
 */
async function resolve_ipv4_host(): Promise<string | undefined> {
  try {
    const hostname = new URL(config.DATABASE_URL).hostname;
    const addresses = await resolve4(hostname);
    return addresses.length > 0 ? addresses[0] : undefined;
  } catch {
    return undefined;
  }
}

const resolved_host = await resolve_ipv4_host();

/**
 * Drizzle ORM client connected to the Supabase PostgreSQL instance.
 * This is the single database connection used by all Repositories in this service.
 * Import `db` from here — never instantiate a new client inside a Repository.
 *
 * When an IPv4 address is resolved, it overrides the hostname in the
 * connection string so the driver connects via IPv4 directly.
 */
const query_client = postgres(config.DATABASE_URL, {
  ...(resolved_host ? { host: resolved_host } : {}),
});
export const db = drizzle(query_client, { schema });
