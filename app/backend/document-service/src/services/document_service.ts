import type { DocumentRepository } from "../repositories/document_repository.js";
import type { DocumentVersionRepository } from "../repositories/document_version_repository.js";
import type { WorkspaceRepository } from "../repositories/workspace_repository.js";
import type { CreateDocumentDto } from "../dtos/create_document_dto.js";
import type { UpdateDocumentDto } from "../dtos/update_document_dto.js";
import type { DocumentResponseDto } from "../dtos/document_response_dto.js";
import type { InviteWorkspaceMemberResponseDto } from "../dtos/invite_workspace_member_response_dto.js";
import type { PaginationParams, PaginatedResponse } from "../lib/validation.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../lib/errors.js";

/**
 * Business logic for document lifecycle: create, read, update, delete.
 * Enforces ownership rules and maps between DTOs and repository models.
 *
 * Rule: no HTTP concepts (req, res, status codes) inside Services.
 * Rule: no direct ORM/SQL — delegate all DB access to Repositories.
 */
export class DocumentService {
  /** Document table repository. */
  private documentRepository: DocumentRepository;
  /** Document version table repository. */
  private versionRepository: DocumentVersionRepository;
  /** Workspace membership repository (for authorization checks). */
  private workspaceRepository: WorkspaceRepository;

  constructor(
    documentRepository: DocumentRepository,
    versionRepository: DocumentVersionRepository,
    workspaceRepository: WorkspaceRepository,
  ) {
    this.documentRepository = documentRepository;
    this.versionRepository = versionRepository;
    this.workspaceRepository = workspaceRepository;
  }

  /**
   * Create a new document within a workspace.
   * The caller must be an active member of the workspace.
   * An initial empty version (v1) is created automatically.
   * @param dto - Creation payload from the controller.
   * @param user_id - Authenticated user's UUID.
   * @returns The created document as a response DTO.
   */
  async createDocument(dto: CreateDocumentDto, userId: string): Promise<DocumentResponseDto> {
    /* Authorization: caller must belong to the workspace */
    const membership = await this.workspaceRepository.findMembership(dto.workspace_id, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const doc = await this.documentRepository.create({
      title: dto.title,
      workspace_id: dto.workspace_id,
      folder_id: dto.folder_id ?? null,
      owner_user_id: userId,
      created_by_user_id: userId,
      updated_by_user_id: userId,
    });

    /* Create the initial version (v1) with empty content */
    const initialContent = { type: "doc", content: [] };
    const initialVersion = await this.versionRepository.create({
      document_id: doc.id,
      version_number: 1,
      source: "manual",
      content_json: initialContent,
      content_text: "",
      created_by_user_id: userId,
    });

    /* Set the denormalized latest_version_id pointer */
    const updatedDoc = await this.documentRepository.update(doc.id, {
      latest_version_id: initialVersion.id,
    });

    return this.toResponseDto(updatedDoc ?? doc, initialContent, "");
  }

  /**
   * Get a single document by ID, including its latest version content.
   * The caller must be an active member of the document's workspace.
   * @param document_id - Document UUID.
   * @param user_id - Authenticated user's UUID.
   * @returns The document as a response DTO.
   */
  async getDocument(documentId: string, userId: string): Promise<DocumentResponseDto> {
    const doc = await this.documentRepository.findById(documentId);
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    /* Authorization */
    const membership = await this.workspaceRepository.findMembership(doc.workspace_id, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const latestVersion = await this.versionRepository.findLatest(documentId);

    return this.toResponseDto(
      doc,
      (latestVersion?.content_json as Record<string, unknown>) ?? null,
      latestVersion?.content_text ?? null,
    );
  }

  /**
   * List all documents in a workspace with pagination.
   * The caller must be an active member of the workspace.
   * @param workspace_id - Workspace UUID scope.
   * @param user_id - Authenticated user's UUID.
   * @param pagination - Limit and offset for pagination.
   * @returns Paginated array of document response DTOs (without content).
   */
  async listDocuments(
    workspaceId: string,
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<DocumentResponseDto>> {
    const membership = await this.workspaceRepository.findMembership(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const { data, total } = await this.documentRepository.listByWorkspace(workspaceId, pagination);
    return {
      data: data.map((doc) => this.toResponseDto(doc)),
      pagination: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    };
  }

  /**
   * Update a document's title and/or content.
   * When content is provided, a new version snapshot is created.
   * @param document_id - Document UUID.
   * @param dto - Update payload.
   * @param user_id - Authenticated user's UUID.
   * @returns The updated document as a response DTO.
   */
  async updateDocument(
    documentId: string,
    dto: UpdateDocumentDto,
    userId: string,
  ): Promise<DocumentResponseDto> {
    const doc = await this.documentRepository.findById(documentId);
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    const membership = await this.workspaceRepository.findMembership(doc.workspace_id, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    /* Build a type-safe update payload — only whitelisted fields */
    const updateFields: Partial<{
      title: string;
      updated_by_user_id: string;
      latest_version_id: string;
    }> = {
      updated_by_user_id: userId,
    };
    if (dto.title !== undefined) {
      updateFields.title = dto.title;
    }

    /* If content was provided, create a new version snapshot */
    let contentJson: Record<string, unknown> | null = null;
    let contentText: string | null = null;

    if (dto.content_json !== undefined) {
      const version = await this.createVersionWithRetry({
        documentId,
        contentJson: dto.content_json,
        contentText: dto.content_text ?? "",
        userId,
      });

      contentJson = version.content_json as Record<string, unknown>;
      contentText = version.content_text;

      /* Update the denormalized latest_version_id pointer */
      updateFields.latest_version_id = version.id;
    }

    const updatedDoc = await this.documentRepository.update(documentId, updateFields);
    if (!updatedDoc) {
      throw new NotFoundError("Document was deleted during update");
    }

    return this.toResponseDto(updatedDoc, contentJson, contentText);
  }

  /**
   * Soft-delete a document.
   * The caller must be an active member of the document's workspace.
   * @param document_id - Document UUID.
   * @param user_id - Authenticated user's UUID.
   */
  async deleteDocument(documentId: string, userId: string): Promise<void> {
    const doc = await this.documentRepository.findById(documentId);
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    const membership = await this.workspaceRepository.findMembership(doc.workspace_id, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    await this.documentRepository.softDelete(documentId, userId);
  }

  /**
   * Create a new document version with optimistic retry on unique conflicts.
   *
   * Concurrent saves can race on `(document_id, version_number)`. When that
   * happens we recompute the latest version and retry with the next number.
   */
  private async createVersionWithRetry(params: {
    documentId: string;
    contentJson: Record<string, unknown>;
    contentText: string;
    userId: string;
  }) {
    const { documentId, contentJson, contentText, userId } = params;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const latest = await this.versionRepository.findLatest(documentId);
      const nextVersion = (latest?.version_number ?? 0) + 1;

      try {
        const version = await this.versionRepository.create({
          document_id: documentId,
          version_number: nextVersion,
          source: "autosnapshot",
          content_json: contentJson,
          content_text: contentText,
          created_by_user_id: userId,
        });
        return version;
      } catch (err: unknown) {
        if (isUniqueViolation(err) && attempt < maxAttempts) {
          continue;
        }

        if (isUniqueViolation(err)) {
          throw new ConflictError("Document was updated concurrently. Please retry.");
        }

        throw err;
      }
    }

    throw new ConflictError("Document was updated concurrently. Please retry.");
  }

  /**
   * Invite an existing user (resolved by email) to the document's workspace.
   *
   * Current MVP behavior grants workspace membership (`member`) so the invited
   * user can see and open the shared document in their list.
   *
   * @param document_id - Document UUID to share.
   * @param invited_email - Email address of the target user.
   * @param inviter_user_id - Authenticated inviter user UUID.
   * @returns Invitation result payload.
   */
  async inviteDocumentCollaborator(
    documentId: string,
    invitedEmail: string,
    inviterUserId: string,
  ): Promise<InviteWorkspaceMemberResponseDto> {
    const doc = await this.documentRepository.findById(documentId);
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    const inviterMembership = await this.workspaceRepository.findMembership(
      doc.workspace_id,
      inviterUserId,
    );
    if (!inviterMembership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const invitedUserId = await this.workspaceRepository.findAuthUserIdByEmail(invitedEmail);

    if (!invitedUserId) {
      throw new NotFoundError("User with this email does not exist in Caret");
    }

    const existingActive = await this.workspaceRepository.findMembership(
      doc.workspace_id,
      invitedUserId,
    );

    if (existingActive) {
      return {
        workspace_id: doc.workspace_id,
        user_id: invitedUserId,
        email: invitedEmail,
        role: "member",
      };
    }

    const existingAny = await this.workspaceRepository.findMembershipAny(
      doc.workspace_id,
      invitedUserId,
    );

    if (existingAny) {
      await this.workspaceRepository.reactivateMember(
        doc.workspace_id,
        invitedUserId,
        inviterUserId,
      );
    } else {
      await this.workspaceRepository.addMember({
        workspace_id: doc.workspace_id,
        user_id: invitedUserId,
        role: "member",
        invited_by_user_id: inviterUserId,
      });
    }

    return {
      workspace_id: doc.workspace_id,
      user_id: invitedUserId,
      email: invitedEmail,
      role: "member",
    };
  }

  /**
   * Map a raw document row to a DocumentResponseDto.
   * @param doc - Database document row.
   * @param content_json - Optional content JSON from the latest version.
   * @param content_text - Optional plain text from the latest version.
   * @returns Formatted response DTO.
   */
  private toResponseDto(
    doc: {
      id: string;
      workspace_id: string;
      folder_id: string | null;
      title: string;
      status: string;
      visibility: string;
      owner_user_id: string | null;
      created_at: Date;
      updated_at: Date;
    },
    content_json?: Record<string, unknown> | null,
    content_text?: string | null,
  ): DocumentResponseDto {
    return {
      id: doc.id,
      workspace_id: doc.workspace_id,
      folder_id: doc.folder_id,
      title: doc.title,
      status: doc.status,
      visibility: doc.visibility,
      owner_user_id: doc.owner_user_id,
      content_json: content_json ?? undefined,
      content_text: content_text ?? undefined,
      created_at: doc.created_at.toISOString(),
      updated_at: doc.updated_at.toISOString(),
    };
  }

  async create_document(dto: CreateDocumentDto, userId: string): Promise<DocumentResponseDto> {
    return this.createDocument(dto, userId);
  }

  async get_document(documentId: string, userId: string): Promise<DocumentResponseDto> {
    return this.getDocument(documentId, userId);
  }

  async list_documents(
    workspaceId: string,
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<DocumentResponseDto>> {
    return this.listDocuments(workspaceId, userId, pagination);
  }

  async update_document(
    documentId: string,
    dto: UpdateDocumentDto,
    userId: string,
  ): Promise<DocumentResponseDto> {
    return this.updateDocument(documentId, dto, userId);
  }

  async delete_document(documentId: string, userId: string): Promise<void> {
    return this.deleteDocument(documentId, userId);
  }

  async invite_document_collaborator(
    documentId: string,
    invitedEmail: string,
    inviterUserId: string,
  ): Promise<InviteWorkspaceMemberResponseDto> {
    return this.inviteDocumentCollaborator(documentId, invitedEmail, inviterUserId);
  }
}

/**
 * Check whether a thrown error is a Postgres unique constraint violation (code 23505).
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}
