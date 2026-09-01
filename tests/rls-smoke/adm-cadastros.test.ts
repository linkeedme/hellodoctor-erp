import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { ZodError } from "zod";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` e exporte as variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha é pior do que uma que falha.",
  );
}

// modules/adm/{onboarding,actions,queries}.ts começam com `import "server-only"`
// (ou importam módulos que começam) e importam lib/auth/sessao.ts (que toca
// next/headers e next/navigation). Fora do bundler do Next isso lança
// incondicionalmente — mesmo padrão de tests/rls-smoke/com-sessao.test.ts e
// tests/rls-smoke/autorizacao.test.ts.
vi.mock("server-only", () => ({}));

const CLINICA_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CLINICA_B = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const sessaoFalsa = {
  usuarioId: "",
  clinicaId: CLINICA_A,
  papelChave: "dona",
  clinicasDisponiveis: [] as { id: string; razaoSocial: string }[],
};

// exigirUsuarioAutenticado() é o que criarClinica() usa pra resolver quem é
// o chamador (achado 1 do fix round 1) — precisa do próprio mock, separado
// de sessaoFalsa, porque no onboarding real ainda não existe clínica ativa.
const usuarioAutenticadoFalso = { id: "", nome: "", email: "" };

vi.mock("@/lib/auth/sessao", () => ({
  exigirSessao: async () => sessaoFalsa,
  exigirUsuarioAutenticado: async () => usuarioAutenticadoFalso,
}));

const { semearPapeisEPermissoes } = await import("@/db/seed/papeis-permissoes");
const { PermissaoNegada } = await import("@/lib/autorizacao/verificar");
const { criarClinica, CnpjDuplicado } = await import("@/modules/adm/onboarding");
const { criarUnidade, adicionarMembro, registrarProfissional } = await import(
  "@/modules/adm/actions"
);
const { listarUnidades } = await import("@/modules/adm/queries");
const { EsquemaProfissional } = await import("@/modules/adm/schema");

let servico: pg.Client;
let usuarioId = "";
let usuarioVitimaId = "";
let membroClinicaA = "";
let membroClinicaB = "";

// regra 2 e regra 5 chamam criarClinica() de verdade (não são fixture de id
// fixo como CLINICA_A/B) — cada clínica criada entra aqui para ser desfeita
// no afterAll, senão rodar a suíte de novo esbarra no cnpj único que o
// próprio teste está provando.
const clinicasCriadasNoTeste: string[] = [];

async function contarUnidades(clinicaId: string): Promise<number> {
  const r = await servico.query<{ total: string }>(
    "select count(*)::text as total from unidade where clinica_id = $1",
    [clinicaId],
  );
  return Number(r.rows[0]?.total ?? "0");
}

beforeAll(async () => {
  await semearPapeisEPermissoes();

  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values
       ($1, 'Clinica Cadastros A', '10000000000191'),
       ($2, 'Clinica Cadastros B', '20000000000191')
     on conflict (id) do nothing`,
    [CLINICA_A, CLINICA_B],
  );

  const u = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Usuario Cadastros', 'cadastros@teste.local', 'auth-adm-cadastros')
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
  );
  const linhaUsuario = u.rows[0];
  if (!linhaUsuario) throw new Error("falha ao semear usuario");
  usuarioId = linhaUsuario.id;
  sessaoFalsa.usuarioId = usuarioId;
  usuarioAutenticadoFalso.id = usuarioId;
  usuarioAutenticadoFalso.nome = "Usuario Cadastros";
  usuarioAutenticadoFalso.email = "cadastros@teste.local";

  // "vítima" — alguém cujo usuario.id um payload malicioso poderia tentar
  // usar para roubar a identidade do primeiro membro no onboarding.
  const uVitima = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Usuario Vitima', 'vitima-cadastros@teste.local', 'auth-adm-cadastros-vitima')
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
  );
  const linhaVitima = uVitima.rows[0];
  if (!linhaVitima) throw new Error("falha ao semear usuario vitima");
  usuarioVitimaId = linhaVitima.id;

  const papel = await servico.query<{ id: string }>(
    "select id from papel where chave = 'profissional'",
  );
  const linhaPapel = papel.rows[0];
  if (!linhaPapel) throw new Error("papel 'profissional' não semeado");

  const membros = await servico.query<{ id: string; clinica_id: string }>(
    `insert into membro (clinica_id, usuario_id, papel_id) values
       ($1, $2, $3),
       ($4, $2, $3)
     on conflict (clinica_id, usuario_id) do update set papel_id = excluded.papel_id
     returning id, clinica_id`,
    [CLINICA_A, usuarioId, linhaPapel.id, CLINICA_B],
  );
  const membroA = membros.rows.find((m) => m.clinica_id === CLINICA_A);
  const membroB = membros.rows.find((m) => m.clinica_id === CLINICA_B);
  if (!membroA || !membroB) throw new Error("falha ao semear membros de teste");
  membroClinicaA = membroA.id;
  membroClinicaB = membroB.id;

  // profissional.membro_id é unique — sem isso, rodar a suíte de novo
  // esbarraria no profissional que "aceita registrar profissional..." criou
  // na rodada anterior.
  await servico.query("delete from profissional where membro_id = any($1)", [
    [membroClinicaA, membroClinicaB],
  ]);
});

afterAll(async () => {
  if (clinicasCriadasNoTeste.length > 0) {
    await servico.query("delete from profissional where clinica_id = any($1)", [
      clinicasCriadasNoTeste,
    ]);
    await servico.query("delete from membro where clinica_id = any($1)", [
      clinicasCriadasNoTeste,
    ]);
    await servico.query("delete from unidade where clinica_id = any($1)", [
      clinicasCriadasNoTeste,
    ]);
    await servico.query("delete from clinica where id = any($1)", [clinicasCriadasNoTeste]);
  }
  await servico?.end();
});

describe("regra 1 — CNPJ inválido é recusado pelo Zod, com mensagem legível", () => {
  it("recusa cnpj com menos de 14 dígitos, sem tocar o banco", async () => {
    await expect(
      criarClinica({
        clinica: { razaoSocial: "Clinica CNPJ Invalido", cnpj: "123" },
        nomeUnidadePrincipal: "Matriz",
      }),
    ).rejects.toThrow(/14 dígitos/);
  });
});

describe("regra 2 — CNPJ duplicado é recusado sem estouro não tratado", () => {
  it("segunda clínica com o mesmo cnpj recebe CnpjDuplicado, não erro cru do driver", async () => {
    const cnpj = "30000000000191";
    const primeira = await criarClinica({
      clinica: { razaoSocial: "Clinica Duplicada 1", cnpj },
      nomeUnidadePrincipal: "Matriz",
    });
    clinicasCriadasNoTeste.push(primeira.clinica.id);

    await expect(
      criarClinica({
        clinica: { razaoSocial: "Clinica Duplicada 2", cnpj },
        nomeUnidadePrincipal: "Matriz",
      }),
    ).rejects.toThrow(CnpjDuplicado);
  });
});

describe("regra 3 — Profissional sem vinculo é recusado", () => {
  it("EsquemaProfissional recusa entrada sem vinculo", () => {
    const resultado = EsquemaProfissional.safeParse({
      membroId: membroClinicaA,
      conselho: "CRM",
      numeroConselho: "12345",
      uf: "RJ",
      habilitacoes: [],
    });
    expect(resultado.success).toBe(false);
  });

  it("registrarProfissional recusa sem vinculo com ZodError (erro de validação, não falha de conexão)", async () => {
    sessaoFalsa.papelChave = "dona";
    sessaoFalsa.clinicaId = CLINICA_A;
    await expect(
      registrarProfissional({
        membroId: membroClinicaA,
        conselho: "CRM",
        numeroConselho: "12345",
        uf: "RJ",
        habilitacoes: [],
      }),
    ).rejects.toThrow(ZodError);
  });
});

describe("regra 4 — Profissional exige membro da mesma clínica", () => {
  it("recusa registrar profissional com membro de outra clínica", async () => {
    sessaoFalsa.papelChave = "dona";
    sessaoFalsa.clinicaId = CLINICA_A;

    await expect(
      registrarProfissional({
        membroId: membroClinicaB,
        conselho: "CRM",
        numeroConselho: "12345",
        uf: "RJ",
        habilitacoes: [],
        vinculo: "clt",
      }),
    ).rejects.toThrow(/Membro não encontrado/);
  });

  it("aceita registrar profissional com membro da própria clínica", async () => {
    sessaoFalsa.papelChave = "dona";
    sessaoFalsa.clinicaId = CLINICA_A;

    const profissional = await registrarProfissional({
      membroId: membroClinicaA,
      conselho: "CRM",
      numeroConselho: "999888",
      uf: "RJ",
      habilitacoes: [],
      vinculo: "clt",
    });
    expect(profissional.id).toBeTruthy();
  });
});

describe("regra 5 — criarClinica é o único caso legítimo de comServico", () => {
  it("cria a clínica mesmo com a sessão apontando pra outra clínica (comServico não depende de RLS/sessão)", async () => {
    sessaoFalsa.clinicaId = "00000000-0000-0000-0000-000000000000";
    const resultado = await criarClinica({
      clinica: { razaoSocial: "Clinica Via ComServico", cnpj: "40000000000191" },
      nomeUnidadePrincipal: "Matriz",
    });
    clinicasCriadasNoTeste.push(resultado.clinica.id);
    expect(resultado.clinica.cnpj).toBe("40000000000191");
    sessaoFalsa.clinicaId = CLINICA_A;
  });
});

describe("achado 1 (fix round 1) — criarClinica resolve o usuarioId do chamador autenticado, nunca do payload", () => {
  it("não cria clínica em nome de outro usuário: usuarioId do payload é ignorado, membro fica com o autenticado", async () => {
    const resultado = await criarClinica({
      // usuarioId não existe em EsquemaOnboarding — mesmo enviando o id de
      // outra pessoa aqui, quem deveria virar dona é usuarioAutenticadoFalso.
      usuarioId: usuarioVitimaId,
      clinica: { razaoSocial: "Clinica Identidade", cnpj: "50000000000191" },
      nomeUnidadePrincipal: "Matriz",
    });
    clinicasCriadasNoTeste.push(resultado.clinica.id);

    const linha = await servico.query<{ usuario_id: string }>(
      "select usuario_id from membro where id = $1",
      [resultado.membro.id],
    );
    expect(linha.rows[0]?.usuario_id).toBe(usuarioId);
    expect(linha.rows[0]?.usuario_id).not.toBe(usuarioVitimaId);
  });
});

describe("regra 6 — unidade e membro passam por exigirPermissao(adm, criar)", () => {
  it("criarUnidade recusa papel sem permissão, antes de qualquer query", async () => {
    sessaoFalsa.papelChave = "recepcao";
    sessaoFalsa.clinicaId = CLINICA_A;

    const antes = await contarUnidades(CLINICA_A);
    await expect(criarUnidade({ nome: "Unidade Nao Deveria Existir" })).rejects.toThrow(
      PermissaoNegada,
    );
    const depois = await contarUnidades(CLINICA_A);
    expect(depois).toBe(antes);
  });

  it("adicionarMembro recusa papel sem permissão, antes de qualquer query", async () => {
    sessaoFalsa.papelChave = "profissional";
    sessaoFalsa.clinicaId = CLINICA_A;

    await expect(
      adicionarMembro({ usuarioId, papelChave: "recepcao" }),
    ).rejects.toThrow(PermissaoNegada);
  });
});

describe("regra 7 — unidade criada numa sessão não aparece para outra clínica", () => {
  it("unidade da clínica A não aparece na listagem da clínica B", async () => {
    sessaoFalsa.papelChave = "dona";
    sessaoFalsa.clinicaId = CLINICA_A;
    const criada = await criarUnidade({ nome: "Unidade Isolamento A" });

    sessaoFalsa.clinicaId = CLINICA_B;
    const unidadesDeB = await listarUnidades();
    expect(unidadesDeB.map((u) => u.id)).not.toContain(criada.id);

    sessaoFalsa.clinicaId = CLINICA_A;
    const unidadesDeA = await listarUnidades();
    expect(unidadesDeA.map((u) => u.id)).toContain(criada.id);
  });
});
