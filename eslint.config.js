// ESLint for the UI (src). The point is mostly the react-hooks plugin: without it, nobody checks the dependencies of the
// hooks. TypeScript already reports unused variables and parameters (`noUnusedLocals`), so those rules are off here.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "target", "node_modules", "src-tauri", "tools"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Already checked by `tsc` (noUnusedLocals / noUnusedParameters).
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
