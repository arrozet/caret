import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./lib/i18n";
import "./index.css";
import App from "./App.tsx";

/**
 * TanStack Query client — shared across the entire app.
 * Default options keep stale time reasonable for document editing UX.
 */
const query_client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, /* 30 seconds */
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={query_client}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
