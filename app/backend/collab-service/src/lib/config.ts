import "dotenv/config";

/**
 * Centralized configuration loaded from environment variables.
 */
export const config = {
  PORT: Number(process.env.PORT) || 3003,
  NODE_ENV: process.env.NODE_ENV || "development",
  DATABASE_URL: process.env.DATABASE_URL || "",
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || "",
} as const;
