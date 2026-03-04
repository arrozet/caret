import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { DocumentTabs } from "../../features/editor/components/DocumentTabs";

interface MainLayoutProps {
  /** Page content rendered below the TopBar. */
  children: ReactNode;
}

/**
 * Main application layout shell.
 *
 * Wraps authenticated pages with the TopBar, a persistent DocumentTabs
 * strip (visible whenever at least one document is open), and provides
 * a scrollable content area below. The top padding accounts for the
 * fixed 56px (h-14) TopBar.
 *
 * See FRONTEND.md §10 (Core Layout Structure).
 */
export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex h-screen w-full flex-col bg-app overflow-hidden">
      <TopBar />
      {/* Offset wrapper — pushes content below the fixed 56px TopBar */}
      <div className="flex flex-1 flex-col pt-14 min-h-0">
        {/* Document tabs strip — persistent across editor and document list */}
        <DocumentTabs />
        <main className="flex flex-1 flex-col overflow-hidden min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}
