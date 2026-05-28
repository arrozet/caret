import express from "express";
import { errorMiddleware } from "./middleware/error_middleware.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { registerOpenApiDocs } from "./openapi/openapi_docs.js";
import openApiSpec from "./openapi/swagger.json" with { type: "json" };

/**
 * Express app entry point for the Auth Service.
 * Routes are plain Express Router factories (no tsoa).
 */
const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "auth-service" });
});

/** OpenAPI JSON and Swagger UI documentation. */
registerOpenApiDocs(app, openApiSpec);

app.use(errorMiddleware);

app.listen(config.PORT, () => {
  logger.info(`Auth Service running on port ${config.PORT}`);
});

export default app;
