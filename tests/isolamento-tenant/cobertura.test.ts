import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { TABELAS_DOMINIO, TABELAS_PLATAFORMA } from "./manifesto";

if (!process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL_SERVICO precisa estar definida. Rode `npm run db:efemero` e exporte as " +
      "variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha é pior do " +
      "que uma que falha.",
  );
}

let servico: pg.Client;

beforeAll(async () => {
  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();
});

afterAll(async () => {
  await servico?.end();
});

describe("cobertura do manifesto de isolamento (RNF-012)", () => {
  it("toda tabela do schema public está no manifesto de domínio ou na allowlist de plataforma", async () => {
    const resultado = await servico.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    const conhecidas = new Set<string>([...TABELAS_DOMINIO, ...TABELAS_PLATAFORMA]);
    const orfas = resultado.rows
      .map((linha) => linha.tablename)
      .filter((tabela) => !conhecidas.has(tabela));

    expect(
      orfas,
      orfas.length > 0
        ? `Tabela(s) sem cobertura de isolamento: ${orfas.join(", ")}. Adicione cada uma a ` +
          "tests/isolamento-tenant/manifesto.ts — na lista TABELAS_DOMINIO (se carrega " +
          "clinica_id e precisa de teste de isolamento) ou em TABELAS_PLATAFORMA (se é " +
          "legitimamente global, sem dado de clínica)."
        : undefined,
    ).toEqual([]);
  });
});

describe("toda tabela do manifesto tem RLS habilitado e ao menos uma policy (RNF-012)", () => {
  it.each(TABELAS_DOMINIO)("tabela '%s' tem RLS habilitado com policy", async (tabela) => {
    const rls = await servico.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname = $1 and relkind = 'r'",
      [tabela],
    );
    const linhaRls = rls.rows[0];
    expect(
      linhaRls?.relrowsecurity,
      `tabela '${tabela}' está no manifesto de domínio mas não tem RLS habilitado ` +
        `(alter table ${tabela} enable row level security)`,
    ).toBe(true);

    const policies = await servico.query<{ total: string }>(
      "select count(*)::text as total from pg_policies where schemaname = 'public' and tablename = $1",
      [tabela],
    );
    const total = Number(policies.rows[0]?.total ?? "0");
    expect(
      total,
      `tabela '${tabela}' tem RLS habilitado mas nenhuma policy — RLS sem policy nega tudo, ` +
        "o que passaria despercebido num teste de isolamento mas quebra a aplicação em silêncio",
    ).toBeGreaterThan(0);
  });
});
