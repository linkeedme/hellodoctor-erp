import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` " +
      "e exporte as variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha é " +
      "pior do que uma que falha.",
  );
}

// modules/adm/consentimento.ts importa db/com-sessao.ts, que começa com
// `import "server-only"` e importa lib/auth/sessao.ts (next/headers,
// next/navigation). Fora do bundler do Next isso lança incondicionalmente —
// mesmo padrão de tests/rls-smoke/adm-cadastros.test.ts.
vi.mock("server-only", () => ({}));

const CLINICA = "a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5";

const sessaoFalsa = {
  usuarioId: "",
  clinicaId: CLINICA,
  papelChave: "dona",
  clinicasDisponiveis: [{ id: CLINICA, razaoSocial: "Clinica Consentimento" }],
};

vi.mock("@/lib/auth/sessao", () => ({
  exigirSessao: async () => sessaoFalsa,
}));

// `comServico`/`comClinica` só são importáveis em db/, scripts/ e tests/
// (regra de lint local/sem-conexao-privilegiada-fora-de-infra) — este
// arquivo mora em modules/, então a fixture usa `pg` direto, igual
// modules/cat/__tests__/escopo.test.ts.
const { semearPapeisEPermissoes } = await import("@/db/seed/papeis-permissoes");
const { registrarConsentimento, revogarConsentimento, consentimentoVigente } = await import(
  "@/modules/adm/consentimento"
);

let servico: pg.Client;

async function criarPaciente(nome: string): Promise<string> {
  const id = randomUUID();
  await servico.query("insert into paciente (id, clinica_id, nome) values ($1, $2, $3)", [
    id,
    CLINICA,
    nome,
  ]);
  return id;
}

beforeAll(async () => {
  await semearPapeisEPermissoes();

  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values ($1, 'Clinica Consentimento', '10101010000191')
     on conflict (id) do nothing`,
    [CLINICA],
  );

  const u = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Usuario Consentimento', 'consentimento@teste.local', 'auth-consentimento')
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
  );
  const linha = u.rows[0];
  if (!linha) throw new Error("falha ao semear usuario");
  sessaoFalsa.usuarioId = linha.id;
});

afterAll(async () => {
  // consentimento/termo_versao/termo/paciente não são append-only — dá pra
  // limpar de verdade. `clinica` fica de fora de propósito: a partir do
  // primeiro registrarConsentimento desta suíte, `evento_auditoria`
  // referencia esta clínica (FK sem cascade, tabela append-only), então ela
  // nunca mais pode ser apagada — mesmo padrão de tests/rls-smoke/auditoria.test.ts
  // e tests/rls-smoke/adm-cadastros.test.ts.
  await servico.query("delete from consentimento where clinica_id = $1", [CLINICA]);
  await servico.query(
    "delete from termo_versao where termo_id in (select id from termo where clinica_id = $1)",
    [CLINICA],
  );
  await servico.query("delete from termo where clinica_id = $1", [CLINICA]);
  await servico.query("delete from paciente where clinica_id = $1", [CLINICA]);
  await servico?.end();
});

describe("consentimento — as 6 regras da seção 11.10 (RF-007)", () => {
  it("regra 1: a identidade é finalidade × ancora × versao do termo — mudar só a finalidade já é outro consentimento", async () => {
    const pacienteId = await criarPaciente("Paciente Regra 1");

    await registrarConsentimento({
      pacienteId,
      finalidade: "tratamento_clinico",
      nomeTermo: "Termo Regra 1 Tratamento",
      texto: "Texto de tratamento",
      ancoraTipo: "paciente",
      ancoraId: pacienteId,
    });
    await registrarConsentimento({
      pacienteId,
      finalidade: "uso_externo_marketing",
      nomeTermo: "Termo Regra 1 Marketing",
      texto: "Texto de marketing",
      ancoraTipo: "paciente",
      ancoraId: pacienteId,
    });

    const tratamento = await consentimentoVigente(pacienteId, "tratamento_clinico", "paciente", pacienteId);
    const marketing = await consentimentoVigente(pacienteId, "uso_externo_marketing", "paciente", pacienteId);
    const usoInterno = await consentimentoVigente(pacienteId, "uso_interno", "paciente", pacienteId);

    expect(tratamento).not.toBeNull();
    expect(marketing).not.toBeNull();
    expect(tratamento?.id).not.toBe(marketing?.id);
    // uso_interno nunca foi assinado nesta ancora — nenhum dos dois acima "empresta" pra ele.
    expect(usoInterno).toBeNull();
  });

  it("regra 2a: revogar marketing não afeta tratamento", async () => {
    const pacienteId = await criarPaciente("Paciente Regra 2a");
    await registrarConsentimento({
      pacienteId,
      finalidade: "tratamento_clinico",
      nomeTermo: "Termo Regra 2a Tratamento",
      texto: "Texto de tratamento",
      ancoraTipo: "paciente",
      ancoraId: pacienteId,
    });
    const marketing = await registrarConsentimento({
      pacienteId,
      finalidade: "uso_externo_marketing",
      nomeTermo: "Termo Regra 2a Marketing",
      texto: "Texto de marketing",
      ancoraTipo: "paciente",
      ancoraId: pacienteId,
    });

    await revogarConsentimento(marketing.id);

    expect(
      await consentimentoVigente(pacienteId, "tratamento_clinico", "paciente", pacienteId),
    ).not.toBeNull();
    expect(
      await consentimentoVigente(pacienteId, "uso_externo_marketing", "paciente", pacienteId),
    ).toBeNull();
  });

  it("regra 2b: revogar tratamento não afeta marketing (a mesma asserção, no sentido inverso)", async () => {
    const pacienteId = await criarPaciente("Paciente Regra 2b");
    const tratamento = await registrarConsentimento({
      pacienteId,
      finalidade: "tratamento_clinico",
      nomeTermo: "Termo Regra 2b Tratamento",
      texto: "Texto de tratamento",
      ancoraTipo: "paciente",
      ancoraId: pacienteId,
    });
    await registrarConsentimento({
      pacienteId,
      finalidade: "uso_externo_marketing",
      nomeTermo: "Termo Regra 2b Marketing",
      texto: "Texto de marketing",
      ancoraTipo: "paciente",
      ancoraId: pacienteId,
    });

    await revogarConsentimento(tratamento.id);

    expect(
      await consentimentoVigente(pacienteId, "uso_externo_marketing", "paciente", pacienteId),
    ).not.toBeNull();
    expect(
      await consentimentoVigente(pacienteId, "tratamento_clinico", "paciente", pacienteId),
    ).toBeNull();
  });

  it("regra 3: a versão assinada fica congelada — quando o termo evolui, a assinatura antiga não migra", async () => {
    const pacienteA = await criarPaciente("Paciente Regra 3 A");
    const pacienteB = await criarPaciente("Paciente Regra 3 B");
    const nomeTermo = "Termo Regra 3";

    const consentimentoA = await registrarConsentimento({
      pacienteId: pacienteA,
      finalidade: "tratamento_clinico",
      nomeTermo,
      texto: "Texto assinado em 2026",
      ancoraTipo: "paciente",
      ancoraId: pacienteA,
    });
    // Mesmo termo (nome + finalidade + clínica), texto novo: cria versão nova
    // em vez de reescrever a antiga.
    const consentimentoB = await registrarConsentimento({
      pacienteId: pacienteB,
      finalidade: "tratamento_clinico",
      nomeTermo,
      texto: "Texto revisado em 2027",
      ancoraTipo: "paciente",
      ancoraId: pacienteB,
    });

    expect(consentimentoA.termo_versao_id).not.toBe(consentimentoB.termo_versao_id);

    const versaoAntiga = await servico.query<{ texto: string; vigente_ate: Date | null }>(
      "select texto, vigente_ate from termo_versao where id = $1",
      [consentimentoA.termo_versao_id],
    );
    const linhaAntiga = versaoAntiga.rows[0];
    if (!linhaAntiga) throw new Error("versão antiga não encontrada");
    // o texto de 2026 continua exatamente como foi assinado — só foi fechada
    // (vigente_ate preenchido), nunca reescrita.
    expect(linhaAntiga.texto).toBe("Texto assinado em 2026");
    expect(linhaAntiga.vigente_ate).not.toBeNull();

    const versaoNova = await servico.query<{ texto: string; vigente_ate: Date | null }>(
      "select texto, vigente_ate from termo_versao where id = $1",
      [consentimentoB.termo_versao_id],
    );
    const linhaNova = versaoNova.rows[0];
    if (!linhaNova) throw new Error("versão nova não encontrada");
    expect(linhaNova.texto).toBe("Texto revisado em 2027");
    expect(linhaNova.vigente_ate).toBeNull();

    // a assinatura de A continua apontando pra versão de 2026, não pra vigente.
    const linhaConsentimentoA = await servico.query<{ termo_versao_id: string }>(
      "select termo_versao_id from consentimento where id = $1",
      [consentimentoA.id],
    );
    expect(linhaConsentimentoA.rows[0]?.termo_versao_id).toBe(consentimentoA.termo_versao_id);
  });

  it("regra 4: consentimento revogado não conta como vigente", async () => {
    const pacienteId = await criarPaciente("Paciente Regra 4");
    const consentimento = await registrarConsentimento({
      pacienteId,
      finalidade: "tratamento_clinico",
      nomeTermo: "Termo Regra 4",
      texto: "Texto",
      ancoraTipo: "paciente",
      ancoraId: pacienteId,
    });

    expect(
      await consentimentoVigente(pacienteId, "tratamento_clinico", "paciente", pacienteId),
    ).not.toBeNull();

    await revogarConsentimento(consentimento.id);

    expect(
      await consentimentoVigente(pacienteId, "tratamento_clinico", "paciente", pacienteId),
    ).toBeNull();

    // a linha nunca foi apagada — as duas datas ficam registradas como prova.
    const linha = await servico.query<{ assinado_em: Date; revogado_em: Date | null }>(
      "select assinado_em, revogado_em from consentimento where id = $1",
      [consentimento.id],
    );
    expect(linha.rows[0]?.assinado_em).toBeTruthy();
    expect(linha.rows[0]?.revogado_em).not.toBeNull();
  });

  it("regra 5: consentimento de outra ancora não vale para esta — assinar um atendimento não autoriza outro", async () => {
    const pacienteId = await criarPaciente("Paciente Regra 5");
    const atendimentoAssinado = randomUUID();
    const outroAtendimento = randomUUID();

    await registrarConsentimento({
      pacienteId,
      finalidade: "tratamento_clinico",
      nomeTermo: "Termo Regra 5",
      texto: "Texto",
      ancoraTipo: "atendimento",
      ancoraId: atendimentoAssinado,
    });

    expect(
      await consentimentoVigente(pacienteId, "tratamento_clinico", "atendimento", atendimentoAssinado),
    ).not.toBeNull();
    expect(
      await consentimentoVigente(pacienteId, "tratamento_clinico", "atendimento", outroAtendimento),
    ).toBeNull();
  });

  it("regra 6: hash_conteudo bate com o texto — alterar o texto por fora torna a violação detectável", async () => {
    const pacienteId = await criarPaciente("Paciente Regra 6");
    const consentimento = await registrarConsentimento({
      pacienteId,
      finalidade: "tratamento_clinico",
      nomeTermo: "Termo Regra 6",
      texto: "Texto original assinado pelo paciente",
      ancoraTipo: "paciente",
      ancoraId: pacienteId,
    });

    // Recalcula com o próprio algoritmo documentado (sha256 hex do texto),
    // sem importar nada de modules/adm/consentimento.ts: o critério é o
    // contrato de domínio, não a implementação.
    const antes = await servico.query<{ texto: string; hash_conteudo: string }>(
      "select texto, hash_conteudo from termo_versao where id = $1",
      [consentimento.termo_versao_id],
    );
    const linhaAntes = antes.rows[0];
    if (!linhaAntes) throw new Error("versão não encontrada");
    expect(createHash("sha256").update(linhaAntes.texto, "utf8").digest("hex")).toBe(
      linhaAntes.hash_conteudo,
    );

    // Simula alguém alterando o texto direto no banco, por fora do fluxo
    // (registrarConsentimento nunca faz isso — sempre recalcula o hash).
    await servico.query("update termo_versao set texto = $1 where id = $2", [
      "Texto adulterado depois da assinatura",
      consentimento.termo_versao_id,
    ]);

    const depois = await servico.query<{ texto: string; hash_conteudo: string }>(
      "select texto, hash_conteudo from termo_versao where id = $1",
      [consentimento.termo_versao_id],
    );
    const linhaDepois = depois.rows[0];
    if (!linhaDepois) throw new Error("versão não encontrada");
    expect(createHash("sha256").update(linhaDepois.texto, "utf8").digest("hex")).not.toBe(
      linhaDepois.hash_conteudo,
    );
  });
});
