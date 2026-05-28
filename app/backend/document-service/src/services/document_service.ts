import type { DocumentRepository } from "../repositories/document_repository.js";
import type { DocumentMemberRepository } from "../repositories/document_member_repository.js";
import type { DocumentVersionRepository } from "../repositories/document_version_repository.js";
import type { WorkspaceRepository } from "../repositories/workspace_repository.js";
import type { CreateDocumentDto } from "../dtos/create_document_dto.js";
import type { UpdateDocumentDto } from "../dtos/update_document_dto.js";
import type { DocumentResponseDto } from "../dtos/document_response_dto.js";
import type { InviteDocumentMemberResponseDto } from "../dtos/invite_document_member_response_dto.js";
import type { PaginationParams, PaginatedResponse } from "../lib/validation.js";
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from "../lib/errors.js";

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
  /** Per-document membership repository. */
  private documentMemberRepository: DocumentMemberRepository;
  /** Document version table repository. */
  private versionRepository: DocumentVersionRepository;
  /** Workspace membership repository (for authorization checks). */
  private workspaceRepository: WorkspaceRepository;

  constructor(
    documentRepository: DocumentRepository,
    documentMemberRepository: DocumentMemberRepository,
    versionRepository: DocumentVersionRepository,
    workspaceRepository: WorkspaceRepository,
  ) {
    this.documentRepository = documentRepository;
    this.documentMemberRepository = documentMemberRepository;
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
    if (!dto.workspace_id) {
      throw new ValidationError("workspace_id is required");
    }

    const workspace = await this.workspaceRepository.findById(dto.workspace_id);
    if (!workspace) {
      throw new NotFoundError("Workspace not found");
    }

    /* Authorization: caller must belong to the workspace */
    const membership = await this.workspaceRepository.findMembership(dto.workspace_id, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    if (dto.folder_id !== undefined && dto.folder_id !== null) {
      const folder = await this.workspaceRepository.findFolderById(dto.folder_id);
      if (!folder) {
        throw new NotFoundError("Folder not found");
      }
      if (folder.workspace_id !== dto.workspace_id) {
        throw new ForbiddenError("Folder does not belong to the specified workspace");
      }
    }

    const resolvedTitle = await this.resolveUniqueDocumentTitle(
      dto.workspace_id,
      dto.folder_id ?? null,
      dto.title,
    );

    const visibility =
      this.getWorkspaceKind(workspace.settings) === "personal" ? "private" : "workspace";

    const doc = await this.documentRepository.create({
      title: resolvedTitle,
      workspace_id: dto.workspace_id,
      folder_id: dto.folder_id ?? null,
      visibility,
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

    const workspaceMembership = await this.workspaceRepository.findMembership(
      doc.workspace_id,
      userId,
    );
    const documentMembership = await this.documentMemberRepository.findMembership(
      documentId,
      userId,
    );

    /* Authorization */
    if (!workspaceMembership && !documentMembership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    if (
      doc.visibility === "private" &&
      !documentMembership &&
      workspaceMembership?.role !== "owner" &&
      workspaceMembership?.role !== "admin"
    ) {
      throw new ForbiddenError("You do not have access to this document");
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

    const { data } = await this.documentRepository.listByWorkspace(workspaceId, pagination);
    const visibleData = data.filter(
      (doc) =>
        doc.visibility !== "private" || membership.role === "owner" || membership.role === "admin",
    );
    return {
      data: visibleData.map((doc) => this.toResponseDto(doc)),
      pagination: {
        total: visibleData.length,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    };
  }

  /**
   * List documents directly shared with the current user.
   */
  async listSharedDocuments(
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<DocumentResponseDto>> {
    const { data, total } = await this.documentMemberRepository.listByUser(userId, pagination);

    return {
      data: data.map((row) => {
        const { role: _role, ...document } = row;
        return this.toResponseDto(document);
      }),
      pagination: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    };
  }

  async list_shared_documents(
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<DocumentResponseDto>> {
    return this.listSharedDocuments(userId, pagination);
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

    const workspaceMembership = await this.workspaceRepository.findMembership(
      doc.workspace_id,
      userId,
    );
    const documentMembership = await this.documentMemberRepository.findMembership(
      documentId,
      userId,
    );
    if (!this.canModifyDocument(workspaceMembership, documentMembership)) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    /* Build a type-safe update payload — only whitelisted fields */
    const updateFields: Partial<{
      title: string;
      workspace_id: string;
      folder_id: string | null;
      visibility: "private" | "public" | "workspace" | "link";
      updated_by_user_id: string;
      latest_version_id: string;
    }> = {
      updated_by_user_id: userId,
    };
    if (dto.title !== undefined) {
      updateFields.title = dto.title;
    }

    let targetWorkspaceId = doc.workspace_id;
    if (dto.workspace_id !== undefined) {
      const targetWorkspace = await this.workspaceRepository.findById(dto.workspace_id);
      if (!targetWorkspace) {
        throw new NotFoundError("Workspace not found");
      }

      targetWorkspaceId = dto.workspace_id;
      updateFields.workspace_id = dto.workspace_id;
      updateFields.visibility =
        this.getWorkspaceKind(targetWorkspace.settings) === "personal" ? "private" : "workspace";
      if (dto.folder_id === undefined) {
        updateFields.folder_id = null;
      }
    }

    if (dto.folder_id !== undefined) {
      if (dto.folder_id === null) {
        updateFields.folder_id = null;
      } else {
        const folder = await this.workspaceRepository.findFolderById(dto.folder_id);
        if (!folder) {
          throw new NotFoundError("Folder not found");
        }
        if (folder.workspace_id !== targetWorkspaceId) {
          throw new ForbiddenError("Folder does not belong to the specified workspace");
        }
        updateFields.folder_id = dto.folder_id;
      }
    }

    if (dto.title !== undefined) {
      await this.assertDocumentTitleAvailable(
        targetWorkspaceId,
        dto.folder_id ?? updateFields.folder_id ?? doc.folder_id,
        dto.title,
        documentId,
      );
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

    const workspaceMembership = await this.workspaceRepository.findMembership(
      doc.workspace_id,
      userId,
    );
    const documentMembership = await this.documentMemberRepository.findMembership(
      documentId,
      userId,
    );
    if (!this.canModifyDocument(workspaceMembership, documentMembership)) {
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
   * Invite an existing user (resolved by email) to a document directly.
   *
   * Direct document sharing is only available for documents that live in a
   * shared workspace.
   */
  async inviteDocumentCollaborator(
    documentId: string,
    invitedEmail: string,
    inviterUserId: string,
  ): Promise<InviteDocumentMemberResponseDto> {
    const doc = await this.documentRepository.findById(documentId);
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    const workspace = await this.workspaceRepository.findById(doc.workspace_id);
    if (!workspace) {
      throw new NotFoundError("Workspace not found");
    }

    if (this.getWorkspaceKind(workspace.settings) === "personal") {
      throw new ForbiddenError("Personal workspaces cannot be shared directly");
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

    const existingMember = await this.documentMemberRepository.findMembership(
      documentId,
      invitedUserId,
    );
    if (existingMember) {
      return {
        document_id: documentId,
        user_id: invitedUserId,
        email: invitedEmail,
        role: existingMember.role,
        scope: "document",
      };
    }

    await this.documentMemberRepository.addMember({
      document_id: documentId,
      user_id: invitedUserId,
      role: "editor",
      added_by_user_id: inviterUserId,
    });

    return {
      document_id: documentId,
      user_id: invitedUserId,
      email: invitedEmail,
      role: "editor",
      scope: "document",
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

  /**
   * Ensure no active document with the same title exists in the same folder.
   * @param workspaceId - Workspace UUID.
   * @param folderId - Target folder UUID (null = root).
   * @param title - Proposed document title.
   * @param excludeDocumentId - Optional document ID to exclude from the check.
   */
  private async assertDocumentTitleAvailable(
    workspaceId: string,
    folderId: string | null,
    title: string,
    excludeDocumentId?: string,
  ): Promise<void> {
    const existing = await this.documentRepository.findByTitleInFolder(
      workspaceId,
      folderId,
      title,
      excludeDocumentId,
    );
    if (existing) {
      throw new ConflictError(
        `A document named "${title}" already exists in this location. Please choose a different name.`,
      );
    }
  }

  /**
   * Resolve a unique document title by auto-incrementing a suffix ("Untitled 2", …)
   * when the base title already exists in the same folder.
   * @param workspaceId - Workspace UUID.
   * @param folderId - Target folder UUID (null = root).
   * @param title - Preferred base title.
   * @returns A unique title guaranteed not to conflict.
   */
  private async resolveUniqueDocumentTitle(
    workspaceId: string,
    folderId: string | null,
    title: string,
  ): Promise<string> {
    let candidate = title;
    let existing = await this.documentRepository.findByTitleInFolder(
      workspaceId,
      folderId,
      candidate,
    );
    let counter = 2;
    while (existing) {
      candidate = `${title} ${counter}`;
      existing = await this.documentRepository.findByTitleInFolder(
        workspaceId,
        folderId,
        candidate,
      );
      counter += 1;
    }
    return candidate;
  }

  async invite_document_collaborator(
    documentId: string,
    invitedEmail: string,
    inviterUserId: string,
  ): Promise<InviteDocumentMemberResponseDto> {
    return this.inviteDocumentCollaborator(documentId, invitedEmail, inviterUserId);
  }

  /**
   * Resolve the workspace kind from its settings JSON blob.
   */
  private getWorkspaceKind(settings: unknown): "personal" | "shared" {
    if (typeof settings === "object" && settings !== null && "kind" in settings) {
      const kind = (settings as { kind?: unknown }).kind;
      if (kind === "personal") {
        return "personal";
      }
    }

    return "shared";
  }

  /**
   * Determine whether the caller can modify a document.
   */
  private canModifyDocument(
    workspaceMembership: { role: string } | null,
    documentMembership: { role: string } | null,
  ): boolean {
    if (workspaceMembership) {
      return true;
    }

    return documentMembership?.role === "owner" || documentMembership?.role === "editor";
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
