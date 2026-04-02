import type { CollaborationConnectionStatus, CollaborationPresenceUser } from "../utils";

/** Props for the compact collaboration presence bar. */
export interface CollaborationPresenceBarProps {
  connection_status: CollaborationConnectionStatus;
  users: CollaborationPresenceUser[];
  class_name?: string;
}

/**
 * Minimal collaboration status and avatar strip.
 */
export function CollaborationPresenceBar({
  connection_status,
  users,
  class_name,
}: CollaborationPresenceBarProps) {
  const indicator_class =
    connection_status === "connected"
      ? "bg-emerald-500"
      : connection_status === "connecting"
        ? "bg-amber-500"
        : "bg-slate-400";

  return (
    <div className={class_name}>
      <div className="flex items-center gap-3 rounded-md border border-border-subtle px-2 py-1 bg-surface/90">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${indicator_class}`} aria-hidden="true" />
          <span className="text-ui-xs text-text-secondary capitalize">{connection_status}</span>
        </div>

        <div className="flex items-center -space-x-1.5">
          {users.slice(0, 5).map((user) => (
            <span
              key={user.id}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-surface text-[10px] font-semibold text-white"
              style={{ backgroundColor: user.color }}
              title={user.name}
              aria-label={user.name}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          ))}

          {users.length > 5 && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-surface bg-text-secondary px-1 text-[10px] font-semibold text-surface">
              +{users.length - 5}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
