import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` " +
      "e exporte as variáveis. Esta suíte NÃO pula: é a mais delicada do projeto — vazamento " +
      "aqui é entre profissionais da mesma clínica, e passa por colega curioso, não por erro " +
      "de sistema.",
  );
}

// db/seed/papeis-permissoes.ts importa db/onboarding.ts, que começa com
// `import "server-only"`. Fora do bundler do Next isso lança
// incondicionalmente — mesmo padrão do resto de tests/rls-smoke.
vi.mock("server-only", () => ({}));

const { semearPapeisEPermissoes } = await import("@/db/seed/papeis-permissoes");

const CLINICA_VIS = "66666666-6666-6666-6666-666666666666";

type Modo = "aberto" | "isolado" | "restrito";

let servico: pg.Client;
let app: pg.Client;

let usuarioResponsavelId = "";
let usuarioOutroId = "";
let profissionalOutroId = "";

let pacienteId = "";
let atendimentoId = "";
let fichaId = "";
let evolucaoId = "";
let medidaId = "";
let fotoId = "";
let agendamentoId = "";
let recebimentoId = "";

beforeAll(async () => {
  await semearPapeisEPermissoes();

  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();
  app = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values ($1, 'Clinica Visibilidade', '66666666000191')
     on conflict (id) do nothing`,
    [CLINICA_VIS],
  );
  await servico.query(
    `insert into politica_visibilidade_paciente (clinica_id, modo) values ($1, 'aberto')
     on conflict (clinica_id) do update set modo = 'aberto'`,
    [CLINICA_VIS],
  );

  const papel = await servico.query<{ id: string }>(
    "select id from papel where chave = 'profissional'",
  );
  const papelId = papel.rows[0]?.id;
  if (!papelId) throw new Error("papel 'profissional' não semeado");

  const uResponsavel = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Profissional Responsavel Visibilidade', 'vis-responsavel@teste.local', 'auth-vis-responsavel')
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
  );
  const linhaResponsavel = uResponsavel.rows[0];
  if (!linhaResponsavel) throw new Error("falha ao semear usuario responsavel");
  usuarioResponsavelId = linhaResponsavel.id;

  const uOutro = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Profissional Outro Visibilidade', 'vis-outro@teste.local', 'auth-vis-outro')
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
  );
  const linhaOutro = uOutro.rows[0];
  if (!linhaOutro) throw new Error("falha ao semear usuario outro");
  usuarioOutroId = linhaOutro.id;

  const membroResponsavel = await servico.query<{ id: string }>(
    `insert into membro (clinica_id, usuario_id, papel_id) values ($1, $2, $3)
     on conflict (clinica_id, usuario_id) do update set papel_id = excluded.papel_id
     returning id`,
    [CLINICA_VIS, usuarioResponsavelId, papelId],
  );
  const linhaMembroResponsavel = membroResponsavel.rows[0];
  if (!linhaMembroResponsavel) throw new Error("falha ao semear membro responsavel");

  const membroOutro = await servico.query<{ id: string }>(
    `insert into membro (clinica_id, usuario_id, papel_id) values ($1, $2, $3)
     on conflict (clinica_id, usuario_id) do update set papel_id = excluded.papel_id
     returning id`,
    [CLINICA_VIS, usuarioOutroId, papelId],
  );
  const linhaMembroOutro = membroOutro.rows[0];
  if (!linhaMembroOutro) throw new Error("falha ao semear membro outro");

  // profissional.membro_id é unique — sem isso, rodar a suíte de novo esbarra
  // no profissional que a rodada anterior já criou para estes membros.
  await servico.query("delete from profissional where membro_id = any($1)", [
    [linhaMembroResponsavel.id, linhaMembroOutro.id],
  ]);

  const profissionalResponsavel = await servico.query<{ id: string }>(
    `insert into profissional (clinica_id, membro_id, conselho, numero_conselho, uf, vinculo)
     values ($1, $2, 'CRM', '111111', 'RJ', 'clt') returning id`,
    [CLINICA_VIS, linhaMembroResponsavel.id],
  );
  const linhaProfissionalResponsavel = profissionalResponsavel.rows[0];
  if (!linhaProfissionalResponsavel) throw new Error("falha ao semear profissional responsavel");
  const profissionalResponsavelId = linhaProfissionalResponsavel.id;

  const profissionalOutro = await servico.query<{ id: string }>(
    `insert into profissional (clinica_id, membro_id, conselho, numero_conselho, uf, vinculo)
     values ($1, $2, 'CRM', '222222', 'RJ', 'clt') returning id`,
    [CLINICA_VIS, linhaMembroOutro.id],
  );
  const linhaProfissionalOutro = profissionalOutro.rows[0];
  if (!linhaProfissionalOutro) throw new Error("falha ao semear profissional outro");
  profissionalOutroId = linhaProfissionalOutro.id;

  const unidade = await servico.query<{ id: string }>(
    `insert into unidade (clinica_id, nome) values ($1, 'Matriz Visibilidade') returning id`,
    [CLINICA_VIS],
  );
  const linhaUnidade = unidade.rows[0];
  if (!linhaUnidade) throw new Error("falha ao semear unidade");

  const paciente = await servico.query<{ id: string }>(
    `insert into paciente (clinica_id, nome, profissional_responsavel_id)
     values ($1, 'Paciente Visibilidade', $2) returning id`,
    [CLINICA_VIS, profissionalResponsavelId],
  );
  const linhaPaciente = paciente.rows[0];
  if (!linhaPaciente) throw new Error("falha ao semear paciente");
  pacienteId = linhaPaciente.id;

  const procedimento = await servico.query<{ id: string }>(
    `insert into procedimento (clinica_id, nome, duracao_minutos)
     values ($1, 'Procedimento Visibilidade', 30) returning id`,
    [CLINICA_VIS],
  );
  const linhaProcedimento = procedimento.rows[0];
  if (!linhaProcedimento) throw new Error("falha ao semear procedimento");

  // trigger verificar_escopo_profissional recusa agendamento se o conselho do
  // profissional não estiver autorizado para o procedimento.
  await servico.query(
    `insert into procedimento_conselho_autorizado (procedimento_id, conselho) values ($1, 'CRM')
     on conflict do nothing`,
    [linhaProcedimento.id],
  );

  const pose = await servico.query<{ id: string }>(
    `insert into pose (clinica_id, nome, regiao) values ($1, 'Frontal', 'rosto') returning id`,
    [CLINICA_VIS],
  );
  const linhaPose = pose.rows[0];
  if (!linhaPose) throw new Error("falha ao semear pose");

  const fichaTemplate = await servico.query<{ id: string }>(
    `insert into ficha_template (clinica_id, chave_especialidade, nome)
     values ($1, 'geral', 'Ficha Visibilidade') returning id`,
    [CLINICA_VIS],
  );
  const linhaFichaTemplate = fichaTemplate.rows[0];
  if (!linhaFichaTemplate) throw new Error("falha ao semear ficha_template");

  const fichaTemplateVersao = await servico.query<{ id: string }>(
    `insert into ficha_template_versao (ficha_template_id, versao, json_schema)
     values ($1, 1, '{}'::jsonb) returning id`,
    [linhaFichaTemplate.id],
  );
  const linhaFichaTemplateVersao = fichaTemplateVersao.rows[0];
  if (!linhaFichaTemplateVersao) throw new Error("falha ao semear ficha_template_versao");

  const atendimento = await servico.query<{ id: string }>(
    `insert into atendimento (clinica_id, unidade_id, paciente_id, profissional_id, tipo, status)
     values ($1, $2, $3, $4, 'procedimento', 'concluido') returning id`,
    [CLINICA_VIS, linhaUnidade.id, pacienteId, profissionalResponsavelId],
  );
  const linhaAtendimento = atendimento.rows[0];
  if (!linhaAtendimento) throw new Error("falha ao semear atendimento");
  atendimentoId = linhaAtendimento.id;

  const ficha = await servico.query<{ id: string }>(
    `insert into ficha (clinica_id, atendimento_id, ficha_template_versao_id, dados, preenchido_por)
     values ($1, $2, $3, '{}'::jsonb, $4) returning id`,
    [CLINICA_VIS, atendimentoId, linhaFichaTemplateVersao.id, usuarioResponsavelId],
  );
  const linhaFicha = ficha.rows[0];
  if (!linhaFicha) throw new Error("falha ao semear ficha");
  fichaId = linhaFicha.id;

  const evolucao = await servico.query<{ id: string }>(
    `insert into evolucao (clinica_id, atendimento_id, texto, registrado_por)
     values ($1, $2, 'Evolução de teste', $3) returning id`,
    [CLINICA_VIS, atendimentoId, usuarioResponsavelId],
  );
  const linhaEvolucao = evolucao.rows[0];
  if (!linhaEvolucao) throw new Error("falha ao semear evolucao");
  evolucaoId = linhaEvolucao.id;

  const medida = await servico.query<{ id: string }>(
    `insert into medida (clinica_id, paciente_id, atendimento_id, tipo, valor, unidade)
     values ($1, $2, $3, 'peso', 70, 'kg') returning id`,
    [CLINICA_VIS, pacienteId, atendimentoId],
  );
  const linhaMedida = medida.rows[0];
  if (!linhaMedida) throw new Error("falha ao semear medida");
  medidaId = linhaMedida.id;

  const foto = await servico.query<{ id: string }>(
    `insert into foto (clinica_id, paciente_id, atendimento_id, pose_id, arquivo_url, origem)
     values ($1, $2, $3, $4, 'https://exemplo.local/foto.jpg', 'captura_direta') returning id`,
    [CLINICA_VIS, pacienteId, atendimentoId, linhaPose.id],
  );
  const linhaFoto = foto.rows[0];
  if (!linhaFoto) throw new Error("falha ao semear foto");
  fotoId = linhaFoto.id;

  const agendamento = await servico.query<{ id: string }>(
    `insert into agendamento (clinica_id, unidade_id, paciente_id, profissional_id, procedimento_id, inicio, fim, criado_por)
     values ($1, $2, $3, $4, $5, now(), now() + interval '30 minutes', $6) returning id`,
    [CLINICA_VIS, linhaUnidade.id, pacienteId, profissionalResponsavelId, linhaProcedimento.id, usuarioResponsavelId],
  );
  const linhaAgendamento = agendamento.rows[0];
  if (!linhaAgendamento) throw new Error("falha ao semear agendamento");
  agendamentoId = linhaAgendamento.id;

  const recebimento = await servico.query<{ id: string }>(
    `insert into recebimento (clinica_id, atendimento_id, valor, forma_pagamento, recebido_por)
     values ($1, $2, 100, 'pix', $3) returning id`,
    [CLINICA_VIS, atendimentoId, usuarioResponsavelId],
  );
  const linhaRecebimento = recebimento.rows[0];
  if (!linhaRecebimento) throw new Error("falha ao semear recebimento");
  recebimentoId = linhaRecebimento.id;
});

afterAll(async () => {
  // Ordem importa: FKs para clinica (e entre si) não têm cascade. Filhos
  // antes de pais, sempre.
  await servico.query("delete from recebimento where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from foto where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from medida where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from evolucao where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from ficha where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from atendimento where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from agendamento where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from paciente_acesso_autorizado where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from paciente where clinica_id = $1", [CLINICA_VIS]);
  await servico.query(
    `delete from ficha_template_versao
     where ficha_template_id in (select id from ficha_template where clinica_id = $1)`,
    [CLINICA_VIS],
  );
  await servico.query("delete from ficha_template where clinica_id = $1", [CLINICA_VIS]);
  await servico.query(
    `delete from procedimento_conselho_autorizado
     where procedimento_id in (select id from procedimento where clinica_id = $1)`,
    [CLINICA_VIS],
  );
  await servico.query("delete from procedimento where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from pose where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from profissional where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from membro where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from unidade where clinica_id = $1", [CLINICA_VIS]);
  await servico.query("delete from politica_visibilidade_paciente where clinica_id = $1", [
    CLINICA_VIS,
  ]);
  await servico.query("delete from clinica where id = $1", [CLINICA_VIS]);

  await servico?.end();
  await app?.end();
});

/** Ajusta o modo da política e a presença do grant explícito para `profissionalOutroId`. */
async function prepararCenario(modo: Modo, concederGrantAoOutro: boolean): Promise<void> {
  await servico.query("update politica_visibilidade_paciente set modo = $1 where clinica_id = $2", [
    modo,
    CLINICA_VIS,
  ]);
  if (concederGrantAoOutro) {
    await servico.query(
      `insert into paciente_acesso_autorizado (clinica_id, paciente_id, profissional_id, autorizado_por)
       values ($1, $2, $3, $4)
       on conflict (paciente_id, profissional_id) do nothing`,
      [CLINICA_VIS, pacienteId, profissionalOutroId, usuarioResponsavelId],
    );
  } else {
    await servico.query(
      "delete from paciente_acesso_autorizado where paciente_id = $1 and profissional_id = $2",
      [pacienteId, profissionalOutroId],
    );
  }
}

/**
 * Roda como `app_user` (NUNCA o role de serviço — que tem BYPASSRLS e faria
 * qualquer cenário "passar" sem testar nada), dentro de transação, com as
 * duas variáveis de sessão que `app_paciente_visivel` depende: clinica_id
 * (contexto de tenant) e usuario_id (resolve o profissional chamador).
 */
async function comoUsuario<T>(usuarioId: string, sql: string, params: unknown[] = []) {
  await app.query("begin");
  await app.query(
    "select set_config('app.clinica_id', $1, true), set_config('app.usuario_id', $2, true)",
    [CLINICA_VIS, usuarioId],
  );
  try {
    return await app.query<T extends object ? T : never>(sql, params);
  } finally {
    await app.query("rollback");
  }
}

/** Asserção 1 do par exigido por cenário: chama a função diretamente. */
async function funcaoDiz(usuarioId: string, escopo: "clinico" | "agenda_financeiro"): Promise<boolean> {
  const r = await comoUsuario<{ visivel: boolean }>(
    usuarioId,
    "select app_paciente_visivel($1, $2) as visivel",
    [pacienteId, escopo],
  );
  return r.rows[0]?.visivel ?? false;
}

/**
 * Asserção 2 do par exigido por cenário: um select real numa tabela
 * protegida pela policy — prova que a policy USA a função, não só que a
 * função devolve o booleano certo.
 */
async function linhaAparece(usuarioId: string, tabela: string, id: string): Promise<boolean> {
  const r = await comoUsuario(usuarioId, `select id from ${tabela} where id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

async function verificarCenario(params: {
  modo: Modo;
  usuarioId: string;
  concederGrant: boolean;
  esperaClinico: boolean;
  esperaAgendaFinanceiro: boolean;
}): Promise<void> {
  const { modo, usuarioId, concederGrant, esperaClinico, esperaAgendaFinanceiro } = params;
  await prepararCenario(modo, concederGrant);

  // asserção 1: a função, diretamente, nos dois escopos
  expect(await funcaoDiz(usuarioId, "clinico")).toBe(esperaClinico);
  expect(await funcaoDiz(usuarioId, "agenda_financeiro")).toBe(esperaAgendaFinanceiro);

  // asserção 2: select real — paciente (escopo clínico) e agendamento (escopo agenda/financeiro)
  expect(await linhaAparece(usuarioId, "paciente", pacienteId)).toBe(esperaClinico);
  expect(await linhaAparece(usuarioId, "agendamento", agendamentoId)).toBe(esperaAgendaFinanceiro);
}

describe("matriz de visibilidade de paciente — modo × relação × grant (RF-010)", () => {
  it("aberto — profissional responsável: vê nos dois escopos", () =>
    verificarCenario({
      modo: "aberto",
      usuarioId: usuarioResponsavelId,
      concederGrant: false,
      esperaClinico: true,
      esperaAgendaFinanceiro: true,
    }));

  it("aberto — profissional não responsável, sem grant: vê nos dois escopos", () =>
    verificarCenario({
      modo: "aberto",
      usuarioId: usuarioOutroId,
      concederGrant: false,
      esperaClinico: true,
      esperaAgendaFinanceiro: true,
    }));

  it("isolado — profissional responsável: vê nos dois escopos", () =>
    verificarCenario({
      modo: "isolado",
      usuarioId: usuarioResponsavelId,
      concederGrant: false,
      esperaClinico: true,
      esperaAgendaFinanceiro: true,
    }));

  it("isolado — profissional não responsável, sem grant: NÃO vê em nenhum escopo", () =>
    verificarCenario({
      modo: "isolado",
      usuarioId: usuarioOutroId,
      concederGrant: false,
      esperaClinico: false,
      esperaAgendaFinanceiro: false,
    }));

  it("isolado — profissional não responsável, com grant: vê nos dois escopos", () =>
    verificarCenario({
      modo: "isolado",
      usuarioId: usuarioOutroId,
      concederGrant: true,
      esperaClinico: true,
      esperaAgendaFinanceiro: true,
    }));

  it("restrito — profissional responsável: vê nos dois escopos", () =>
    verificarCenario({
      modo: "restrito",
      usuarioId: usuarioResponsavelId,
      concederGrant: false,
      esperaClinico: true,
      esperaAgendaFinanceiro: true,
    }));

  it("restrito — profissional não responsável, sem grant: NÃO vê o clínico, mas vê agenda/financeiro", () =>
    verificarCenario({
      modo: "restrito",
      usuarioId: usuarioOutroId,
      concederGrant: false,
      esperaClinico: false,
      esperaAgendaFinanceiro: true,
    }));

  it("restrito — profissional não responsável, com grant: vê nos dois escopos", () =>
    verificarCenario({
      modo: "restrito",
      usuarioId: usuarioOutroId,
      concederGrant: true,
      esperaClinico: true,
      esperaAgendaFinanceiro: true,
    }));
});

describe("as 8 policies paciente-scoped chamam a função (não só ela responde certo) — RF-010", () => {
  // Modo isolado, sem grant: o cenário onde a matriz acima exige "não vê".
  // Se uma policy esquecer de chamar app_paciente_visivel, é aqui que aparece
  // — a suíte acima nunca tocaria ficha/evolucao/medida/foto/recebimento.
  beforeAll(async () => {
    await prepararCenario("isolado", false);
  });

  const tabelas: Array<{ nome: string; id: () => string }> = [
    { nome: "paciente", id: () => pacienteId },
    { nome: "atendimento", id: () => atendimentoId },
    { nome: "ficha", id: () => fichaId },
    { nome: "evolucao", id: () => evolucaoId },
    { nome: "medida", id: () => medidaId },
    { nome: "foto", id: () => fotoId },
    { nome: "agendamento", id: () => agendamentoId },
    { nome: "recebimento", id: () => recebimentoId },
  ];

  it.each(tabelas)(
    "$nome: responsável vê (controle positivo) e o outro profissional não vê",
    async ({ nome, id }) => {
      expect(await linhaAparece(usuarioResponsavelId, nome, id())).toBe(true);
      expect(await linhaAparece(usuarioOutroId, nome, id())).toBe(false);
    },
  );
});
