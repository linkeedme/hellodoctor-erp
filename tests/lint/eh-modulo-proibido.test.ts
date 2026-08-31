import { describe, it, expect } from "vitest";
import { ehModuloProibido } from "../../eslint-rules/sem-banco-no-cliente.mjs";

describe("ehModuloProibido (matriz de casos)", () => {
  const proibidos = [
    "@/db/client",
    "@/db/onboarding",
    "@/db/sub/pasta/arquivo",
    "../db/client",
    "../../../db/onboarding",
    "../db/sub/x",
    "kysely",
    "pg",
  ];

  const permitidos = [
    "algum-pacote/db/utils",
    "@/database/client",
    "@/lib/db-helpers",
    "react",
  ];

  it.each(proibidos)("acusa '%s'", (fonte) => {
    expect(ehModuloProibido(fonte)).toBe(true);
  });

  it.each(permitidos)("não acusa '%s'", (fonte) => {
    expect(ehModuloProibido(fonte)).toBe(false);
  });
});
