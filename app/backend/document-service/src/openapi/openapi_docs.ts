import type { Express, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";

/** Minimal OpenAPI document shape served by the docs endpoint. */
export type OpenApiSpec = Record<string, unknown>;

/**
 * Register machine-readable OpenAPI JSON and human-readable Swagger UI routes.
 *
 * @param app - Express application to mount docs onto.
 * @param spec - Generated OpenAPI specification.
 */
export function registerOpenApiDocs(app: Express, spec: OpenApiSpec): void {
  app.get("/openapi.json", (_req: Request, res: Response) => {
    res.json(spec);
  });

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));
}
