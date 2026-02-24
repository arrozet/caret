import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { use_auth_store } from "./stores/auth_store";
import { AuthPage } from "./features/auth";
import { MainLayout } from "./components/layout/MainLayout";
import { AuthGuard } from "./components/layout/AuthGuard";
import "./App.css";

/**
 * Placeholder home page shown after successful authentication.
 * Will be replaced with the Tiptap editor in Phase 2.
 */
function HomePage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h2 className="font-document text-display text-text-primary">
          Welcome to Caret
        </h2>
        <p className="mt-2 text-ui-base text-text-secondary">
          Your AI-first document editor. The editor is coming in Phase 2.
        </p>
      </div>
    </div>
  );
}

/**
 * Root application component.
 *
 * Initializes the Supabase auth session on mount, then sets up
 * client-side routing with an auth guard for protected routes.
 */
function App() {
  const initialize = use_auth_store((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<AuthPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <AuthGuard>
              <MainLayout>
                <HomePage />
              </MainLayout>
            </AuthGuard>
          }
        />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
