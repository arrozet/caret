import "dotenv/config";

/**
 * Centralized configuration loaded from environment variables.
 * All services must read config exclusively from this module — never from process.env directly.
 */
export const config = {
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(","),

  // Downstream service URLs
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
  DOCUMENT_SERVICE_URL: process.env.DOCUMENT_SERVICE_URL || "http://localhost:3002",
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || "http://localhost:8000",
} as const;
