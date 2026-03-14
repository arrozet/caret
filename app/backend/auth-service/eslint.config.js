/**
 * ESLint flat config for auth-service.
 *
 * Self-contained so that Node.js resolves all imports from this service's
 * own node_modules. Stack: TypeScript + Node.js (ESM, no browser globals).
 * Prettier integration: eslint-config-prettier is last, disabling all
 * formatting rules so ESLint and Prettier never conflict.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier_config from "eslint-config-prettier";

export default [
  // Ignore compiled output and dependencies.
  { ignores: ["dist/", "node_modules/"] },

  // Base JS recommended rules.
  js.configs.recommended,

  // TypeScript recommended rules (type-unaware, so no tsconfig required).
  ...tseslint.configs.recommended,

  // Project-specific overrides.
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      // Unused variables are errors; leading-underscore names are allowed
      // as intentional no-ops (e.g. _req in Express handlers).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Explicit `any` is a warning, not an error — backend code sometimes
      // needs it at Express/Vitest boundaries.
      "@typescript-eslint/no-explicit-any": "warn",
      // Node.js services use console via the logger wrapper; raw console is
      // allowed (the logger itself calls process.stdout).
      "no-console": "off",
    },
  },

  // Must be last — disables every ESLint formatting rule that Prettier owns.
  prettier_config,
];
