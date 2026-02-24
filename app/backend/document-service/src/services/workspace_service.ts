import type { WorkspaceRepository } from "../repositories/workspace_repository.js";
import type { CreateWorkspaceDto } from "../dtos/create_workspace_dto.js";
import type { WorkspaceResponseDto } from "../dtos/workspace_response_dto.js";
import type { PaginationParams, PaginatedResponse } from "../lib/validation.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";

/**
 * Business logic for workspace lifecycle: create, read, list.
 * Automatically adds the creator as an "owner" member.
 *
 * Rule: no HTTP concepts (req, res, status codes) inside Services.
 * Rule: no direct ORM/SQL — delegate all DB access to Repositories.
 */
export class WorkspaceService {
  /** Workspace repository instance. */
  private workspace_repo: WorkspaceRepository;

  constructor(workspace_repo: WorkspaceRepository) {
    this.workspace_repo = workspace_repo;
  }

  /**
   * Create a new workspace and add the creator as owner.
   * If no slug is provided, one is auto-generated from the name.
   * @param dto - Creation payload from the controller.
   * @param user_id - Authenticated user's UUID.
   * @returns The created workspace as a response DTO.
   */
  async create_workspace(
    dto: CreateWorkspaceDto,
    user_id: string,
  ): Promise<WorkspaceResponseDto> {
    const slug =
      dto.slug ?? dto.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const workspace = await this.workspace_repo.create({
      name: dto.name,
      slug,
      created_by_user_id: user_id,
    });

    /* Add creator as owner */
    await this.workspace_repo.add_member({
      workspace_id: workspace.id,
      user_id,
      role: "owner",
    });

    return this.to_response_dto(workspace, "owner");
  }

  /**
   * Get a single workspace by ID.
   * The caller must be an active member.
   * @param workspace_id - Workspace UUID.
   * @param user_id - Authenticated user's UUID.
   * @returns The workspace as a response DTO.
   */
  async get_workspace(
    workspace_id: string,
    user_id: string,
  ): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspace_repo.find_by_id(workspace_id);
    if (!workspace) {
      throw new NotFoundError("Workspace not found");
    }

    const membership = await this.workspace_repo.find_membership(
      workspace_id,
      user_id,
    );
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    return this.to_response_dto(workspace, membership.role);
  }

  /**
   * List all workspaces the authenticated user belongs to, with pagination.
   * @param user_id - Authenticated user's UUID.
   * @param pagination - Limit and offset for pagination.
   * @returns Paginated array of workspace response DTOs.
   */
  async list_workspaces(
    user_id: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<WorkspaceResponseDto>> {
    const { data: rows, total } = await this.workspace_repo.list_by_user(
      user_id,
      pagination,
    );
    return {
      data: rows.map((row) =>
        this.to_response_dto(
          {
            id: row.id,
            slug: row.slug,
            name: row.name,
            created_by_user_id: row.created_by_user_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
          },
          row.role,
        ),
      ),
      pagination: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    };
  }

  /**
   * Map a raw workspace row to a WorkspaceResponseDto.
   * @param workspace - Database workspace row.
   * @param role - Caller's role within the workspace (optional).
   * @returns Formatted response DTO.
   */
  private to_response_dto(
    workspace: {
      id: string;
      slug: string | null;
      name: string;
      created_by_user_id: string | null;
      created_at: Date;
      updated_at: Date;
    },
    role?: string,
  ): WorkspaceResponseDto {
    return {
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      created_by_user_id: workspace.created_by_user_id,
      role,
      created_at: workspace.created_at.toISOString(),
      updated_at: workspace.updated_at.toISOString(),
    };
  }
}
