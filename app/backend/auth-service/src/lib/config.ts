import "dotenv/config";

/**
 * Centralized configuration loaded from environment variables.
 * All modules must read config from here — never from process.env directly.
 */
export const config = {
  PORT: Number(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || "development",
  DATABASE_URL: process.env.DATABASE_URL || "",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  JWT_SECRET: process.env.JWT_SECRET || "",
} as const;
