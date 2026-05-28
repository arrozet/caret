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
  CreateDocumentDto,
  DocumentResponseDto,
  InviteDocumentMemberResponseDto,
  InviteWorkspaceMemberDto,
  UpdateDocumentDto,
} from "../dtos/index.js";
import type { PaginatedResponse } from "../lib/validation.js";
import type { ErrorResponseDto } from "./error_response_dto.js";

/**
 * OpenAPI controller metadata for document endpoints.
 * Runtime requests are still handled by the existing Express router.
 */
@Route("documents")
@Tags("Documents")
@Security("bearerAuth")
@Response<ErrorResponseDto>(401, "Unauthorized")
@Response<ErrorResponseDto>(403, "Forbidden")
@Response<ErrorResponseDto>(422, "Validation error")
export class DocumentController {
  /** Create a document in a workspace. */
  @Post("/")
  @SuccessResponse(201, "Created")
  public async createDocument(@Body() _body: CreateDocumentDto): Promise<DocumentResponseDto> {
    throw new Error("DocumentController is used for OpenAPI metadata only.");
  }

  /** List documents in a workspace. */
  @Get("/")
  public async listDocuments(
    @Query("workspace_id") _workspace_id: string,
    @Query("limit") _limit?: number,
    @Query("offset") _offset?: number,
  ): Promise<DocumentResponseDto[] | PaginatedResponse<DocumentResponseDto>> {
    throw new Error("DocumentController is used for OpenAPI metadata only.");
  }

  /** List documents shared directly with the caller. */
  @Get("shared")
  public async listSharedDocuments(
    @Query("limit") _limit?: number,
    @Query("offset") _offset?: number,
  ): Promise<DocumentResponseDto[] | PaginatedResponse<DocumentResponseDto>> {
    throw new Error("DocumentController is used for OpenAPI metadata only.");
  }

  /** Get a document by ID. */
  @Get("{id}")
  @Response<ErrorResponseDto>(404, "Document not found")
  public async getDocument(@Path("id") _id: string): Promise<DocumentResponseDto> {
    throw new Error("DocumentController is used for OpenAPI metadata only.");
  }

  /** Update document metadata or content. */
  @Patch("{id}")
  @Response<ErrorResponseDto>(404, "Document not found")
  public async updateDocument(
    @Path("id") _id: string,
    @Body() _body: UpdateDocumentDto,
  ): Promise<DocumentResponseDto> {
    throw new Error("DocumentController is used for OpenAPI metadata only.");
  }

  /** Soft-delete a document. */
  @Delete("{id}")
  @SuccessResponse(204, "No Content")
  @Response<ErrorResponseDto>(404, "Document not found")
  public async deleteDocument(@Path("id") _id: string): Promise<void> {
    throw new Error("DocumentController is used for OpenAPI metadata only.");
  }

  /** Invite a collaborator to a document by email. */
  @Post("{id}/invite")
  @SuccessResponse(201, "Created")
  @Response<ErrorResponseDto>(404, "Document or user not found")
  public async inviteDocumentCollaborator(
    @Path("id") _id: string,
    @Body() _body: InviteWorkspaceMemberDto,
  ): Promise<InviteDocumentMemberResponseDto> {
    throw new Error("DocumentController is used for OpenAPI metadata only.");
  }
}
