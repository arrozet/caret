import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // Must be last — disables all ESLint rules that would conflict with Prettier.
      prettierConfig,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // The project uses snake_case naming for all identifiers (see AGENTS.md).
      // React's hooks lint rule only recognises camelCase "use*" functions, so
      // we relax it to "warn" here to allow snake_case custom hooks (use_foo).
      "react-hooks/rules-of-hooks": "warn",
    },
  },
]);
