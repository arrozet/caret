import {
  Body,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";
import type {
  CreateWorkspaceDto,
  InviteWorkspaceMemberDto,
  InviteWorkspaceMemberResponseDto,
  UpdateWorkspaceDto,
  WorkspaceResponseDto,
} from "../dtos/index.js";
import type { PaginatedResponse } from "../lib/validation.js";
import type { ErrorResponseDto } from "./error_response_dto.js";

/**
 * OpenAPI controller metadata for workspace endpoints.
 * Runtime requests are still handled by the existing Express router.
 */
@Route("workspaces")
@Tags("Workspaces")
@Security("bearerAuth")
@Response<ErrorResponseDto>(401, "Unauthorized")
@Response<ErrorResponseDto>(403, "Forbidden")
@Response<ErrorResponseDto>(422, "Validation error")
export class WorkspaceController {
  /** Create a workspace and add the caller as owner. */
  @Post("/")
  @SuccessResponse(201, "Created")
  public async createWorkspace(@Body() _body: CreateWorkspaceDto): Promise<WorkspaceResponseDto> {
    throw new Error("WorkspaceController is used for OpenAPI metadata only.");
  }

  /** List workspaces visible to the caller. */
  @Get("/")
  public async listWorkspaces(
    @Query("limit") _limit?: number,
    @Query("offset") _offset?: number,
  ): Promise<WorkspaceResponseDto[] | PaginatedResponse<WorkspaceResponseDto>> {
    throw new Error("WorkspaceController is used for OpenAPI metadata only.");
  }

  /** Get a workspace by ID. */
  @Get("{id}")
  @Response<ErrorResponseDto>(404, "Workspace not found")
  public async getWorkspace(@Path("id") _id: string): Promise<WorkspaceResponseDto> {
    throw new Error("WorkspaceController is used for OpenAPI metadata only.");
  }

  /** Rename a workspace. */
  @Patch("{id}")
  @Response<ErrorResponseDto>(404, "Workspace not found")
  public async updateWorkspace(
    @Path("id") _id: string,
    @Body() _body: UpdateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    throw new Error("WorkspaceController is used for OpenAPI metadata only.");
  }

  /** Soft-delete a workspace. */
  @Delete("{id}")
  @SuccessResponse(204, "No Content")
  @Response<ErrorResponseDto>(404, "Workspace not found")
  public async deleteWorkspace(@Path("id") _id: string): Promise<void> {
    throw new Error("WorkspaceController is used for OpenAPI metadata only.");
  }

  /** Invite a collaborator to a workspace by email. */
  @Post("{id}/invite")
  @SuccessResponse(201, "Created")
  @Response<ErrorResponseDto>(404, "Workspace or user not found")
  public async inviteWorkspaceCollaborator(
    @Path("id") _id: string,
    @Body() _body: InviteWorkspaceMemberDto,
  ): Promise<InviteWorkspaceMemberResponseDto> {
    throw new Error("WorkspaceController is used for OpenAPI metadata only.");
  }
}
