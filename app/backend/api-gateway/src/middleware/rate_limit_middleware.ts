import { rateLimit } from "express-rate-limit";
import { config } from "../lib/config.js";

/**
 * Global rate limiter applied at the Gateway level.
 * Protects all downstream services from abuse.
 * Configurable via RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MINUTES env vars.
 * Per-route limits can be applied in individual route handlers.
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: config.rateLimitWindowMinutes * 60 * 1000,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
