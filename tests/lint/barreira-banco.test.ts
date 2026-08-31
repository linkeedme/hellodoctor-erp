import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function lintarFixture(
  caminho: string,
): Promise<{ saiuComErro: boolean; saida: string }> {
  try {
    const r = await exec("npx", [
      "eslint",
      caminho,
      "--format", "json",
    ]);
    return { saiuComErro: false, saida: r.stdout };
  } catch (e) {
    return { saiuComErro: true, saida: (e as { stdout?: string }).stdout ?? "" };
  }
}

describe("barreira de acesso a dado (RF-002)", () => {
  it("recusa import de cliente de banco em componente client", async () => {
    const { saiuComErro, saida } = await lintarFixture(
      "tests/lint/fixtures/componente-cliente-proibido.tsx",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-banco-no-cliente");
  });

  it("recusa import relativo do db em componente client (bypass do alias @/db/)", async () => {
    const { saiuComErro, saida } = await lintarFixture(
      "tests/lint/fixtures/import-relativo-escapa.tsx",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-banco-no-cliente");
  });

  it("recusa import dinâmico do db em componente client", async () => {
    const { saiuComErro, saida } = await lintarFixture(
      "tests/lint/fixtures/import-dinamico-escapa.ts",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-banco-no-cliente");
  });

  it("recusa re-export (nomeado e *) do db em componente client", async () => {
    const { saiuComErro, saida } = await lintarFixture(
      "tests/lint/fixtures/reexport-escapa.ts",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-banco-no-cliente");
  });

  it("detecta \"use client\" mesmo depois de outras diretivas no prólogo", async () => {
    const { saiuComErro, saida } = await lintarFixture(
      "tests/lint/fixtures/prologo-diretivas-escapa.tsx",
    );
    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-banco-no-cliente");
  });

  it("não acusa Server Action legítima importando o db (sem falso-positivo)", async () => {
    const { saida } = await lintarFixture(
      "tests/lint/fixtures/acao-servidor-permitida.ts",
    );
    expect(saida).not.toContain("sem-banco-no-cliente");
  });
});
