import { Get, Route, Tags } from "tsoa";

/** Health response returned by service liveness endpoints. */
export interface HealthResponseDto {
  /** Current service health status. */
  status: "ok";
  /** Service identifier. */
  service: "document-service";
}

/** OpenAPI controller metadata for the Document Service health endpoint. */
@Route("health")
@Tags("Health")
export class HealthController {
  /** Return liveness status for the Document Service. */
  @Get("/")
  public async getHealth(): Promise<HealthResponseDto> {
    throw new Error("HealthController is used for OpenAPI metadata only.");
  }
}
