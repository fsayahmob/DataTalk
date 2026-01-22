// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");
const boundaries = require("eslint-plugin-boundaries");

module.exports = defineConfig([
  {
    ignores: ["dist/**", "node_modules/**", ".angular/**"],
  },
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
    ],
    plugins: {
      boundaries,
    },
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.app.json", "./tsconfig.spec.json"],
        tsconfigRootDir: __dirname,
      },
    },
    processor: angular.processInlineTemplates,
    settings: {
      "boundaries/elements": [
        { type: "core", pattern: "src/app/core/**/*", capture: ["category"] },
        { type: "shared", pattern: "src/app/shared/**/*", capture: ["category"] },
        { type: "features", pattern: "src/app/features/**/*", capture: ["feature", "category"] },
        { type: "layout", pattern: "src/app/layout/**/*", capture: ["category"] },
        { type: "app", pattern: "src/app/*", capture: ["file"] },
      ],
      "boundaries/ignore": ["**/*.spec.ts", "**/*.test.ts"],
    },
    rules: {
      // ═══════════════════════════════════════════════════════════
      // RÈGLES ANGULAR
      // ═══════════════════════════════════════════════════════════
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
      "@angular-eslint/component-class-suffix": "error",
      "@angular-eslint/directive-class-suffix": "error",
      "@angular-eslint/no-empty-lifecycle-method": "error",
      "@angular-eslint/no-input-rename": "error",
      "@angular-eslint/no-output-on-prefix": "error",
      "@angular-eslint/no-output-rename": "error",
      "@angular-eslint/use-lifecycle-interface": "error",
      "@angular-eslint/use-pipe-transform-interface": "error",
      "@angular-eslint/prefer-standalone": "error",

      // ═══════════════════════════════════════════════════════════
      // RÈGLES TYPESCRIPT STRICTES
      // ═══════════════════════════════════════════════════════════
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": ["error", {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/strict-boolean-expressions": ["error", {
        allowNullableBoolean: true,
        allowNullableString: true,
      }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      // Allow empty decorated classes (Angular components)
      "@typescript-eslint/no-extraneous-class": ["error", {
        allowWithDecorator: true,
      }],

      // ═══════════════════════════════════════════════════════════
      // RÈGLES BOUNDARIES (ARCHITECTURE)
      // ═══════════════════════════════════════════════════════════
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // Core ne peut importer que depuis core et shared
            { from: "core", allow: ["core", "shared"] },
            // Shared ne peut rien importer du projet (seulement external)
            { from: "shared", allow: ["shared"] },
            // Features peuvent importer depuis core, shared et leur propre feature
            { from: "features", allow: ["core", "shared", ["features", { feature: "${from.feature}" }]] },
            // Layout peut importer depuis core et shared
            { from: "layout", allow: ["core", "shared"] },
            // App (root) peut tout importer
            { from: "app", allow: ["core", "shared", "features", "layout", "app"] },
          ],
        },
      ],

      // ═══════════════════════════════════════════════════════════
      // RÈGLES ANTI-PATTERNS
      // ═══════════════════════════════════════════════════════════
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../../*"],
              message: "Import trop profond. Utiliser les alias @core, @shared, @features",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {
      "@angular-eslint/template/no-negated-async": "error",
      "@angular-eslint/template/use-track-by-function": "warn",
      "@angular-eslint/template/no-duplicate-attributes": "error",
    },
  },
]);
