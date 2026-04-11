import type { WorkspaceRepository } from "../repositories/workspace_repository.js";
import type { CreateWorkspaceDto } from "../dtos/create_workspace_dto.js";
import type { WorkspaceResponseDto } from "../dtos/workspace_response_dto.js";
import type { PaginationParams, PaginatedResponse } from "../lib/validation.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../lib/errors.js";

/**
 * Business logic for workspace lifecycle: create, read, list.
 * Automatically adds the creator as an "owner" member.
 *
 * Rule: no HTTP concepts (req, res, status codes) inside Services.
 * Rule: no direct ORM/SQL — delegate all DB access to Repositories.
 */
export class WorkspaceService {
  /** Workspace repository instance. */
  private workspaceRepository: WorkspaceRepository;

  constructor(workspaceRepository: WorkspaceRepository) {
    this.workspaceRepository = workspaceRepository;
  }

  /**
   * Create a new workspace and add the creator as owner.
   * If no slug is provided, one is auto-generated from the name.
   * When the slug collides with an existing active workspace,
   * a numeric suffix is appended (e.g. "my-project-2", "my-project-3").
   * @param dto - Creation payload from the controller.
   * @param user_id - Authenticated user's UUID.
   * @returns The created workspace as a response DTO.
   */
  async createWorkspace(dto: CreateWorkspaceDto, userId: string): Promise<WorkspaceResponseDto> {
    const base_slug = dto.slug ?? dto.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const slug = await this.resolveUniqueSlug(base_slug);

    let workspace;
    try {
      workspace = await this.workspaceRepository.create({
        name: dto.name,
        slug,
        created_by_user_id: userId,
      });
    } catch (err: unknown) {
      /* Safety net: race condition where slug was taken between check and insert */
      if (isUniqueViolation(err)) {
        throw new ConflictError(`Workspace slug "${slug}" is already taken`);
      }
      throw err;
    }

    /* Add creator as owner */
    await this.workspaceRepository.addMember({
      workspace_id: workspace.id,
      user_id: userId,
      role: "owner",
    });

    return this.toResponseDto(workspace, "owner");
  }

  async create_workspace(dto: CreateWorkspaceDto, userId: string): Promise<WorkspaceResponseDto> {
    return this.createWorkspace(dto, userId);
  }

  /**
   * Find a slug that does not collide with any active workspace.
   * Tries the base slug first, then appends -2, -3, … up to a limit.
   * @param base_slug - The desired slug before deduplication.
   * @returns A slug guaranteed to not exist among active workspaces.
   */
  private async resolveUniqueSlug(baseSlug: string): Promise<string> {
    const maxAttempts = 100;
    let candidate = baseSlug;

    for (let i = 1; i <= maxAttempts; i++) {
      const existing = await this.workspaceRepository.findBySlug(candidate);
      if (!existing) return candidate;
      candidate = `${baseSlug}-${i + 1}`;
    }

    throw new ConflictError(
      `Could not generate a unique slug for "${baseSlug}" after ${maxAttempts} attempts`,
    );
  }

  /**
   * Get a single workspace by ID.
   * The caller must be an active member.
   * @param workspace_id - Workspace UUID.
   * @param user_id - Authenticated user's UUID.
   * @returns The workspace as a response DTO.
   */
  async getWorkspace(workspaceId: string, userId: string): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError("Workspace not found");
    }

    const membership = await this.workspaceRepository.findMembership(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    return this.toResponseDto(workspace, membership.role);
  }

  async get_workspace(workspaceId: string, userId: string): Promise<WorkspaceResponseDto> {
    return this.getWorkspace(workspaceId, userId);
  }

  /**
   * List all workspaces the authenticated user belongs to, with pagination.
   * @param user_id - Authenticated user's UUID.
   * @param pagination - Limit and offset for pagination.
   * @returns Paginated array of workspace response DTOs.
   */
  async listWorkspaces(
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<WorkspaceResponseDto>> {
    const { data: rows, total } = await this.workspaceRepository.listByUser(userId, pagination);
    return {
      data: rows.map((row) =>
        this.toResponseDto(
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

  async list_workspaces(
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<WorkspaceResponseDto>> {
    return this.listWorkspaces(userId, pagination);
  }

  /**
   * Map a raw workspace row to a WorkspaceResponseDto.
   * @param workspace - Database workspace row.
   * @param role - Caller's role within the workspace (optional).
   * @returns Formatted response DTO.
   */
  private toResponseDto(
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
