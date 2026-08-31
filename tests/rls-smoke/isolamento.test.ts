import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` e exporte as variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha é pior do que uma que falha.",
  );
}

const URL_SERVICO = process.env.DATABASE_URL_SERVICO ?? "";
const URL_APP = process.env.DATABASE_URL ?? "";

let servico: pg.Client;
let app: pg.Client;
const CLINICA_A = "11111111-1111-1111-1111-111111111111";
const CLINICA_B = "22222222-2222-2222-2222-222222222222";

beforeAll(async () => {
  servico = new pg.Client({ connectionString: URL_SERVICO });
  await servico.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values
       ($1, 'Clinica A', '11111111000191'),
       ($2, 'Clinica B', '22222222000191')
     on conflict (id) do nothing`,
    [CLINICA_A, CLINICA_B],
  );

  app = new pg.Client({ connectionString: URL_APP });
  await app.connect();
});

afterAll(async () => {
  await servico?.end();
  await app?.end();
});

async function comoClinica<T>(clinicaId: string, sql: string, params: unknown[] = []) {
  await app.query("begin");
  await app.query("select set_config('app.clinica_id', $1, true)", [clinicaId]);
  try {
    return await app.query<T extends object ? T : never>(sql, params);
  } finally {
    await app.query("rollback");
  }
}

describe("isolamento entre clínicas (RF-001)", () => {
  it("não lê clínica de outro tenant", async () => {
    const r = await comoClinica(CLINICA_A, "select id from clinica where id = $1", [CLINICA_B]);
    expect(r.rowCount).toBe(0);
  });

  it("lê a própria clínica", async () => {
    const r = await comoClinica(CLINICA_A, "select id from clinica where id = $1", [CLINICA_A]);
    expect(r.rowCount).toBe(1);
  });

  it("não atualiza dado de outro tenant", async () => {
    const r = await comoClinica(
      CLINICA_A,
      "update clinica set razao_social = 'invadida' where id = $1",
      [CLINICA_B],
    );
    expect(r.rowCount).toBe(0);
  });

  it("não apaga dado de outro tenant", async () => {
    const r = await comoClinica(CLINICA_A, "delete from clinica where id = $1", [CLINICA_B]);
    expect(r.rowCount).toBe(0);
  });
});

describe("auditoria imutável (RF-006)", () => {
  // Os triggers bloqueia_update/bloqueia_delete são FOR EACH ROW: numa tabela
  // vazia eles NÃO disparam e o comando retorna sucesso com 0 linhas. Semear
  // uma linha antes é obrigatório — sem isso o teste falha por motivo errado.
  beforeAll(async () => {
    await servico.query(
      `insert into evento_auditoria (clinica_id, acao, entidade)
       values ($1, 'leitura', 'paciente')`,
      [CLINICA_A],
    );
  });

  it("recusa UPDATE em evento_auditoria", async () => {
    await expect(
      servico.query("update evento_auditoria set acao = 'adulterado' where true"),
    ).rejects.toThrow(/append-only/);
  });

  it("recusa DELETE em evento_auditoria", async () => {
    await expect(
      servico.query("delete from evento_auditoria where true"),
    ).rejects.toThrow(/append-only/);
  });
});
