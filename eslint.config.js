import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/next-env.d.ts", "**/playwright-report/**", "**/test-results/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["packages/engine/src/**"],
    rules: { "no-restricted-properties": ["error", { object: "Math", property: "random" }, { object: "Date", property: "now" }] },
  },
);
