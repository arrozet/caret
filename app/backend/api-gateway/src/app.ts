import express from "express";
import { cors_middleware } from "./middleware/cors_middleware.js";
import { rate_limit_middleware } from "./middleware/rate_limit_middleware.js";
import { error_middleware } from "./middleware/error_middleware.js";
import { register_routes } from "./routes/index.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";

const app = express();

app.use(express.json());
app.use(cors_middleware);
app.use(rate_limit_middleware);

register_routes(app);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

app.use(error_middleware);

app.listen(config.PORT, () => {
  logger.info(`API Gateway running on port ${config.PORT}`);
});

export default app;
