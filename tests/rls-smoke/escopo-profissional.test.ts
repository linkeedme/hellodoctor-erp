import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { sql } from "kysely";
import pg from "pg";

if (!process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL_SERVICO precisa estar definida. Rode `npm run db:efemero` e exporte as " +
      "variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha é pior do " +
      "que uma que falha.",
  );
}

// db/onboarding.ts começa com `import "server-only"`. Fora do bundler do Next
// isso lança incondicionalmente — mesmo padrão de tests/rls-smoke/com-clinica.test.ts.
// `comServico` só é importável aqui (tests/) e em db/, scripts/ — regra de lint
// local/sem-conexao-privilegiada-fora-de-infra — por isso este teste, que
// precisa dele de propósito, não pode morar em modules/cat/__tests__/.
vi.mock("server-only", () => ({}));

const { comServico } = await import("@/db/onboarding");

const CLINICA = "34343434-3434-3434-3434-343434343434";
const UNIDADE = "34343434-1111-1111-1111-343434343434";
const PACIENTE = "34343434-2222-2222-2222-343434343434";
const PROFISSIONAL_CRM = "34343434-3333-3333-3333-343434343434";
const PROCEDIMENTO_CRO = "34343434-4444-4444-4444-343434343434";

let servico: pg.Client;
let usuarioId = "";
let membroId = "";

beforeAll(async () => {
  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values ($1, 'Clinica Escopo Trigger', '34343434000191')
     on conflict (id) do nothing`,
    [CLINICA],
  );

  await servico.query(
    `insert into unidade (id, clinica_id, nome) values ($1, $2, 'Matriz')
     on conflict (id) do nothing`,
    [UNIDADE, CLINICA],
  );

  const usuario = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Usuario Escopo Trigger', 'escopo-trigger@teste.local', 'auth-escopo-trigger')
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
  );
  const linhaUsuario = usuario.rows[0];
  if (!linhaUsuario) throw new Error("falha ao semear usuario");
  usuarioId = linhaUsuario.id;

  const papel = await servico.query<{ id: string }>(
    "select id from papel where chave = 'profissional'",
  );
  const papelId = papel.rows[0]?.id;
  if (!papelId) {
    throw new Error(
      "papel 'profissional' não semeado — rode semearPapeisEPermissoes() antes desta suíte",
    );
  }

  const membro = await servico.query<{ id: string }>(
    `insert into membro (clinica_id, usuario_id, papel_id) values ($1, $2, $3)
     on conflict (clinica_id, usuario_id) do update set papel_id = excluded.papel_id
     returning id`,
    [CLINICA, usuarioId, papelId],
  );
  const linhaMembro = membro.rows[0];
  if (!linhaMembro) throw new Error("falha ao semear membro");
  membroId = linhaMembro.id;

  await servico.query("delete from profissional where id = $1", [PROFISSIONAL_CRM]);
  await servico.query(
    `insert into profissional (id, clinica_id, membro_id, conselho, numero_conselho, uf, vinculo)
     values ($1, $2, $3, 'CRM', '000001', 'RJ', 'clt')`,
    [PROFISSIONAL_CRM, CLINICA, membroId],
  );

  await servico.query(
    `insert into paciente (id, clinica_id, nome) values ($1, $2, 'Paciente Escopo Trigger')
     on conflict (id) do nothing`,
    [PACIENTE, CLINICA],
  );

  await servico.query(
    `insert into procedimento (id, clinica_id, nome, duracao_minutos) values ($1, $2, 'Procedimento so CRO', 30)
     on conflict (id) do nothing`,
    [PROCEDIMENTO_CRO, CLINICA],
  );
  // Autorizado só para CRO — o profissional de teste é CRM.
  await servico.query(
    `insert into procedimento_conselho_autorizado (procedimento_id, conselho) values ($1, 'CRO')
     on conflict (procedimento_id, conselho) do nothing`,
    [PROCEDIMENTO_CRO],
  );
});

afterAll(async () => {
  await servico?.query("delete from agendamento where clinica_id = $1", [CLINICA]);
  await servico?.end();
});

describe("trigger verificar_escopo_profissional — defesa em profundidade (RF-005)", () => {
  it("recusa INSERT em agendamento feito direto via comServico, sem passar por podeExecutar", async () => {
    // `comServico` é a conexão BYPASSRLS (db/onboarding.ts): não passa pela
    // Server Action, não passa por modules/cat/escopo.ts::podeExecutar, não
    // passa por RLS nenhum. Se o INSERT abaixo falhar, quem recusou foi só o
    // trigger do banco — a prova de que a checagem no servidor é reforço,
    // não a única linha de defesa.
    await expect(
      comServico((db) =>
        sql`insert into agendamento
          (clinica_id, unidade_id, paciente_id, profissional_id, procedimento_id, inicio, fim, criado_por)
          values (
            ${CLINICA}, ${UNIDADE}, ${PACIENTE}, ${PROFISSIONAL_CRM}, ${PROCEDIMENTO_CRO},
            now(), now() + interval '30 minutes', ${usuarioId}
          )`.execute(db),
      ),
    ).rejects.toThrow(/fora do escopo autorizado/);
  });
});
