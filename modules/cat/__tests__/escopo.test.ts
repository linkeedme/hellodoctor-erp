import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` e exporte as variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha é pior do que uma que falha.",
  );
}

// modules/cat/escopo.ts importa db/com-sessao.ts, que começa com
// `import "server-only"` (e importa lib/auth/sessao.ts, que toca
// next/headers e next/navigation). Fora do bundler do Next isso lança
// incondicionalmente — mesmo padrão de tests/rls-smoke/adm-cadastros.test.ts.
vi.mock("server-only", () => ({}));

const CLINICA = "12121212-1212-1212-1212-121212121212";

const sessaoFalsa = {
  usuarioId: "",
  clinicaId: CLINICA,
  papelChave: "profissional",
  clinicasDisponiveis: [] as { id: string; razaoSocial: string }[],
};

vi.mock("@/lib/auth/sessao", () => ({
  exigirSessao: async () => sessaoFalsa,
}));

const { semearPapeisEPermissoes } = await import("@/db/seed/papeis-permissoes");
const { podeExecutar } = await import("@/modules/cat/escopo");

const CONSELHOS = ["CRM", "CRO", "CRBM", "COREN", "CREFITO"] as const;

let servico: pg.Client;
const profissionalPorConselho = new Map<string, string>();
const procedimentoPorConselho = new Map<string, string>();

function pegar(mapa: Map<string, string>, chave: string): string {
  const valor = mapa.get(chave);
  if (valor === undefined) throw new Error(`sem valor semeado para '${chave}'`);
  return valor;
}

beforeAll(async () => {
  await semearPapeisEPermissoes();

  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values ($1, 'Clinica Escopo', '12121212000191')
     on conflict (id) do nothing`,
    [CLINICA],
  );

  const papel = await servico.query<{ id: string }>(
    "select id from papel where chave = 'profissional'",
  );
  const papelId = papel.rows[0]?.id;
  if (!papelId) throw new Error("papel 'profissional' não semeado");

  for (const [indice, conselho] of CONSELHOS.entries()) {
    const usuario = await servico.query<{ id: string }>(
      `insert into usuario (nome, email, auth_provider_id)
       values ($1, $2, $3)
       on conflict (auth_provider_id) do update set nome = excluded.nome
       returning id`,
      [
        `Profissional Escopo ${conselho}`,
        `escopo-${conselho.toLowerCase()}@teste.local`,
        `auth-escopo-${conselho}`,
      ],
    );
    const usuarioId = usuario.rows[0]?.id;
    if (!usuarioId) throw new Error(`falha ao semear usuario ${conselho}`);
    if (indice === 0) sessaoFalsa.usuarioId = usuarioId;

    const membro = await servico.query<{ id: string }>(
      `insert into membro (clinica_id, usuario_id, papel_id) values ($1, $2, $3)
       on conflict (clinica_id, usuario_id) do update set papel_id = excluded.papel_id
       returning id`,
      [CLINICA, usuarioId, papelId],
    );
    const membroId = membro.rows[0]?.id;
    if (!membroId) throw new Error(`falha ao semear membro ${conselho}`);

    // profissional.membro_id é unique — sem isso, rodar a suíte de novo
    // esbarraria no profissional criado na rodada anterior.
    await servico.query("delete from profissional where membro_id = $1", [membroId]);
    const profissional = await servico.query<{ id: string }>(
      `insert into profissional (clinica_id, membro_id, conselho, numero_conselho, uf, vinculo)
       values ($1, $2, $3, '000001', 'RJ', 'clt')
       returning id`,
      [CLINICA, membroId, conselho],
    );
    const profissionalId = profissional.rows[0]?.id;
    if (!profissionalId) throw new Error(`falha ao semear profissional ${conselho}`);
    profissionalPorConselho.set(conselho, profissionalId);

    const procedimento = await servico.query<{ id: string }>(
      `insert into procedimento (clinica_id, nome, duracao_minutos) values ($1, $2, 30)
       returning id`,
      [CLINICA, `Procedimento ${conselho}`],
    );
    const procedimentoId = procedimento.rows[0]?.id;
    if (!procedimentoId) throw new Error(`falha ao semear procedimento ${conselho}`);
    procedimentoPorConselho.set(conselho, procedimentoId);

    await servico.query(
      `insert into procedimento_conselho_autorizado (procedimento_id, conselho) values ($1, $2)`,
      [procedimentoId, conselho],
    );
  }
});

afterAll(async () => {
  await servico?.end();
});

describe("podeExecutar — escopo profissional no servidor (RF-005)", () => {
  it.each(CONSELHOS)(
    "autoriza profissional do conselho %s no procedimento que autoriza o próprio conselho",
    async (conselho) => {
      const resultado = await podeExecutar(
        pegar(procedimentoPorConselho, conselho),
        pegar(profissionalPorConselho, conselho),
      );
      expect(resultado).toBe(true);
    },
  );

  it.each(CONSELHOS)(
    "recusa profissional do conselho %s num procedimento autorizado só para outro conselho",
    async (conselho) => {
      const outro = CONSELHOS.find((c) => c !== conselho);
      if (!outro) throw new Error("enum de conselho precisa de ao menos 2 valores");
      const resultado = await podeExecutar(
        pegar(procedimentoPorConselho, outro),
        pegar(profissionalPorConselho, conselho),
      );
      expect(resultado).toBe(false);
    },
  );

  it("procedimento inexistente (sem nenhuma linha em procedimento_conselho_autorizado) é recusado", async () => {
    const resultado = await podeExecutar(
      "00000000-0000-0000-0000-000000000000",
      pegar(profissionalPorConselho, "CRM"),
    );
    expect(resultado).toBe(false);
  });

  it("profissional inexistente é recusado", async () => {
    const resultado = await podeExecutar(
      pegar(procedimentoPorConselho, "CRM"),
      "00000000-0000-0000-0000-000000000000",
    );
    expect(resultado).toBe(false);
  });
});
