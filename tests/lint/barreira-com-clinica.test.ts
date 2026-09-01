import { describe, it, expect } from "vitest";
import { lintarArquivo } from "./lintar-arquivo";

describe("barreira contra comClinica fora de infra (fecha o bypass de comClinicaDaSessao)", () => {
  it("recusa import de comClinica numa Server Action fora de db/scripts/tests", async () => {
    const { saiuComErro, saida } = await lintarArquivo(
      "tests/lint/fixtures/server-action-usa-com-clinica.ts",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-com-clinica-fora-de-infra");
  });

  it("recusa import por namespace de db/client fora de db/scripts/tests (escapa de importaComClinicaNomeado)", async () => {
    const { saiuComErro, saida } = await lintarArquivo(
      "tests/lint/fixtures/server-action-usa-com-clinica-namespace.ts",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-com-clinica-fora-de-infra");
  });

  it("não acusa uso legítimo de comClinica dentro de db/ (db/com-sessao.ts)", async () => {
    const { saida } = await lintarArquivo("db/com-sessao.ts");
    expect(saida).not.toContain("sem-com-clinica-fora-de-infra");
  });

  it("não acusa uso legítimo de comClinica dentro de tests/ (tests/rls-smoke/com-clinica.test.ts)", async () => {
    const { saida } = await lintarArquivo("tests/rls-smoke/com-clinica.test.ts");
    expect(saida).not.toContain("sem-com-clinica-fora-de-infra");
  });
});
