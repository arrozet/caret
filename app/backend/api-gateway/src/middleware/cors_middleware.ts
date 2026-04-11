import cors from "cors";
import { config } from "../lib/config.js";

/**
 * CORS middleware. Restricts cross-origin requests to the allowed frontend origin.
 * In development, allows localhost. In production, allows only the Vercel domain.
 */
export const corsMiddleware = cors({
  origin: config.allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});
