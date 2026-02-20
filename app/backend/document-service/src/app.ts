import "reflect-metadata";
import express from "express";
import { error_middleware } from "./middleware/error_middleware.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";

/**
 * Express app entry point for the Document Service.
 * tsoa-generated routes and OpenAPI spec are registered here.
 * Repositories are instantiated here and injected into Services via DI.
 */
const app = express();

app.use(express.json());

// tsoa-generated routes will be registered here after running `bun run generate`
// import { RegisterRoutes } from "./routes/routes.js";
// RegisterRoutes(app);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "document-service" });
});

app.use(error_middleware);

app.listen(config.PORT, () => {
  logger.info(`Document Service running on port ${config.PORT}`);
});

export default app;
