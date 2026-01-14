import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Next.js base config
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // TypeScript strict rules
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
  },

  // Custom strict rules (44+ rules)
  {
    rules: {
      // ============================================================
      // TYPESCRIPT STRICT - Zero tolerance for unsafe types
      // ============================================================
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/explicit-function-return-type": ["error", {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
      }],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-inferrable-types": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/strict-boolean-expressions": ["error", {
        allowString: false,
        allowNumber: false,
        allowNullableObject: true,
      }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-non-null-assertion": "error",

      // ============================================================
      // CODE QUALITY - Maintainability limits
      // ============================================================
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 3],
      "max-params": ["error", 5],
      "complexity": ["error", 15],

      // ============================================================
      // BEST PRACTICES
      // ============================================================
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-alert": "error",
      "no-var": "error",
      "prefer-const": "error",
      "prefer-template": "error",
      "prefer-spread": "error",
      "prefer-rest-params": "error",
      "no-param-reassign": "error",
      "no-nested-ternary": "error",
      "no-unneeded-ternary": "error",
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-return-await": "error",
      "require-atomic-updates": "error",
      "no-promise-executor-return": "error",

      // ============================================================
      // IMPORTS & EXPORTS
      // ============================================================
      "no-duplicate-imports": "error",

      // ============================================================
      // NAMING CONVENTIONS
      // ============================================================
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "variable", format: ["camelCase", "UPPER_CASE", "PascalCase"] },
        { selector: "function", format: ["camelCase", "PascalCase"] },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["UPPER_CASE", "PascalCase"] },
      ],

      // ============================================================
      // UNUSED CODE
      // ============================================================
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-unreachable": "error",
      "no-unused-expressions": "error",
    },
  },

  // Ignore patterns
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "*.config.js",
      "*.config.mjs",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
