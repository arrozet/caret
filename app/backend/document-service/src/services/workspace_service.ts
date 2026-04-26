import type { WorkspaceRepository } from "../repositories/workspace_repository.js";
import type { CreateWorkspaceDto } from "../dtos/create_workspace_dto.js";
import type { UpdateWorkspaceDto } from "../dtos/update_workspace_dto.js";
import type { WorkspaceResponseDto } from "../dtos/workspace_response_dto.js";
import type { InviteWorkspaceMemberResponseDto } from "../dtos/invite_workspace_member_response_dto.js";
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
   */
  async createWorkspace(dto: CreateWorkspaceDto, userId: string): Promise<WorkspaceResponseDto> {
    const normalizedName = this.normalizeWorkspaceName(dto.name);
    const kind = dto.kind ?? "shared";

    return this.workspaceRepository.withAdvisoryLock(
      [this.workspaceNameLockKey(userId, normalizedName)],
      async (repository) => {
        if (kind === "personal") {
          const existingPersonal = await repository.findPersonalByUser(userId);
          if (existingPersonal) {
            return this.toResponseDto(existingPersonal, "owner");
          }
        }

        await this.assertWorkspaceNameAvailableToUser(repository, userId, normalizedName);

        const baseSlug = dto.slug ?? normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const slug = await this.resolveUniqueSlug(repository, baseSlug);

        let workspace;
        try {
          workspace = await repository.create({
            name: normalizedName,
            slug,
            created_by_user_id: userId,
            settings: { kind },
          });
        } catch (err: unknown) {
          if (isUniqueViolation(err)) {
            throw new ConflictError(`Workspace slug "${slug}" is already taken`);
          }
          throw err;
        }

        await repository.addMember({
          workspace_id: workspace.id,
          user_id: userId,
          role: "owner",
        });

        return this.toResponseDto(workspace, "owner");
      },
    );
  }

  async create_workspace(dto: CreateWorkspaceDto, userId: string): Promise<WorkspaceResponseDto> {
    return this.createWorkspace(dto, userId);
  }

  /**
   * Find a slug that does not collide with any active workspace.
   */
  private async resolveUniqueSlug(
    repository: WorkspaceRepository,
    baseSlug: string,
  ): Promise<string> {
    const maxAttempts = 100;
    let candidate = baseSlug;

    for (let i = 1; i <= maxAttempts; i++) {
      const existing = await repository.findBySlug(candidate);
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
            settings: row.settings,
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
   * Rename a workspace.
   * Only owners can rename workspaces.
   */
  async updateWorkspace(
    workspaceId: string,
    dto: UpdateWorkspaceDto,
    userId: string,
  ): Promise<WorkspaceResponseDto> {
    return this.workspaceRepository.withAdvisoryLock(
      [this.workspaceMutationLockKey(workspaceId)],
      async (repository) => {
        const workspace = await repository.findById(workspaceId);
        if (!workspace) {
          throw new NotFoundError("Workspace not found");
        }

        const membership = await repository.findMembership(workspaceId, userId);
        if (!membership) {
          throw new ForbiddenError("You are not a member of this workspace");
        }
        if (membership.role !== "owner") {
          throw new ForbiddenError("Only workspace owners can rename this workspace");
        }

        const nextName = dto.name ? this.normalizeWorkspaceName(dto.name) : workspace.name;
        const currentName = this.normalizeWorkspaceName(workspace.name);

        if (nextName !== currentName) {
          const activeMembers = await repository.listActiveMembersByWorkspace(workspaceId);
          await repository.acquireAdvisoryLocks(
            activeMembers.map((member) => this.workspaceNameLockKey(member.user_id, nextName)),
          );
          await this.assertWorkspaceNameAvailableToUsers(
            repository,
            activeMembers.map((member) => member.user_id),
            nextName,
            workspaceId,
          );
        }

        const updatedWorkspace = await repository.update(workspaceId, { name: nextName });
        if (!updatedWorkspace) {
          throw new NotFoundError("Workspace not found");
        }

        return this.toResponseDto(updatedWorkspace, membership.role);
      },
    );
  }

  async update_workspace(
    workspaceId: string,
    dto: UpdateWorkspaceDto,
    userId: string,
  ): Promise<WorkspaceResponseDto> {
    return this.updateWorkspace(workspaceId, dto, userId);
  }

  /**
   * Soft-delete a workspace and revoke all active memberships.
   * Only owners can delete workspaces.
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    await this.workspaceRepository.withAdvisoryLockContext(
      [this.workspaceMutationLockKey(workspaceId)],
      async ({
        workspaceRepository,
        folderRepository,
        documentRepository,
        documentMemberRepository,
      }) => {
        const workspace = await workspaceRepository.findById(workspaceId);
        if (!workspace) {
          throw new NotFoundError("Workspace not found");
        }

        const membership = await workspaceRepository.findMembership(workspaceId, userId);
        if (!membership) {
          throw new ForbiddenError("You are not a member of this workspace");
        }
        if (membership.role !== "owner") {
          throw new ForbiddenError("Only workspace owners can delete this workspace");
        }

        const folderIds = await folderRepository.findIdsByWorkspaceId(workspaceId);
        const documentIds = await documentRepository.findIdsByWorkspaceId(workspaceId);

        if (documentIds.length > 0) {
          await documentMemberRepository.removeByDocumentIds(documentIds);
          await documentRepository.softDeleteMany(documentIds, userId);
        }

        if (folderIds.length > 0) {
          await folderRepository.softDeleteMany(folderIds);
        }

        await workspaceRepository.softDeleteWorkspace(workspaceId);
        await workspaceRepository.revokeMembersByWorkspace(workspaceId, userId);
      },
    );
  }

  async delete_workspace(workspaceId: string, userId: string): Promise<void> {
    return this.deleteWorkspace(workspaceId, userId);
  }

  /**
   * Invite an existing user (resolved by email) to a workspace.
   * Personal workspaces cannot be shared.
   */
  async inviteWorkspaceCollaborator(
    workspaceId: string,
    invitedEmail: string,
    inviterUserId: string,
  ): Promise<InviteWorkspaceMemberResponseDto> {
    return this.workspaceRepository.withAdvisoryLock(
      [this.workspaceMutationLockKey(workspaceId)],
      async (repository) => {
        const workspace = await repository.findById(workspaceId);
        if (!workspace) {
          throw new NotFoundError("Workspace not found");
        }

        if (this.getWorkspaceKind(workspace.settings) === "personal") {
          throw new ForbiddenError("Personal workspaces cannot be shared");
        }

        const inviterMembership = await repository.findMembership(workspaceId, inviterUserId);
        if (!inviterMembership) {
          throw new ForbiddenError("You are not a member of this workspace");
        }

        const invitedUserId = await repository.findAuthUserIdByEmail(invitedEmail);
        if (!invitedUserId) {
          throw new NotFoundError("User with this email does not exist in Caret");
        }

        const existingActive = await repository.findMembership(workspaceId, invitedUserId);
        if (existingActive) {
          return {
            workspace_id: workspaceId,
            user_id: invitedUserId,
            email: invitedEmail,
            role: "member",
          };
        }

        const normalizedName = this.normalizeWorkspaceName(workspace.name);
        await repository.acquireAdvisoryLocks([
          this.workspaceNameLockKey(invitedUserId, normalizedName),
        ]);
        await this.assertWorkspaceNameAvailableToUser(repository, invitedUserId, normalizedName);

        const existingAny = await repository.findMembershipAny(workspaceId, invitedUserId);
        if (existingAny) {
          await repository.reactivateMember(workspaceId, invitedUserId, inviterUserId);
        } else {
          await repository.addMember({
            workspace_id: workspaceId,
            user_id: invitedUserId,
            role: "member",
            invited_by_user_id: inviterUserId,
          });
        }

        return {
          workspace_id: workspaceId,
          user_id: invitedUserId,
          email: invitedEmail,
          role: "member",
        };
      },
    );
  }

  async invite_workspace_collaborator(
    workspaceId: string,
    invitedEmail: string,
    inviterUserId: string,
  ): Promise<InviteWorkspaceMemberResponseDto> {
    return this.inviteWorkspaceCollaborator(workspaceId, invitedEmail, inviterUserId);
  }

  /**
   * Map a raw workspace row to a WorkspaceResponseDto.
   */
  private toResponseDto(
    workspace: {
      id: string;
      slug: string | null;
      name: string;
      created_by_user_id: string | null;
      settings?: unknown;
      created_at: Date;
      updated_at: Date;
    },
    role?: string,
  ): WorkspaceResponseDto {
    return {
      id: workspace.id,
      kind: this.getWorkspaceKind(workspace.settings),
      slug: workspace.slug,
      name: workspace.name,
      created_by_user_id: workspace.created_by_user_id,
      role,
      created_at: workspace.created_at.toISOString(),
      updated_at: workspace.updated_at.toISOString(),
    };
  }

  /**
   * Resolve a workspace kind from its JSON settings blob.
   */
  private getWorkspaceKind(settings: unknown): "personal" | "shared" {
    if (typeof settings === "object" && settings !== null && "kind" in settings) {
      const kind = (settings as { kind?: unknown }).kind;
      if (kind === "personal") return "personal";
    }

    return "shared";
  }

  /**
   * Apply the workspace-name normalization rule used across writes and checks.
   */
  private normalizeWorkspaceName(name: string): string {
    return name.trim();
  }

  /**
   * Build a stable advisory-lock key for one visible user/name pair.
   */
  private workspaceNameLockKey(userId: string, workspaceName: string): string {
    return `workspace-name:${userId}:${workspaceName}`;
  }

  /**
   * Build a stable advisory-lock key for workspace-scoped mutations.
   */
  private workspaceMutationLockKey(workspaceId: string): string {
    return `workspace:${workspaceId}`;
  }

  /**
   * Ensure a user does not already see another active workspace with the same name.
   */
  private async assertWorkspaceNameAvailableToUser(
    repository: WorkspaceRepository,
    userId: string,
    workspaceName: string,
    excludeWorkspaceId?: string,
  ): Promise<void> {
    const duplicates = await repository.findVisibleByUserAndName(
      userId,
      workspaceName,
      excludeWorkspaceId,
    );

    if (duplicates.length > 0) {
      throw new ConflictError(`Workspace name "${workspaceName}" already exists`);
    }
  }

  /**
   * Ensure none of the visible users would see a duplicate active workspace name.
   */
  private async assertWorkspaceNameAvailableToUsers(
    repository: WorkspaceRepository,
    userIds: string[],
    workspaceName: string,
    excludeWorkspaceId?: string,
  ): Promise<void> {
    for (const userId of [...new Set(userIds)]) {
      await this.assertWorkspaceNameAvailableToUser(
        repository,
        userId,
        workspaceName,
        excludeWorkspaceId,
      );
    }
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
