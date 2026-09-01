import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` " +
      "e exporte as variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha " +
      "é pior do que uma que falha.",
  );
}

// lib/auditoria/*.ts importam db/com-sessao.ts, que começa com
// `import "server-only"` e importa lib/auth/sessao.ts (next/headers,
// next/navigation). Fora do bundler do Next isso lança incondicionalmente —
// mesmo padrão de tests/rls-smoke/com-sessao.test.ts.
vi.mock("server-only", () => ({}));

// evento_auditoria é append-only: uma clínica referenciada por um evento
// nunca mais pode ser apagada (nem o próprio evento, por trigger). Por isso
// esta suíte usa uma clínica fixa e reaproveitada entre execuções
// (`on conflict do nothing`, igual às demais suítes de rls-smoke) e nunca
// tenta apagá-la — e cada teste usa um `entidadeId` novo (randomUUID) para
// não colidir com eventos gravados em execuções anteriores.
const CLINICA_AUDITORIA = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
let usuarioId = "";

const sessaoFalsa = {
  usuarioId: "",
  clinicaId: CLINICA_AUDITORIA,
  papelChave: "dona",
  clinicasDisponiveis: [{ id: CLINICA_AUDITORIA, razaoSocial: "Clinica Auditoria" }],
};

vi.mock("@/lib/auth/sessao", () => ({
  exigirSessao: async () => sessaoFalsa,
}));

let servico: pg.Client;

beforeAll(async () => {
  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values ($1, 'Clinica Auditoria', '99999999000191')
     on conflict (id) do nothing`,
    [CLINICA_AUDITORIA],
  );

  const u = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Usuario Auditoria', 'auditoria@teste.local', 'auth-auditoria')
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
  );
  const linha = u.rows[0];
  if (!linha) throw new Error("falha ao semear usuario");
  usuarioId = linha.id;
  sessaoFalsa.usuarioId = usuarioId;
});

afterAll(async () => {
  await servico?.end();
});

async function contarEventos(entidadeId: string): Promise<number> {
  const r = await servico.query<{ total: string }>(
    "select count(*)::text as total from evento_auditoria where entidade_id = $1",
    [entidadeId],
  );
  return Number(r.rows[0]?.total ?? "0");
}

describe("lerAuditado", () => {
  it("devolve o dado da consulta", async () => {
    const { lerAuditado } = await import("@/lib/auditoria/ler-auditado");
    const entidadeId = randomUUID();

    const resultado = await lerAuditado("paciente", entidadeId, async () => ({ ok: true }));

    expect(resultado).toEqual({ ok: true });
  });

  it("grava exatamente um evento com acao='leitura', entidade e id corretos", async () => {
    const { lerAuditado } = await import("@/lib/auditoria/ler-auditado");
    const entidadeId = randomUUID();

    await lerAuditado("ficha", entidadeId, async () => "conteudo");

    const r = await servico.query<{
      acao: string;
      entidade: string;
      entidade_id: string;
      request_id: string;
    }>("select acao, entidade, entidade_id, request_id from evento_auditoria where entidade_id = $1", [
      entidadeId,
    ]);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0]?.acao).toBe("leitura");
    expect(r.rows[0]?.entidade).toBe("ficha");
    expect(r.rows[0]?.entidade_id).toBe(entidadeId);
    // obterRequestId() preenche request_id — não é null nem uma string arbitrária.
    expect(r.rows[0]?.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("o evento carrega clinica_id e usuario_id da sessão, não de parâmetro", async () => {
    const { lerAuditado } = await import("@/lib/auditoria/ler-auditado");
    const entidadeId = randomUUID();

    await lerAuditado("evolucao", entidadeId, async () => null);

    const r = await servico.query<{ clinica_id: string; usuario_id: string }>(
      "select clinica_id, usuario_id from evento_auditoria where entidade_id = $1",
      [entidadeId],
    );
    expect(r.rows[0]?.clinica_id).toBe(CLINICA_AUDITORIA);
    expect(r.rows[0]?.usuario_id).toBe(usuarioId);
  });

  it("se a consulta lançar, nenhum evento fica gravado (transação reverte)", async () => {
    const { lerAuditado } = await import("@/lib/auditoria/ler-auditado");
    const entidadeId = randomUUID();

    await expect(
      lerAuditado("ficha", entidadeId, async () => {
        throw new Error("falha proposital na consulta");
      }),
    ).rejects.toThrow(/falha proposital/);

    expect(await contarEventos(entidadeId)).toBe(0);
  });

  it("se a gravação do evento falhar, a leitura não retorna dado (nem chega a rodar)", async () => {
    const { lerAuditado } = await import("@/lib/auditoria/ler-auditado");
    // "nao-e-um-uuid" não é um uuid válido: o INSERT em evento_auditoria
    // (entidade_id é `uuid`) falha de verdade no banco — não é mock.
    let consultaExecutou = false;

    await expect(
      lerAuditado("ficha", "nao-e-um-uuid", async () => {
        consultaExecutou = true;
        return "dado sensivel";
      }),
    ).rejects.toThrow();

    // a gravação falha ANTES da consulta rodar (lerAuditado grava e só
    // depois lê, na mesma transação) — "a leitura não acontece", não
    // apenas "não retorna dado".
    expect(consultaExecutou).toBe(false);
  });

  it("dois lerAuditado seguidos geram dois eventos, não um", async () => {
    const { lerAuditado } = await import("@/lib/auditoria/ler-auditado");
    const entidadeId = randomUUID();

    await lerAuditado("paciente", entidadeId, async () => 1);
    await lerAuditado("paciente", entidadeId, async () => 2);

    expect(await contarEventos(entidadeId)).toBe(2);
  });
});

describe("registrarEvento — escrita", () => {
  it("alterar um campo grava valor_antes/valor_depois só daquele campo, não a linha inteira", async () => {
    const { registrarEvento } = await import("@/lib/auditoria/registrar");
    const { comClinicaDaSessao } = await import("@/db/com-sessao");
    const entidadeId = randomUUID();

    await comClinicaDaSessao((trx, sessao) =>
      registrarEvento(trx, sessao, {
        acao: "atualizacao",
        entidade: "unidade",
        entidadeId,
        valorAntes: { nome: "Nome Antigo" },
        valorDepois: { nome: "Nome Novo" },
      }),
    );

    const r = await servico.query<{
      valor_antes: Record<string, unknown>;
      valor_depois: Record<string, unknown>;
    }>("select valor_antes, valor_depois from evento_auditoria where entidade_id = $1", [
      entidadeId,
    ]);
    expect(r.rows[0]?.valor_antes).toEqual({ nome: "Nome Antigo" });
    expect(r.rows[0]?.valor_depois).toEqual({ nome: "Nome Novo" });
    // nenhuma outra chave além da que mudou — não é a linha inteira.
    expect(Object.keys(r.rows[0]?.valor_antes ?? {})).toEqual(["nome"]);
    expect(Object.keys(r.rows[0]?.valor_depois ?? {})).toEqual(["nome"]);
  });
});
