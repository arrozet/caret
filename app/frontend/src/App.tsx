import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { AuthPage } from "./features/auth";
import { LandingPage } from "./features/landing";
import { SettingsPage } from "./features/settings";
import { CollabHarnessPage } from "./features/collaboration";
import { MainLayout } from "./components/layout/MainLayout";
import { AuthGuard } from "./components/layout/AuthGuard";
import { DocumentList, EditorPage } from "./features/editor/components";
import "./App.css";

/**
 * Root application component.
 *
 * Initializes the Supabase auth session on mount, then sets up
 * client-side routing. Unauthenticated users see the landing page
 * at "/"; authenticated users are redirected to "/documents".
 * Protected routes are wrapped with AuthGuard.
 */
function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isDevMode = import.meta.env.DEV;

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        {isDevMode ? <Route path="/debug/collab-harness" element={<CollabHarnessPage />} /> : null}

        {/* Protected routes */}
        <Route
          path="/documents"
          element={
            <AuthGuard>
              <MainLayout>
                <DocumentList />
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/documents/:id"
          element={
            <AuthGuard>
              <MainLayout>
                <EditorPage />
              </MainLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGuard>
              <MainLayout>
                <SettingsPage />
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
