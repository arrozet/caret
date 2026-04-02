import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for migration generation and execution.
 * Uses the same DATABASE_URL from the environment as the runtime client.
 *
 * Run migrations:
 *   bun run db:generate  - Generate migration files from schema changes
 *   bun run db:migrate   - Apply pending migrations to the database
 *   bun run db:push      - Push schema directly (dev only, no migration files)
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
