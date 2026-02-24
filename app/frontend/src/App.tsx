import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { use_auth_store } from "./stores/auth_store";
import { AuthPage } from "./features/auth";
import { MainLayout } from "./components/layout/MainLayout";
import { AuthGuard } from "./components/layout/AuthGuard";
import { DocumentList, EditorPage } from "./features/editor/components";
import "./App.css";

/**
 * Root application component.
 *
 * Initializes the Supabase auth session on mount, then sets up
 * client-side routing with an auth guard for protected routes.
 * The home route shows the document list; individual documents
 * are opened in the editor page.
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

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
