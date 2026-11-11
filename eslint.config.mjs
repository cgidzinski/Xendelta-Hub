import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import query from "@tanstack/eslint-plugin-query";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

// Strict where it protects correctness (hooks, query keys, dead code); relaxed on `any` and
// CommonJS `require()`, which the server conventions work (#181 phase 3) removes properly.
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "backups/**", "public/**", "src/server/public/**", "coverage/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: { "unused-imports": unusedImports },
    rules: {
      // tsc (noUnusedLocals/noUnusedParameters) is the authority on unused code; this plugin's
      // only job is that --fix can delete unused imports.
      "unused-imports/no-unused-imports": "error",
      "@typescript-eslint/no-unused-vars": "off",

      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-namespace": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
      "prefer-const": "warn",
    },
  },

  // Server, scripts, migrations: Node.
  {
    files: ["src/server/**/*.{ts,js}", "scripts/**/*.ts", "migrations/**/*.ts", "migrate.ts", "src/shared/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },

  // Client: browser + React.
  {
    files: ["src/client/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  ...query.configs["flat/recommended"].map((c) => ({ ...c, files: ["src/client/**/*.{ts,tsx}"] })),

  // Service worker runs in a worker scope.
  {
    files: ["src/client/pwa/sw.ts"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },

  // Config files at the root are Node scripts.
  {
    files: ["*.config.{js,mjs,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
