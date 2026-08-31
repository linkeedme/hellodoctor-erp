import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import pg from "pg";

const URL_SERVICO = process.env.DATABASE_URL_SERVICO;
if (!URL_SERVICO) {
  throw new Error(
    "DATABASE_URL_SERVICO não definida. Suba o banco com `npm run db:efemero` " +
      "e exporte as variáveis antes de rodar os testes. Este teste NÃO pula: " +
      "uma suíte de segurança que some sozinha é pior do que uma que falha.",
  );
}

// lib/auth/consultas.ts importa db/onboarding.ts, que começa com
// `import "server-only"`. Fora do bundler do Next não existe a condição de
// export "react-server" que o Next injeta só no grafo do servidor, então o
// pacote lança incondicionalmente. Mockamos como no-op para exercitar o
// código real aqui no Vitest — mesmo padrão de tests/rls-smoke/com-clinica.test.ts.
vi.mock("server-only", () => ({}));

const { resolverUsuarioPorAuthId, resolverClinicasDoUsuario, resolverPapel } = await import(
  "@/lib/auth/consultas"
);

let servico: pg.Client;
const CLINICA = "33333333-3333-3333-3333-333333333333";
const AUTH_COM = "auth-provider-com-clinica";
const AUTH_SEM = "auth-provider-sem-clinica";
let usuarioComId = "";
let usuarioSemId = "";
let papelDonaId = "";

beforeAll(async () => {
  servico = new pg.Client({ connectionString: URL_SERVICO });
  await servico.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj)
     values ($1, 'Clinica Sessao', '33333333000191')
     on conflict (id) do nothing`,
    [CLINICA],
  );

  const papel = await servico.query<{ id: string }>(
    `insert into papel (chave, nome) values ('dona', 'Dona da clínica')
     on conflict (chave) do update set nome = excluded.nome
     returning id`,
  );
  papelDonaId = papel.rows[0]?.id ?? "";

  const com = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Com Clinica', 'com@teste.local', $1)
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
    [AUTH_COM],
  );
  usuarioComId = com.rows[0]?.id ?? "";

  const sem = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Sem Clinica', 'sem@teste.local', $1)
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
    [AUTH_SEM],
  );
  usuarioSemId = sem.rows[0]?.id ?? "";

  await servico.query(
    `insert into membro (clinica_id, usuario_id, papel_id)
     values ($1, $2, $3)
     on conflict (clinica_id, usuario_id) do update set ativo = true`,
    [CLINICA, usuarioComId, papelDonaId],
  );
});

afterAll(async () => {
  await servico?.end();
});

describe("identidade vem do provedor externo", () => {
  it("resolve o usuário pelo auth_provider_id", async () => {
    const u = await resolverUsuarioPorAuthId(AUTH_COM);
    expect(u?.id).toBe(usuarioComId);
    expect(u?.email).toBe("com@teste.local");
  });

  it("devolve null para auth_provider_id desconhecido", async () => {
    expect(await resolverUsuarioPorAuthId("nao-existe")).toBeNull();
  });
});

describe("sessão exige membro ativo (RF-003)", () => {
  it("usuário com membro ativo recebe a clínica", async () => {
    const clinicas = await resolverClinicasDoUsuario(usuarioComId);
    expect(clinicas).toHaveLength(1);
    expect(clinicas[0]?.id).toBe(CLINICA);
  });

  it("usuário sem membro não recebe nenhuma clínica", async () => {
    expect(await resolverClinicasDoUsuario(usuarioSemId)).toHaveLength(0);
  });

  it("membro inativo não conta como clínica disponível", async () => {
    await servico.query("update membro set ativo = false where usuario_id = $1", [usuarioComId]);
    expect(await resolverClinicasDoUsuario(usuarioComId)).toHaveLength(0);
    await servico.query("update membro set ativo = true where usuario_id = $1", [usuarioComId]);
  });

  it("clínica inativa não conta como disponível", async () => {
    await servico.query("update clinica set ativa = false where id = $1", [CLINICA]);
    expect(await resolverClinicasDoUsuario(usuarioComId)).toHaveLength(0);
    await servico.query("update clinica set ativa = true where id = $1", [CLINICA]);
  });
});

describe("papel vem por FK, não por string", () => {
  it("resolve chave e nome do papel do membro", async () => {
    const papel = await resolverPapel(usuarioComId, CLINICA);
    expect(papel?.chave).toBe("dona");
    expect(papel?.nome).toBe("Dona da clínica");
  });

  it("devolve null para usuário sem membro naquela clínica", async () => {
    expect(await resolverPapel(usuarioSemId, CLINICA)).toBeNull();
  });
});
