import { rateLimit } from "express-rate-limit";

/**
 * Global rate limiter applied at the Gateway level.
 * Protects all downstream services from abuse.
 * Per-route limits can be applied in individual route handlers.
 */
export const rate_limit_middleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
