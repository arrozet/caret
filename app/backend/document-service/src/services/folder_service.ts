import type { FolderRepository } from "../repositories/folder_repository.js";
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
  private folder_repo: FolderRepository;
  /** Workspace membership repository (for authorization checks). */
  private workspace_repo: WorkspaceRepository;

  constructor(
    folder_repo: FolderRepository,
    workspace_repo: WorkspaceRepository,
  ) {
    this.folder_repo = folder_repo;
    this.workspace_repo = workspace_repo;
  }

  /**
   * Create a new folder within a workspace.
   * The caller must be an active member of the workspace.
   * @param dto - Creation payload from the controller.
   * @param user_id - Authenticated user's UUID.
   * @returns The created folder as a response DTO.
   */
  async create_folder(
    dto: CreateFolderDto,
    user_id: string,
  ): Promise<FolderResponseDto> {
    /* Authorization: caller must belong to the workspace */
    const membership = await this.workspace_repo.find_membership(
      dto.workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    /* If a parent_folder_id is provided, verify it exists and belongs to the same workspace */
    if (dto.parent_folder_id) {
      const parent = await this.folder_repo.find_by_id(dto.parent_folder_id);
      if (!parent) {
        throw new NotFoundError("Parent folder not found");
      }
      if (parent.workspace_id !== dto.workspace_id) {
        throw new ForbiddenError(
          "Parent folder does not belong to the specified workspace",
        );
      }
    }

    const folder = await this.folder_repo.create({
      workspace_id: dto.workspace_id,
      parent_folder_id: dto.parent_folder_id ?? null,
      name: dto.name,
      sort_order: dto.sort_order ?? null,
      created_by_user_id: user_id,
    });

    return this.to_response_dto(folder);
  }

  /**
   * Get a single folder by ID.
   * The caller must be an active member of the folder's workspace.
   * @param folder_id - Folder UUID.
   * @param user_id - Authenticated user's UUID.
   * @returns The folder as a response DTO.
   */
  async get_folder(
    folder_id: string,
    user_id: string,
  ): Promise<FolderResponseDto> {
    const folder = await this.folder_repo.find_by_id(folder_id);
    if (!folder) {
      throw new NotFoundError("Folder not found");
    }

    /* Authorization */
    const membership = await this.workspace_repo.find_membership(
      folder.workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    return this.to_response_dto(folder);
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
  async list_folders(
    workspace_id: string,
    user_id: string,
    parent_folder_id: string | null = null,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<FolderResponseDto>> {
    const membership = await this.workspace_repo.find_membership(
      workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const { data, total } = await this.folder_repo.list_by_workspace(
      workspace_id,
      parent_folder_id,
      pagination,
    );
    return {
      data: data.map((folder) => this.to_response_dto(folder)),
      pagination: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    };
  }

  /**
   * List all folders in a workspace (flat list for tree building), with pagination.
   * The caller must be an active member of the workspace.
   * @param workspace_id - Workspace UUID scope.
   * @param user_id - Authenticated user's UUID.
   * @param pagination - Limit and offset for pagination.
   * @returns Paginated array of all folder response DTOs in the workspace.
   */
  async list_all_folders(
    workspace_id: string,
    user_id: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<FolderResponseDto>> {
    const membership = await this.workspace_repo.find_membership(
      workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    const { data, total } = await this.folder_repo.list_all_by_workspace(
      workspace_id,
      pagination,
    );
    return {
      data: data.map((folder) => this.to_response_dto(folder)),
      pagination: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    };
  }

  /**
   * Update a folder's name, parent, or sort order.
   * @param folder_id - Folder UUID.
   * @param dto - Update payload.
   * @param user_id - Authenticated user's UUID.
   * @returns The updated folder as a response DTO.
   */
  async update_folder(
    folder_id: string,
    dto: UpdateFolderDto,
    user_id: string,
  ): Promise<FolderResponseDto> {
    const folder = await this.folder_repo.find_by_id(folder_id);
    if (!folder) {
      throw new NotFoundError("Folder not found");
    }

    const membership = await this.workspace_repo.find_membership(
      folder.workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    /* Build a type-safe update payload — only whitelisted fields */
    const update_fields: Partial<{
      name: string;
      parent_folder_id: string | null;
      sort_order: number | null;
    }> = {};

    if (dto.name !== undefined) {
      update_fields.name = dto.name;
    }
    if (dto.parent_folder_id !== undefined) {
      /* Prevent circular references: a folder cannot be its own parent */
      if (dto.parent_folder_id === folder_id) {
        throw new ForbiddenError("A folder cannot be its own parent");
      }
      update_fields.parent_folder_id = dto.parent_folder_id;
    }
    if (dto.sort_order !== undefined) {
      update_fields.sort_order = dto.sort_order;
    }

    const updated_folder = await this.folder_repo.update(
      folder_id,
      update_fields,
    );
    if (!updated_folder) {
      throw new NotFoundError("Folder was deleted during update");
    }

    return this.to_response_dto(updated_folder);
  }

  /**
   * Soft-delete a folder.
   * The caller must be an active member of the folder's workspace.
   * @param folder_id - Folder UUID.
   * @param user_id - Authenticated user's UUID.
   */
  async delete_folder(folder_id: string, user_id: string): Promise<void> {
    const folder = await this.folder_repo.find_by_id(folder_id);
    if (!folder) {
      throw new NotFoundError("Folder not found");
    }

    const membership = await this.workspace_repo.find_membership(
      folder.workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    await this.folder_repo.soft_delete(folder_id);
  }

  /**
   * Map a raw folder row to a FolderResponseDto.
   * @param folder - Database folder row.
   * @returns Formatted response DTO.
   */
  private to_response_dto(folder: {
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
