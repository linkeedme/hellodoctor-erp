import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { sql } from "kysely";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` e exporte as variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha é pior do que uma que falha.",
  );
}

// db/client.ts começa com `import "server-only"`. Fora do bundler do Next
// (que injeta a condição de export "react-server" só no grafo do servidor),
// esse import lança incondicionalmente — ver tests/lint/barreira-server-only.test.ts,
// que prova exatamente esse throw. Aqui queremos o oposto: exercitar a
// função real db/client.ts::comClinica() dentro do Vitest, então mockamos
// "server-only" como no-op, do mesmo jeito que a condição "react-server" do
// Next resolveria. Isto não enfraquece a barreira: quem prova que ela existe
// é o outro teste, que roda sem este mock.
vi.mock("server-only", () => ({}));

const { comClinica, db } = await import("../../db/client");

// CLINICA_C tinha o mesmo id+cnpj de tests/rls-smoke/sessao.test.ts. O
// arbiter do ON CONFLICT abaixo é a coluna `id`; se as duas transações
// concorrentes colidem primeiro no índice de `cnpj` (constraint
// clinica_cnpj_unico), o erro escapa do ON CONFLICT e propaga — já causou
// falha intermitente com os dois arquivos rodando em paralelo no Vitest.
const CLINICA_C = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const CLINICA_D = "44444444-4444-4444-4444-444444444444";
const CLINICA_INEXISTENTE = "99999999-9999-9999-9999-999999999999";
const USUARIO_1 = "55555555-5555-5555-5555-555555555555";

let servico: pg.Client;

beforeAll(async () => {
  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();
  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values
       ($1, 'Clinica C', '99999999000191'),
       ($2, 'Clinica D', '44444444000191')
     on conflict (id) do nothing`,
    [CLINICA_C, CLINICA_D],
  );
});

afterAll(async () => {
  await servico?.end();
  await db.destroy();
});

describe("comClinica() — wrapper Kysely real (RF-001, RF-002)", () => {
  it("lê a própria clínica e não lê a de outro tenant", async () => {
    const vistas = await comClinica(
      { clinicaId: CLINICA_C, usuarioId: USUARIO_1 },
      (trx) =>
        trx
          .selectFrom("clinica")
          .select("id")
          .where("id", "in", [CLINICA_C, CLINICA_D])
          .execute(),
    );
    const ids = vistas.map((v) => v.id);
    expect(ids).toContain(CLINICA_C);
    expect(ids).not.toContain(CLINICA_D);
  });

  it("duas chamadas sequenciais com clínicas diferentes não vazam uma pra outra", async () => {
    const idsC = (
      await comClinica({ clinicaId: CLINICA_C, usuarioId: USUARIO_1 }, (trx) =>
        trx.selectFrom("clinica").select("id").execute(),
      )
    ).map((r) => r.id);
    expect(idsC).toEqual([CLINICA_C]);

    const idsD = (
      await comClinica({ clinicaId: CLINICA_D, usuarioId: USUARIO_1 }, (trx) =>
        trx.selectFrom("clinica").select("id").execute(),
      )
    ).map((r) => r.id);
    expect(idsD).toEqual([CLINICA_D]);

    // A checagem acima sozinha passaria mesmo com set_config(..., false):
    // cada chamada de comClinica seta seu próprio clinica_id logo no início
    // da transação, então ela sempre sobrescreve o que sobrou da chamada
    // anterior. O que expõe o escopo errado é o que sobra DEPOIS que a
    // transação já terminou: com o terceiro parâmetro `true` (escopo de
    // transação), o COMMIT desfaz o set_config — uma query fora de
    // comClinica(), na mesma conexão do pool, não deve mais enxergar
    // clinica_id nenhum. Com `false` (escopo de sessão), o valor da última
    // chamada vazaria para fora do wrapper.
    const residual = await sql<{ valor: string | null }>`
      select current_setting('app.clinica_id', true) as valor
    `.execute(db);
    expect(residual.rows[0]?.valor ?? "").toBe("");
  });

  it("app_usuario_id() também retorna o valor setado dentro da transação", async () => {
    const usuarioVisto = await comClinica(
      { clinicaId: CLINICA_C, usuarioId: USUARIO_1 },
      async (trx) => {
        const r = await sql<{ usuario_id: string | null }>`
          select app_usuario_id() as usuario_id
        `.execute(trx);
        return r.rows[0]?.usuario_id ?? null;
      },
    );
    expect(usuarioVisto).toBe(USUARIO_1);
  });

  it("clinicaId inexistente não enxerga nenhuma clínica (falha fechada, não erro silencioso)", async () => {
    const vistas = await comClinica(
      { clinicaId: CLINICA_INEXISTENTE, usuarioId: USUARIO_1 },
      (trx) => trx.selectFrom("clinica").selectAll().execute(),
    );
    expect(vistas).toHaveLength(0);
  });
});
