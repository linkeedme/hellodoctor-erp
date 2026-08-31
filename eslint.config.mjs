import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";
import semBancoNoCliente from "./eslint-rules/sem-banco-no-cliente.mjs";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...compat.extends("next/core-web-vitals"),
  ...tseslint.configs.strict,
  {
    plugins: { local: { rules: { "sem-banco-no-cliente": semBancoNoCliente } } },
    rules: {
      "local/sem-banco-no-cliente": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  { ignores: [".next/**", "node_modules/**"] },
];
