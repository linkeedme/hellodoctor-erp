import { describe, it, expect } from "vitest";
import { lintarArquivo } from "./lintar-arquivo";

describe("barreira contra comClinica fora de infra (fecha o bypass de comClinicaDaSessao)", () => {
  it("recusa import de comClinica numa Server Action fora de db/scripts/tests", async () => {
    const { saiuComErro, saida } = await lintarArquivo(
      "tests/lint/fixtures/server-action-usa-com-clinica.ts",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-conexao-privilegiada-fora-de-infra");
  });

  it("recusa import por namespace de db/client fora de db/scripts/tests (escapa de importaSimboloNomeado)", async () => {
    const { saiuComErro, saida } = await lintarArquivo(
      "tests/lint/fixtures/server-action-usa-com-clinica-namespace.ts",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-conexao-privilegiada-fora-de-infra");
  });

  it("não acusa uso legítimo de comClinica dentro de db/ (db/com-sessao.ts)", async () => {
    const { saida } = await lintarArquivo("db/com-sessao.ts");
    expect(saida).not.toContain("sem-conexao-privilegiada-fora-de-infra");
  });

  it("não acusa uso legítimo de comClinica dentro de tests/ (tests/rls-smoke/com-clinica.test.ts)", async () => {
    const { saida } = await lintarArquivo("tests/rls-smoke/com-clinica.test.ts");
    expect(saida).not.toContain("sem-conexao-privilegiada-fora-de-infra");
  });
});

describe("barreira contra comServico fora de infra (BYPASSRLS — lê todos os tenants)", () => {
  it("recusa import de comServico numa Server Action fora de db/scripts/tests (a PoC exata do achado)", async () => {
    const { saiuComErro, saida } = await lintarArquivo(
      "tests/lint/fixtures/server-action-usa-com-servico.ts",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-conexao-privilegiada-fora-de-infra");
    expect(saida).toContain("BYPASSRLS");
  });

  it("recusa import por namespace de db/onboarding fora de db/scripts/tests", async () => {
    const { saiuComErro, saida } = await lintarArquivo(
      "tests/lint/fixtures/server-action-usa-com-servico-namespace.ts",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-conexao-privilegiada-fora-de-infra");
  });

  it("recusa import dinâmico de db/onboarding fora de db/scripts/tests", async () => {
    const { saiuComErro, saida } = await lintarArquivo(
      "tests/lint/fixtures/server-action-usa-com-servico-dinamico.ts",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-conexao-privilegiada-fora-de-infra");
  });

  it("não acusa uso legítimo de comServico dentro de db/ (db/onboarding.ts, onde a função é definida)", async () => {
    const { saida } = await lintarArquivo("db/onboarding.ts");
    expect(saida).not.toContain("sem-conexao-privilegiada-fora-de-infra");
  });

  it("não acusa a exceção explícita da allowlist: modules/adm/onboarding.ts (criação de tenant)", async () => {
    const { saida } = await lintarArquivo("modules/adm/onboarding.ts");
    expect(saida).not.toContain("sem-conexao-privilegiada-fora-de-infra");
  });

  it("não acusa a exceção explícita da allowlist: lib/auth/consultas.ts (identidade antes da sessão existir)", async () => {
    const { saida } = await lintarArquivo("lib/auth/consultas.ts");
    expect(saida).not.toContain("sem-conexao-privilegiada-fora-de-infra");
  });
});
