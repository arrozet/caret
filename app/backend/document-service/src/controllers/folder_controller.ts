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
import type { CreateFolderDto, FolderResponseDto, UpdateFolderDto } from "../dtos/index.js";
import type { PaginatedResponse } from "../lib/validation.js";
import type { ErrorResponseDto } from "./error_response_dto.js";

/**
 * OpenAPI controller metadata for folder endpoints.
 * Runtime requests are still handled by the existing Express router.
 */
@Route("folders")
@Tags("Folders")
@Security("bearerAuth")
@Response<ErrorResponseDto>(401, "Unauthorized")
@Response<ErrorResponseDto>(403, "Forbidden")
@Response<ErrorResponseDto>(422, "Validation error")
export class FolderController {
  /** Create a folder in a workspace. */
  @Post("/")
  @SuccessResponse(201, "Created")
  public async createFolder(@Body() _body: CreateFolderDto): Promise<FolderResponseDto> {
    throw new Error("FolderController is used for OpenAPI metadata only.");
  }

  /** List folders in a workspace, optionally scoped by parent folder. */
  @Get("/")
  public async listFolders(
    @Query("workspace_id") _workspace_id: string,
    @Query("parent_folder_id") _parent_folder_id?: string,
    @Query("limit") _limit?: number,
    @Query("offset") _offset?: number,
  ): Promise<FolderResponseDto[] | PaginatedResponse<FolderResponseDto>> {
    throw new Error("FolderController is used for OpenAPI metadata only.");
  }

  /** List all folders in a workspace as a flat tree-building payload. */
  @Get("all")
  public async listAllFolders(
    @Query("workspace_id") _workspace_id: string,
    @Query("limit") _limit?: number,
    @Query("offset") _offset?: number,
  ): Promise<FolderResponseDto[] | PaginatedResponse<FolderResponseDto>> {
    throw new Error("FolderController is used for OpenAPI metadata only.");
  }

  /** Get a folder by ID. */
  @Get("{id}")
  @Response<ErrorResponseDto>(404, "Folder not found")
  public async getFolder(@Path("id") _id: string): Promise<FolderResponseDto> {
    throw new Error("FolderController is used for OpenAPI metadata only.");
  }

  /** Update folder name, parent, or sort order. */
  @Patch("{id}")
  @Response<ErrorResponseDto>(404, "Folder not found")
  public async updateFolder(
    @Path("id") _id: string,
    @Body() _body: UpdateFolderDto,
  ): Promise<FolderResponseDto> {
    throw new Error("FolderController is used for OpenAPI metadata only.");
  }

  /** Soft-delete a folder and nested content. */
  @Delete("{id}")
  @SuccessResponse(204, "No Content")
  @Response<ErrorResponseDto>(404, "Folder not found")
  public async deleteFolder(@Path("id") _id: string): Promise<void> {
    throw new Error("FolderController is used for OpenAPI metadata only.");
  }
}
