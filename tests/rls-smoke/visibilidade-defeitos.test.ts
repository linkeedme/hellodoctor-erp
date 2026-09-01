import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import pg from "pg";
import { cnpjUnico } from "./cnpj-unico";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` " +
      "e exporte as variáveis. Esta suíte NÃO pula.",
  );
}

// modules/adm/onboarding.ts começa com `import "server-only"` e importa
// lib/auth/sessao.ts (que toca next/headers e next/navigation). Fora do
// bundler do Next isso lança incondicionalmente — mesmo padrão de
// tests/rls-smoke/com-sessao.test.ts e tests/rls-smoke/adm-cadastros.test.ts.
vi.mock("server-only", () => ({}));

const usuarioAutenticadoFalso = { id: "", nome: "", email: "" };

vi.mock("@/lib/auth/sessao", () => ({
  exigirUsuarioAutenticado: async () => usuarioAutenticadoFalso,
}));

const { semearPapeisEPermissoes } = await import("@/db/seed/papeis-permissoes");
const { criarClinica } = await import("@/modules/adm/onboarding");

let servico: pg.Client;
const CLINICA_SEM_POLITICA = "cccc0000-0000-0000-0000-00000000000c";

beforeAll(async () => {
  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();
  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values ($1, 'Sem Politica', '55555555000191')
     on conflict (id) do nothing`,
    [CLINICA_SEM_POLITICA],
  );
  // de propósito: NÃO cria linha em politica_visibilidade_paciente
  await servico.query("delete from politica_visibilidade_paciente where clinica_id = $1", [
    CLINICA_SEM_POLITICA,
  ]);
});

afterAll(async () => {
  await servico.query("delete from clinica where id = $1", [CLINICA_SEM_POLITICA]).catch(() => {});
  await servico?.end();
});

describe("defeito 1: clínica sem política configurada", () => {
  it("NÃO deve enxergar paciente por omissão — falha fechada", async () => {
    // com set_config apontando para a clínica sem política
    await servico.query("select set_config('app.clinica_id', $1, false)", [CLINICA_SEM_POLITICA]);
    const r2 = await servico.query<{ visivel: boolean }>(
      `select app_paciente_visivel('00000000-0000-0000-0000-000000000000'::uuid) as visivel`,
    );
    expect(r2.rows[0]?.visivel).toBe(false);
  });
});

describe("defeito 2: search_path fixo", () => {
  it("a função declara search_path explícito", async () => {
    const r = await servico.query<{ config: string[] | null }>(
      `select proconfig as config from pg_proc where proname = 'app_paciente_visivel'`,
    );
    const config = r.rows[0]?.config ?? [];
    // valor exato, não só a presença da chave: "search_path=pg_temp, public"
    // (ordem invertida) também casaria com startsWith("search_path=") mas
    // reabriria o shadowing que esta correção fecha.
    expect(config).toContain("search_path=public, pg_temp");
  });
});

describe("onboarding cria a política de visibilidade (senão toda clínica nova nasce cega)", () => {
  let clinicaCriadaId = "";

  afterAll(async () => {
    if (!clinicaCriadaId) return;
    await servico.query("delete from politica_visibilidade_paciente where clinica_id = $1", [
      clinicaCriadaId,
    ]);
    await servico.query("delete from membro where clinica_id = $1", [clinicaCriadaId]);
    await servico.query("delete from unidade where clinica_id = $1", [clinicaCriadaId]);
    // NÃO apaga `clinica`: criarClinica audita (Task 1 da Fatia 4) e o
    // evento_auditoria gerado referencia esta clínica — a tabela é
    // append-only (trigger recusa DELETE) e não há cascade na FK, então a
    // clínica fica órfã de propósito. Por isso o cnpj abaixo é único por
    // execução, pra suíte poder rodar de novo sem "CNPJ já cadastrado".
  });

  it("criarClinica cria a linha de politica_visibilidade_paciente, em modo 'aberto', na mesma transação", async () => {
    await semearPapeisEPermissoes();

    const u = await servico.query<{ id: string }>(
      `insert into usuario (nome, email, auth_provider_id)
       values ('Usuario Visibilidade', 'visibilidade@teste.local', 'auth-visibilidade-defeitos')
       on conflict (auth_provider_id) do update set nome = excluded.nome
       returning id`,
    );
    const linhaUsuario = u.rows[0];
    if (!linhaUsuario) throw new Error("falha ao semear usuario");
    usuarioAutenticadoFalso.id = linhaUsuario.id;
    usuarioAutenticadoFalso.nome = "Usuario Visibilidade";
    usuarioAutenticadoFalso.email = "visibilidade@teste.local";

    const resultado = await criarClinica({
      clinica: { razaoSocial: "Clinica Nasce Com Politica", cnpj: cnpjUnico() },
      nomeUnidadePrincipal: "Matriz",
    });
    clinicaCriadaId = resultado.clinica.id;

    const politica = await servico.query<{ modo: string }>(
      "select modo from politica_visibilidade_paciente where clinica_id = $1",
      [clinicaCriadaId],
    );
    expect(politica.rows[0]?.modo).toBe("aberto");
  });
});
