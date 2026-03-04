import cors from "cors";
import { config } from "../lib/config.js";

/**
 * CORS middleware. Restricts cross-origin requests to the allowed frontend origin.
 * In development, allows localhost. In production, allows only the Vercel domain.
 */
export const cors_middleware = cors({
  origin: config.ALLOWED_ORIGINS,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});
