import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [
  { ignores: [".next/**", "node_modules/**", "supabase/**", "scripts/**", "tests/**", "e2e/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: {
    "react/no-unescaped-entities": "off",                 // le français est plein d'apostrophes : pas de faux positifs
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@next/next/no-img-element": "warn",
  } },
];
