import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` e exporte as variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha é pior do que uma que falha.",
  );
}

// db/client.ts começa com `import "server-only"` — mesmo padrão de
// tests/rls-smoke/com-clinica.test.ts: mockamos pra exercitar comClinica()
// de verdade fora do bundler do Next.
vi.mock("server-only", () => ({}));

const { comClinica, db } = await import("../../db/client");

const CLINICA_A = "b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6b6";
const CLINICA_B = "c7c7c7c7-c7c7-c7c7-c7c7-c7c7c7c7c7c7";
const USUARIO = "d8d8d8d8-d8d8-d8d8-d8d8-d8d8d8d8d8d8";

let servico: pg.Client;
let pacienteA = "";
let pacienteB = "";
let termoA = "";
let termoB = "";
let termoVersaoA = "";
let termoVersaoB = "";
let consentimentoA = "";
let consentimentoB = "";

beforeAll(async () => {
  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values
       ($1, 'Clinica Consentimento A', '20202020000191'),
       ($2, 'Clinica Consentimento B', '30303030000191')
     on conflict (id) do nothing`,
    [CLINICA_A, CLINICA_B],
  );

  const paciente = await servico.query<{ id: string; clinica_id: string }>(
    `insert into paciente (clinica_id, nome) values ($1, 'Paciente A'), ($2, 'Paciente B')
     returning id, clinica_id`,
    [CLINICA_A, CLINICA_B],
  );
  pacienteA = paciente.rows.find((p) => p.clinica_id === CLINICA_A)?.id ?? "";
  pacienteB = paciente.rows.find((p) => p.clinica_id === CLINICA_B)?.id ?? "";
  if (!pacienteA || !pacienteB) throw new Error("falha ao semear pacientes");

  const termo = await servico.query<{ id: string; clinica_id: string }>(
    `insert into termo (clinica_id, finalidade, nome) values
       ($1, 'tratamento_clinico', 'Termo A'),
       ($2, 'tratamento_clinico', 'Termo B')
     returning id, clinica_id`,
    [CLINICA_A, CLINICA_B],
  );
  termoA = termo.rows.find((t) => t.clinica_id === CLINICA_A)?.id ?? "";
  termoB = termo.rows.find((t) => t.clinica_id === CLINICA_B)?.id ?? "";
  if (!termoA || !termoB) throw new Error("falha ao semear termos");

  const versao = await servico.query<{ id: string; termo_id: string }>(
    `insert into termo_versao (termo_id, texto, hash_conteudo) values
       ($1, 'Texto A', 'hash-a'),
       ($2, 'Texto B', 'hash-b')
     returning id, termo_id`,
    [termoA, termoB],
  );
  termoVersaoA = versao.rows.find((v) => v.termo_id === termoA)?.id ?? "";
  termoVersaoB = versao.rows.find((v) => v.termo_id === termoB)?.id ?? "";
  if (!termoVersaoA || !termoVersaoB) throw new Error("falha ao semear versões de termo");

  const consentimento = await servico.query<{ id: string; clinica_id: string }>(
    `insert into consentimento (clinica_id, paciente_id, finalidade, ancora_tipo, ancora_id, termo_versao_id) values
       ($1, $2, 'tratamento_clinico', 'paciente', $2, $3),
       ($4, $5, 'tratamento_clinico', 'paciente', $5, $6)
     returning id, clinica_id`,
    [CLINICA_A, pacienteA, termoVersaoA, CLINICA_B, pacienteB, termoVersaoB],
  );
  consentimentoA = consentimento.rows.find((c) => c.clinica_id === CLINICA_A)?.id ?? "";
  consentimentoB = consentimento.rows.find((c) => c.clinica_id === CLINICA_B)?.id ?? "";
  if (!consentimentoA || !consentimentoB) throw new Error("falha ao semear consentimentos");
});

afterAll(async () => {
  await servico.query("delete from consentimento where clinica_id = any($1)", [
    [CLINICA_A, CLINICA_B],
  ]);
  await servico.query("delete from termo_versao where termo_id = any($1)", [[termoA, termoB]]);
  await servico.query("delete from termo where clinica_id = any($1)", [[CLINICA_A, CLINICA_B]]);
  await servico.query("delete from paciente where clinica_id = any($1)", [
    [CLINICA_A, CLINICA_B],
  ]);
  await servico?.end();
  await db.destroy();
});

describe("isolamento de tenant — termo/termo_versao/consentimento (RF-007/RNF-012)", () => {
  it("clínica A enxerga seu próprio termo e não o de B", async () => {
    const vistos = await comClinica({ clinicaId: CLINICA_A, usuarioId: USUARIO }, (trx) =>
      trx.selectFrom("termo").select("id").where("id", "in", [termoA, termoB]).execute(),
    );
    const ids = vistos.map((v) => v.id);
    expect(ids).toContain(termoA);
    expect(ids).not.toContain(termoB);
  });

  it("clínica A enxerga sua própria termo_versao e não a de B (policy via EXISTS no termo pai)", async () => {
    const vistos = await comClinica({ clinicaId: CLINICA_A, usuarioId: USUARIO }, (trx) =>
      trx
        .selectFrom("termo_versao")
        .select("id")
        .where("id", "in", [termoVersaoA, termoVersaoB])
        .execute(),
    );
    const ids = vistos.map((v) => v.id);
    expect(ids).toContain(termoVersaoA);
    expect(ids).not.toContain(termoVersaoB);
  });

  it("clínica A enxerga seu próprio consentimento e não o de B", async () => {
    const vistos = await comClinica({ clinicaId: CLINICA_A, usuarioId: USUARIO }, (trx) =>
      trx
        .selectFrom("consentimento")
        .select("id")
        .where("id", "in", [consentimentoA, consentimentoB])
        .execute(),
    );
    const ids = vistos.map((v) => v.id);
    expect(ids).toContain(consentimentoA);
    expect(ids).not.toContain(consentimentoB);
  });

  it("clínica A não consegue revogar (UPDATE) o consentimento de B — RLS nega a linha, não é erro nem sucesso silencioso", async () => {
    const resultado = await comClinica({ clinicaId: CLINICA_A, usuarioId: USUARIO }, (trx) =>
      trx
        .updateTable("consentimento")
        .set({ revogado_em: new Date() })
        .where("id", "=", consentimentoB)
        .executeTakeFirst(),
    );
    expect(Number(resultado.numUpdatedRows)).toBe(0);

    const linhaReal = await servico.query<{ revogado_em: Date | null }>(
      "select revogado_em from consentimento where id = $1",
      [consentimentoB],
    );
    expect(linhaReal.rows[0]?.revogado_em).toBeNull();
  });
});
