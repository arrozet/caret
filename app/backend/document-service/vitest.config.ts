import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the Document Service.
 * Uses the default Node environment for Express + Drizzle-based tests.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/app.ts"],
    },
  },
});
