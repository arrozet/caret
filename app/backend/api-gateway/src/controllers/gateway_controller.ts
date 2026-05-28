import { Get, Route, Tags } from "tsoa";

/** API Gateway service metadata response. */
export interface GatewayInfoResponseDto {
  /** Service identifier. */
  service: "caret-api-gateway";
  /** Public API version. */
  version: "v1";
  /** Route prefixes forwarded by the gateway. */
  endpoints: string[];
}

/** Health response returned by service liveness endpoints. */
export interface HealthResponseDto {
  /** Current service health status. */
  status: "ok";
  /** Service identifier. */
  service: "api-gateway";
}

/** OpenAPI metadata for the API Gateway discovery endpoints. */
@Route("")
@Tags("Gateway")
export class GatewayController {
  /** Return available API v1 route prefixes. */
  @Get("api/v1")
  public async getApiInfo(): Promise<GatewayInfoResponseDto> {
    throw new Error("GatewayController is used for OpenAPI metadata only.");
  }

  /** Return liveness status for the API Gateway. */
  @Get("health")
  public async getHealth(): Promise<HealthResponseDto> {
    throw new Error("GatewayController is used for OpenAPI metadata only.");
  }
}
