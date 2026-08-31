import { describe, it, expect } from "vitest";
import path from "node:path";
import { ehArquivoDeInfra } from "../../eslint-rules/sem-com-clinica-fora-de-infra.mjs";

function absoluto(relativo: string): string {
  return path.join(process.cwd(), relativo);
}

describe("ehArquivoDeInfra (matriz de casos)", () => {
  const infra = [
    "db/client.ts",
    "db/com-sessao.ts",
    "db/seed/papeis-permissoes.ts",
    "scripts/db-migrate.ts",
    "tests/rls-smoke/com-clinica.test.ts",
    "tests/unit/matriz-permissoes.test.ts",
  ];

  const foraDeInfra = [
    "modules/adm/actions.ts",
    "app/(app)/adm/page.tsx",
    "lib/autorizacao/verificar.ts",
    "tests/lint/fixtures/server-action-usa-com-clinica.ts",
  ];

  it.each(infra)("considera infra: '%s'", (relativo) => {
    expect(ehArquivoDeInfra(absoluto(relativo))).toBe(true);
  });

  it.each(foraDeInfra)("NÃO considera infra: '%s'", (relativo) => {
    expect(ehArquivoDeInfra(absoluto(relativo))).toBe(false);
  });
});
