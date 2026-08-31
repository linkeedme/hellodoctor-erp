import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function lintarArquivo(
  caminho: string,
): Promise<{ saiuComErro: boolean; saida: string }> {
  try {
    const r = await exec("npx", ["eslint", caminho, "--format", "json"]);
    return { saiuComErro: false, saida: r.stdout };
  } catch (e) {
    return { saiuComErro: true, saida: (e as { stdout?: string }).stdout ?? "" };
  }
}

describe("barreira contra comClinica fora de infra (fecha o bypass de comClinicaDaSessao)", () => {
  it("recusa import de comClinica numa Server Action fora de db/scripts/tests", async () => {
    const { saiuComErro, saida } = await lintarArquivo(
      "tests/lint/fixtures/server-action-usa-com-clinica.ts",
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
