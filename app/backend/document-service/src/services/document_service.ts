import type { DocumentRepository } from "../repositories/document_repository.js";
import type { DocumentVersionRepository } from "../repositories/document_version_repository.js";
import type { WorkspaceRepository } from "../repositories/workspace_repository.js";
import type { CreateDocumentDto } from "../dtos/create_document_dto.js";
import type { UpdateDocumentDto } from "../dtos/update_document_dto.js";
import type { DocumentResponseDto } from "../dtos/document_response_dto.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";

/**
 * Business logic for document lifecycle: create, read, update, delete.
 * Enforces ownership rules and maps between DTOs and repository models.
 *
 * Rule: no HTTP concepts (req, res, status codes) inside Services.
 * Rule: no direct ORM/SQL — delegate all DB access to Repositories.
 */
export class DocumentService {
  /** Document table repository. */
  private document_repo: DocumentRepository;
  /** Document version table repository. */
  private version_repo: DocumentVersionRepository;
  /** Workspace membership repository (for authorization checks). */
  private workspace_repo: WorkspaceRepository;

  constructor(
    document_repo: DocumentRepository,
    version_repo: DocumentVersionRepository,
    workspace_repo: WorkspaceRepository,
  ) {
    this.document_repo = document_repo;
    this.version_repo = version_repo;
    this.workspace_repo = workspace_repo;
  }

  /**
   * Create a new document within a workspace.
   * The caller must be an active member of the workspace.
   * An initial empty version (v1) is created automatically.
   * @param dto - Creation payload from the controller.
   * @param user_id - Authenticated user's UUID.
   * @returns The created document as a response DTO.
   */
  async create_document(
    dto: CreateDocumentDto,
    user_id: string,
  ): Promise<DocumentResponseDto> {
    /* Authorization: caller must belong to the workspace */
    const membership = await this.workspace_repo.find_membership(
      dto.workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const doc = await this.document_repo.create({
      title: dto.title,
      workspace_id: dto.workspace_id,
      folder_id: dto.folder_id ?? null,
      owner_user_id: user_id,
      created_by_user_id: user_id,
      updated_by_user_id: user_id,
    });

    /* Create the initial version (v1) with empty content */
    const initial_content = { type: "doc", content: [] };
    const initial_version = await this.version_repo.create({
      document_id: doc.id,
      version_number: 1,
      source: "manual",
      content_json: initial_content,
      content_text: "",
      created_by_user_id: user_id,
    });

    /* Set the denormalized latest_version_id pointer */
    const updated_doc = await this.document_repo.update(doc.id, {
      latest_version_id: initial_version.id,
    });

    return this.to_response_dto(updated_doc ?? doc, initial_content, "");
  }

  /**
   * Get a single document by ID, including its latest version content.
   * The caller must be an active member of the document's workspace.
   * @param document_id - Document UUID.
   * @param user_id - Authenticated user's UUID.
   * @returns The document as a response DTO.
   */
  async get_document(
    document_id: string,
    user_id: string,
  ): Promise<DocumentResponseDto> {
    const doc = await this.document_repo.find_by_id(document_id);
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    /* Authorization */
    const membership = await this.workspace_repo.find_membership(
      doc.workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const latest_version = await this.version_repo.find_latest(document_id);

    return this.to_response_dto(
      doc,
      (latest_version?.content_json as Record<string, unknown>) ?? null,
      latest_version?.content_text ?? null,
    );
  }

  /**
   * List all documents in a workspace.
   * The caller must be an active member of the workspace.
   * @param workspace_id - Workspace UUID scope.
   * @param user_id - Authenticated user's UUID.
   * @returns Array of document response DTOs (without content).
   */
  async list_documents(
    workspace_id: string,
    user_id: string,
  ): Promise<DocumentResponseDto[]> {
    const membership = await this.workspace_repo.find_membership(
      workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const docs = await this.document_repo.list_by_workspace(workspace_id);
    return docs.map((doc) => this.to_response_dto(doc));
  }

  /**
   * Update a document's title and/or content.
   * When content is provided, a new version snapshot is created.
   * @param document_id - Document UUID.
   * @param dto - Update payload.
   * @param user_id - Authenticated user's UUID.
   * @returns The updated document as a response DTO.
   */
  async update_document(
    document_id: string,
    dto: UpdateDocumentDto,
    user_id: string,
  ): Promise<DocumentResponseDto> {
    const doc = await this.document_repo.find_by_id(document_id);
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    const membership = await this.workspace_repo.find_membership(
      doc.workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    /* Build a type-safe update payload — only whitelisted fields */
    const update_fields: Partial<{
      title: string;
      updated_by_user_id: string;
      latest_version_id: string;
    }> = {
      updated_by_user_id: user_id,
    };
    if (dto.title !== undefined) {
      update_fields.title = dto.title;
    }

    /* If content was provided, create a new version snapshot */
    let content_json: Record<string, unknown> | null = null;
    let content_text: string | null = null;

    if (dto.content_json !== undefined) {
      const latest = await this.version_repo.find_latest(document_id);
      const next_version = (latest?.version_number ?? 0) + 1;

      const version = await this.version_repo.create({
        document_id,
        version_number: next_version,
        source: "autosnapshot",
        content_json: dto.content_json,
        content_text: dto.content_text ?? "",
        created_by_user_id: user_id,
      });

      content_json = version.content_json as Record<string, unknown>;
      content_text = version.content_text;

      /* Update the denormalized latest_version_id pointer */
      update_fields.latest_version_id = version.id;
    }

    const updated_doc = await this.document_repo.update(
      document_id,
      update_fields,
    );
    if (!updated_doc) {
      throw new NotFoundError("Document was deleted during update");
    }

    return this.to_response_dto(updated_doc, content_json, content_text);
  }

  /**
   * Soft-delete a document.
   * The caller must be an active member of the document's workspace.
   * @param document_id - Document UUID.
   * @param user_id - Authenticated user's UUID.
   */
  async delete_document(document_id: string, user_id: string): Promise<void> {
    const doc = await this.document_repo.find_by_id(document_id);
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    const membership = await this.workspace_repo.find_membership(
      doc.workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    await this.document_repo.soft_delete(document_id, user_id);
  }

  /**
   * Map a raw document row to a DocumentResponseDto.
   * @param doc - Database document row.
   * @param content_json - Optional content JSON from the latest version.
   * @param content_text - Optional plain text from the latest version.
   * @returns Formatted response DTO.
   */
  private to_response_dto(
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
}
