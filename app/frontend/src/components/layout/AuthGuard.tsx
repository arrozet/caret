import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  /** Content to render when the user is authenticated. */
  children: ReactNode;
}

/**
 * Route guard that redirects unauthenticated users to /login.
 *
 * While the auth state is still loading (initial session check),
 * renders a centered loading spinner to avoid flash of login page.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const status = useAuthStore((state) => state.status);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <Loader2 className="h-8 w-8 animate-spin text-accent-main" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
