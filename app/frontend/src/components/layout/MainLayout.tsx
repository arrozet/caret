import type { ReactNode } from "react";
import { TopBar } from "./TopBar";

interface MainLayoutProps {
  /** Page content rendered below the TopBar. */
  children: ReactNode;
}

/**
 * Main application layout shell.
 *
 * Wraps authenticated pages with the TopBar and provides
 * a scrollable content area below. The top padding accounts
 * for the fixed 56px (h-14) TopBar.
 *
 * See FRONTEND.md §10 (Core Layout Structure).
 */
export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-app">
      <TopBar />
      <main className="flex flex-1 flex-col pt-14">
        {children}
      </main>
    </div>
  );
}
