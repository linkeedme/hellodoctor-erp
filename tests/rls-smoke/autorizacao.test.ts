import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import pg from "pg";

if (!process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL_SERVICO precisa estar definida. Rode `npm run db:efemero` e exporte as " +
      "variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha é pior do " +
      "que uma que falha.",
  );
}

// lib/autorizacao/verificar.ts começa com `import "server-only"` e importa
// lib/auth/sessao.ts (que por sua vez toca next/headers e next/navigation).
// Fora do bundler do Next isso lança incondicionalmente — mesmo padrão de
// tests/rls-smoke/com-sessao.test.ts.
vi.mock("server-only", () => ({}));

const sessaoFalsa = {
  usuarioId: "11111111-1111-1111-1111-111111111111",
  clinicaId: "22222222-2222-2222-2222-222222222222",
  papelChave: "dona",
  clinicasDisponiveis: [],
};

vi.mock("@/lib/auth/sessao", () => ({
  exigirSessao: async () => sessaoFalsa,
}));

const { exigirPermissao, PermissaoNegada } = await import("@/lib/autorizacao/verificar");
const { semearPapeisEPermissoes } = await import("@/db/seed/papeis-permissoes");
const { MATRIZ, PAPEIS, podeNaMatriz, MODULOS, OPERACOES } = await import(
  "@/lib/autorizacao/matriz"
);

let servico: pg.Client;

beforeAll(async () => {
  await semearPapeisEPermissoes();
  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();
});

afterAll(async () => {
  await servico?.end();
});

describe("exigirPermissao (RF-004 — checagem antes de qualquer query)", () => {
  it("resolve a sessão quando o papel tem a operação na matriz", async () => {
    sessaoFalsa.papelChave = "dona";
    const sessao = await exigirPermissao("adm", "excluir");
    expect(sessao.papelChave).toBe("dona");
  });

  it("lança PermissaoNegada quando o papel não tem a operação na matriz", async () => {
    sessaoFalsa.papelChave = "recepcao";
    await expect(exigirPermissao("adm", "excluir")).rejects.toThrow(PermissaoNegada);
  });

  it("recepção não pode excluir em adm", async () => {
    sessaoFalsa.papelChave = "recepcao";
    await expect(exigirPermissao("adm", "excluir")).rejects.toThrow(PermissaoNegada);
  });

  it("profissional não tem nenhuma operação em adm", async () => {
    sessaoFalsa.papelChave = "profissional";
    for (const operacao of OPERACOES) {
      await expect(exigirPermissao("adm", operacao)).rejects.toThrow(PermissaoNegada);
    }
  });

  it("financeiro não pode criar em prt", async () => {
    sessaoFalsa.papelChave = "financeiro";
    await expect(exigirPermissao("prt", "criar")).rejects.toThrow(PermissaoNegada);
  });

  it("para cada papel, cada módulo × operação bate com a matriz", async () => {
    for (const papel of PAPEIS) {
      sessaoFalsa.papelChave = papel.chave;
      for (const modulo of MODULOS) {
        for (const operacao of OPERACOES) {
          const permitido = podeNaMatriz(papel.chave, modulo, operacao);
          if (permitido) {
            const sessao = await exigirPermissao(modulo, operacao);
            expect(sessao.papelChave).toBe(papel.chave);
          } else {
            await expect(exigirPermissao(modulo, operacao)).rejects.toThrow(PermissaoNegada);
          }
        }
      }
    }
  });
});

describe("seed e matriz não divergem", () => {
  it("o conjunto (papel, módulo, operação) do banco é idêntico ao derivado de MATRIZ", async () => {
    const linhas = await servico.query<{ chave: string; modulo: string; operacao: string }>(
      `select p.chave, pm.modulo, pm.operacao
       from permissao pm
       join papel p on p.id = pm.papel_id`,
    );
    const doBanco = new Set(linhas.rows.map((r) => `${r.chave}:${r.modulo}:${r.operacao}`));

    const daMatriz = new Set(
      MATRIZ.flatMap((e) => e.operacoes.map((op) => `${e.papel}:${e.modulo}:${op}`)),
    );

    expect(doBanco).toEqual(daMatriz);
  });
});
