import { Get, Route, Tags } from "tsoa";

/** Health response returned by service liveness endpoints. */
export interface HealthResponseDto {
  /** Current service health status. */
  status: "ok";
  /** Service identifier. */
  service: "auth-service";
}

/** OpenAPI metadata for the Auth Service health endpoint. */
@Route("health")
@Tags("Health")
export class AuthController {
  /** Return liveness status for the Auth Service. */
  @Get("/")
  public async getHealth(): Promise<HealthResponseDto> {
    throw new Error("AuthController is used for OpenAPI metadata only.");
  }
}
