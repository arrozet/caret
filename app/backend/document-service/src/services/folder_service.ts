import type { FolderRepository } from "../repositories/folder_repository.js";
import type { DocumentRepository } from "../repositories/document_repository.js";
import type { DocumentMemberRepository } from "../repositories/document_member_repository.js";
import type { WorkspaceRepository } from "../repositories/workspace_repository.js";
import type { CreateFolderDto } from "../dtos/create_folder_dto.js";
import type { UpdateFolderDto } from "../dtos/update_folder_dto.js";
import type { FolderResponseDto } from "../dtos/folder_response_dto.js";
import type { PaginationParams, PaginatedResponse } from "../lib/validation.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";

/**
 * Business logic for folder lifecycle: create, read, update, delete.
 * Enforces workspace membership and maps between DTOs and repository models.
 *
 * Rule: no HTTP concepts (req, res, status codes) inside Services.
 * Rule: no direct ORM/SQL — delegate all DB access to Repositories.
 */
export class FolderService {
  /** Folder table repository. */
  private folderRepository: FolderRepository;
  /** Workspace membership repository (for authorization checks). */
  private workspaceRepository: WorkspaceRepository;
  /** Document repository used for subtree delete cascades. */
  private documentRepository: DocumentRepository;
  /** Document membership repository used for subtree delete cascades. */
  private documentMemberRepository: DocumentMemberRepository;

  constructor(
    folderRepository: FolderRepository,
    workspaceRepository: WorkspaceRepository,
    documentRepository: DocumentRepository,
    documentMemberRepository: DocumentMemberRepository,
  ) {
    this.folderRepository = folderRepository;
    this.workspaceRepository = workspaceRepository;
    this.documentRepository = documentRepository;
    this.documentMemberRepository = documentMemberRepository;
  }

  /**
   * Create a new folder within a workspace.
   * The caller must be an active member of the workspace.
   * @param dto - Creation payload from the controller.
   * @param user_id - Authenticated user's UUID.
   * @returns The created folder as a response DTO.
   */
  async createFolder(dto: CreateFolderDto, userId: string): Promise<FolderResponseDto> {
    /* Authorization: caller must belong to the workspace */
    const membership = await this.workspaceRepository.findMembership(dto.workspace_id, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    /* If a parent_folder_id is provided, verify it exists and belongs to the same workspace */
    if (dto.parent_folder_id) {
      const parent = await this.folderRepository.findById(dto.parent_folder_id);
      if (!parent) {
        throw new NotFoundError("Parent folder not found");
      }
      if (parent.workspace_id !== dto.workspace_id) {
        throw new ForbiddenError("Parent folder does not belong to the specified workspace");
      }
    }

    const folder = await this.folderRepository.create({
      workspace_id: dto.workspace_id,
      parent_folder_id: dto.parent_folder_id ?? null,
      name: dto.name,
      sort_order: dto.sort_order ?? null,
      created_by_user_id: userId,
    });

    return this.toResponseDto(folder);
  }

  async create_folder(dto: CreateFolderDto, userId: string): Promise<FolderResponseDto> {
    return this.createFolder(dto, userId);
  }

  /**
   * Get a single folder by ID.
   * The caller must be an active member of the folder's workspace.
   * @param folder_id - Folder UUID.
   * @param user_id - Authenticated user's UUID.
   * @returns The folder as a response DTO.
   */
  async getFolder(folderId: string, userId: string): Promise<FolderResponseDto> {
    const folder = await this.folderRepository.findById(folderId);
    if (!folder) {
      throw new NotFoundError("Folder not found");
    }

    /* Authorization */
    const membership = await this.workspaceRepository.findMembership(folder.workspace_id, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    return this.toResponseDto(folder);
  }

  async get_folder(folderId: string, userId: string): Promise<FolderResponseDto> {
    return this.getFolder(folderId, userId);
  }

  /**
   * List folders in a workspace, optionally filtered by parent folder, with pagination.
   * The caller must be an active member of the workspace.
   * @param workspace_id - Workspace UUID scope.
   * @param user_id - Authenticated user's UUID.
   * @param parent_folder_id - Parent folder UUID (null = list root folders).
   * @param pagination - Limit and offset for pagination.
   * @returns Paginated array of folder response DTOs.
   */
  async listFolders(
    workspaceId: string,
    userId: string,
    parentFolderId: string | null = null,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<FolderResponseDto>> {
    const membership = await this.workspaceRepository.findMembership(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const { data, total } = await this.folderRepository.listByWorkspace(
      workspaceId,
      parentFolderId,
      pagination,
    );
    return {
      data: data.map((folder) => this.toResponseDto(folder)),
      pagination: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    };
  }

  async list_folders(
    workspaceId: string,
    userId: string,
    parentFolderId: string | null = null,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<FolderResponseDto>> {
    return this.listFolders(workspaceId, userId, parentFolderId, pagination);
  }

  /**
   * List all folders in a workspace (flat list for tree building), with pagination.
   * The caller must be an active member of the workspace.
   * @param workspace_id - Workspace UUID scope.
   * @param user_id - Authenticated user's UUID.
   * @param pagination - Limit and offset for pagination.
   * @returns Paginated array of all folder response DTOs in the workspace.
   */
  async listAllFolders(
    workspaceId: string,
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<FolderResponseDto>> {
    const membership = await this.workspaceRepository.findMembership(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const { data, total } = await this.folderRepository.listAllByWorkspace(workspaceId, pagination);
    return {
      data: data.map((folder) => this.toResponseDto(folder)),
      pagination: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    };
  }

  async list_all_folders(
    workspaceId: string,
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<FolderResponseDto>> {
    return this.listAllFolders(workspaceId, userId, pagination);
  }

  /**
   * Update a folder's name, parent, or sort order.
   * @param folder_id - Folder UUID.
   * @param dto - Update payload.
   * @param user_id - Authenticated user's UUID.
   * @returns The updated folder as a response DTO.
   */
  async updateFolder(
    folderId: string,
    dto: UpdateFolderDto,
    userId: string,
  ): Promise<FolderResponseDto> {
    const folder = await this.folderRepository.findById(folderId);
    if (!folder) {
      throw new NotFoundError("Folder not found");
    }

    const membership = await this.workspaceRepository.findMembership(folder.workspace_id, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    /* Build a type-safe update payload — only whitelisted fields */
    const updateFields: Partial<{
      name: string;
      parent_folder_id: string | null;
      sort_order: number | null;
    }> = {};

    if (dto.name !== undefined) {
      updateFields.name = dto.name;
    }
    if (dto.parent_folder_id !== undefined) {
      if (dto.parent_folder_id !== null) {
        /* Prevent circular references and cross-workspace reparenting. */
        if (dto.parent_folder_id === folderId) {
          throw new ForbiddenError("A folder cannot be its own parent");
        }

        const parentFolder = await this.folderRepository.findById(dto.parent_folder_id);
        if (!parentFolder) {
          throw new NotFoundError("Parent folder not found");
        }

        if (parentFolder.workspace_id !== folder.workspace_id) {
          throw new ForbiddenError("Parent folder does not belong to the same workspace");
        }

        const descendantIds = await this.folderRepository.findDescendantIds(folderId);
        if (descendantIds.includes(dto.parent_folder_id)) {
          throw new ForbiddenError("A folder cannot be moved under its own descendant");
        }
      }

      updateFields.parent_folder_id = dto.parent_folder_id;
    }
    if (dto.sort_order !== undefined) {
      updateFields.sort_order = dto.sort_order;
    }

    const updatedFolder = await this.folderRepository.update(folderId, updateFields);
    if (!updatedFolder) {
      throw new NotFoundError("Folder was deleted during update");
    }

    return this.toResponseDto(updatedFolder);
  }

  async update_folder(
    folderId: string,
    dto: UpdateFolderDto,
    userId: string,
  ): Promise<FolderResponseDto> {
    return this.updateFolder(folderId, dto, userId);
  }

  /**
   * Soft-delete a folder.
   * The caller must be an active member of the folder's workspace.
   * @param folder_id - Folder UUID.
   * @param user_id - Authenticated user's UUID.
   */
  async deleteFolder(folderId: string, userId: string): Promise<void> {
    const folder = await this.folderRepository.findById(folderId);
    if (!folder) {
      throw new NotFoundError("Folder not found");
    }

    const membership = await this.workspaceRepository.findMembership(folder.workspace_id, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    await this.folderRepository.withTransaction(
      async ({ folderRepository, documentRepository, documentMemberRepository }) => {
        const folderIds = await folderRepository.findDescendantIds(folderId);
        const documentIds = await documentRepository.findIdsByFolderIds(folderIds);

        if (documentIds.length > 0) {
          await documentMemberRepository.removeByDocumentIds(documentIds);
          await documentRepository.softDeleteMany(documentIds, userId);
        }

        await folderRepository.softDeleteMany(folderIds);
      },
    );
  }

  async delete_folder(folderId: string, userId: string): Promise<void> {
    return this.deleteFolder(folderId, userId);
  }

  /**
   * Map a raw folder row to a FolderResponseDto.
   * @param folder - Database folder row.
   * @returns Formatted response DTO.
   */
  private toResponseDto(folder: {
    id: string;
    workspace_id: string;
    parent_folder_id: string | null;
    name: string;
    sort_order: number | null;
    created_by_user_id: string | null;
    created_at: Date;
    updated_at: Date;
  }): FolderResponseDto {
    return {
      id: folder.id,
      workspace_id: folder.workspace_id,
      parent_folder_id: folder.parent_folder_id,
      name: folder.name,
      sort_order: folder.sort_order,
      created_by_user_id: folder.created_by_user_id,
      created_at: folder.created_at.toISOString(),
      updated_at: folder.updated_at.toISOString(),
    };
  }
}
