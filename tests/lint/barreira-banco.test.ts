import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

describe("barreira de acesso a dado (RF-002)", () => {
  it("recusa import de cliente de banco em componente client", async () => {
    let saiuComErro = false;
    let saida = "";
    try {
      const r = await exec("npx", [
        "eslint",
        "tests/lint/fixtures/componente-cliente-proibido.tsx",
        "--format", "json",
      ]);
      saida = r.stdout;
    } catch (e) {
      saiuComErro = true;
      saida = (e as { stdout?: string }).stdout ?? "";
    }

    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-banco-no-cliente");
  });
});
