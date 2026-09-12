import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const eslintConfig = [
  // `.claude/` and `.worktrees/` hold git worktrees, which live inside the
  // working directory — without these, `pnpm lint` walks another branch's
  // checkout and reports thousands of problems from code not in this tree.
  // Same reason `.prettierignore` lists them.
  { ignores: [".claude/", ".worktrees/", ".next/", "playwright-report/"] },
  ...coreWebVitals,
  ...typescript,
  {
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      // Downgrade to warn — codebase uses `any` extensively with Prisma types
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      // React 19 compiler rules — pre-existing patterns, fix incrementally
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default eslintConfig;
