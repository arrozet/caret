import express from "express";
import { corsMiddleware } from "./middleware/cors_middleware.js";
import { rateLimitMiddleware } from "./middleware/rate_limit_middleware.js";
import { errorMiddleware } from "./middleware/error_middleware.js";
import { registerRoutes } from "./routes/index.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";

const app = express();

app.use(express.json());
app.use(corsMiddleware);
app.use(rateLimitMiddleware);

registerRoutes(app);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

app.use(errorMiddleware);

app.listen(config.port, () => {
  logger.info(`API Gateway running on port ${config.port}`);
});

export default app;
