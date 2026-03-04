import express from "express";
import { error_middleware } from "./middleware/error_middleware.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";

/**
 * Express app entry point for the Auth Service.
 * Routes are plain Express Router factories (no tsoa).
 */
const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "auth-service" });
});

app.use(error_middleware);

app.listen(config.PORT, () => {
  logger.info(`Auth Service running on port ${config.PORT}`);
});

export default app;
