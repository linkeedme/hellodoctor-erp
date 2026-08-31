import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` " +
      "e exporte as variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha " +
      "é pior do que uma que falha.",
  );
}

vi.mock("server-only", () => ({}));

const CLINICA_SESSAO = "77777777-7777-7777-7777-777777777777";
const CLINICA_ALHEIA = "88888888-8888-8888-8888-888888888888";
let usuarioId = "";

const sessaoFalsa = {
  usuarioId: "",
  clinicaId: CLINICA_SESSAO,
  papelChave: "dona",
  clinicasDisponiveis: [{ id: CLINICA_SESSAO, razaoSocial: "Clinica da Sessao" }],
};

vi.mock("@/lib/auth/sessao", () => ({
  exigirSessao: async () => sessaoFalsa,
}));

let servico: pg.Client;

beforeAll(async () => {
  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();
  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values
       ($1, 'Clinica da Sessao', '77777777000191'),
       ($2, 'Clinica Alheia', '88888888000191')
     on conflict (id) do nothing`,
    [CLINICA_SESSAO, CLINICA_ALHEIA],
  );
  const u = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Usuario Sessao', 'sessao@teste.local', 'auth-sessao')
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

describe("comClinicaDaSessao", () => {
  it("enxerga a clínica da sessão", async () => {
    const { comClinicaDaSessao } = await import("../../db/com-sessao");
    const achou = await comClinicaDaSessao(async (trx) => {
      const r = await trx
        .selectFrom("clinica")
        .select("id")
        .where("id", "=", CLINICA_SESSAO)
        .executeTakeFirst();
      return r?.id ?? null;
    });
    expect(achou).toBe(CLINICA_SESSAO);
  });

  it("NÃO enxerga clínica alheia, mesmo consultando o id direto", async () => {
    const { comClinicaDaSessao } = await import("../../db/com-sessao");
    const achou = await comClinicaDaSessao(async (trx) => {
      const r = await trx
        .selectFrom("clinica")
        .select("id")
        .where("id", "=", CLINICA_ALHEIA)
        .executeTakeFirst();
      return r?.id ?? null;
    });
    expect(achou).toBeNull();
  });

  it("entrega a sessão ao callback, para o chamador não precisar buscá-la de novo", async () => {
    const { comClinicaDaSessao } = await import("../../db/com-sessao");
    const vista = await comClinicaDaSessao(async (_trx, sessao) => sessao);
    expect(vista.clinicaId).toBe(CLINICA_SESSAO);
    expect(vista.usuarioId).toBe(usuarioId);
    expect(vista.papelChave).toBe("dona");
  });

  it("propaga usuarioId da sessão para app.usuario_id", async () => {
    const { comClinicaDaSessao } = await import("../../db/com-sessao");
    const { sql } = await import("kysely");
    const lido = await comClinicaDaSessao(async (trx) => {
      const r = await sql<{ valor: string | null }>`
        select current_setting('app.usuario_id', true) as valor`.execute(trx);
      return r.rows[0]?.valor ?? null;
    });
    expect(lido).toBe(usuarioId);
  });
});
