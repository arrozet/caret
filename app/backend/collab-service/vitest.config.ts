import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the Collaboration Service.
 * Uses the default Node environment for WebSocket-based tests.
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
