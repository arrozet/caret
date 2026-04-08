import { useMemo } from "react";
import type { CollaborationPresenceUser } from "../utils";

/**
 * Derive lightweight presence metrics from awareness users.
 */
export function useCollaborationPresence(users: CollaborationPresenceUser[]) {
  return useMemo(() => {
    return {
      users,
      users_count: users.length,
      has_collaborators: users.length > 1,
      is_solo: users.length <= 1,
    };
  }, [users]);
}
