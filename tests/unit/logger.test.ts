import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/observabilidade/logger.ts começa com `import "server-only"` e importa
// lib/auth/sessao.ts, que por sua vez importa next/headers e
// next/navigation — só resolvem dentro do bundler do Next. Mockamos
// "server-only" como no-op e substituímos `obterSessao` inteiro, mesmo
// padrão de tests/rls-smoke/com-sessao.test.ts. `obterSessaoMock` precisa
// vir de `vi.hoisted` porque a fábrica de `vi.mock` roda isolada do escopo
// do módulo — sem isso, o `vi.fn()` referenciado dentro dela não existiria
// ainda no momento em que o mock é registrado.
const { obterSessaoMock } = vi.hoisted(() => ({ obterSessaoMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ obterSessao: obterSessaoMock }));

const { log } = await import("@/lib/observabilidade/logger");

/**
 * Fix round 1, achado 3: esta lista é digitada aqui, literalmente — NÃO
 * importada de `lib/observabilidade/campos-proibidos.ts`. Um teste que
 * deriva o que testar da própria lista de produção só prova que a
 * implementação redige o que ela mesma diz que redige, nunca que ela
 * redige o que o domínio exige (foi assim que a lista incompleta do
 * achado 2 escapou destes testes na primeira rodada). Se alguém remover
 * um campo desta lista em `campos-proibidos.ts`, este teste tem que
 * falhar — e só falha porque o valor está fixo aqui, não importado de lá.
 */
const CAMPOS_PROIBIDOS_ESPERADOS = [
  "nome",
  "cpf",
  "contato",
  "dados",
  "texto",
  "endereco",
  "responsavel_legal",
  "evidencia",
  "posologia",
  "medida",
  "medidas",
] as const;

const SESSAO_FALSA = {
  usuarioId: "11111111-1111-1111-1111-111111111111",
  clinicaId: "22222222-2222-2222-2222-222222222222",
  papelChave: "dona",
  clinicasDisponiveis: [],
};

function ultimaLinhaLogada(spy: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const chamada = spy.mock.calls.at(-1);
  if (!chamada) throw new Error("console não foi chamado nesta suíte de teste");
  return JSON.parse(chamada[0] as string) as Record<string, unknown>;
}

beforeEach(() => {
  obterSessaoMock.mockReset();
});

describe("log — contexto de tenant/request (RNF-021)", () => {
  it("com sessão ativa, a linha carrega clinica_id, usuario_id e request_id reais", async () => {
    obterSessaoMock.mockResolvedValue(SESSAO_FALSA);
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await log.info("evento com sessão");
    const linha = ultimaLinhaLogada(spy);
    expect(linha.clinica_id).toBe(SESSAO_FALSA.clinicaId);
    expect(linha.usuario_id).toBe(SESSAO_FALSA.usuarioId);
    expect(typeof linha.request_id).toBe("string");
    expect((linha.request_id as string).length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it("sem sessão (obterSessao devolve null) loga sem clinica_id/usuario_id, mas com request_id", async () => {
    obterSessaoMock.mockResolvedValue(null);
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await log.info("evento anônimo");
    const linha = ultimaLinhaLogada(spy);
    expect(linha.clinica_id).toBeUndefined();
    expect(linha.usuario_id).toBeUndefined();
    expect(typeof linha.request_id).toBe("string");
    spy.mockRestore();
  });

  it("sem contexto de request (obterSessao lança, como job/migração/seed fora de um request Next) nunca lança e ainda loga", async () => {
    obterSessaoMock.mockRejectedValue(new Error("cookies() foi chamada fora de um escopo de request"));
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(log.info("evento de job")).resolves.toBeUndefined();
    const linha = ultimaLinhaLogada(spy);
    expect(linha.clinica_id).toBeUndefined();
    expect(linha.usuario_id).toBeUndefined();
    expect(typeof linha.request_id).toBe("string");
    spy.mockRestore();
  });
});

describe("log — nunca emite campo de paciente (RNF-013/RNF-021)", () => {
  beforeEach(() => {
    obterSessaoMock.mockResolvedValue(null);
  });

  it.each(CAMPOS_PROIBIDOS_ESPERADOS)("remove o campo proibido '%s' de dados, em qualquer chamada", async (campo) => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const valorSensivel = `valor-sensivel-de-${campo}`;
    await log.info("evento com dado de paciente", { paciente: { [campo]: valorSensivel } });
    const linha = ultimaLinhaLogada(spy);
    const dados = linha.dados as { paciente: Record<string, unknown> };
    expect(dados.paciente[campo]).toBe("[removido]");
    expect(JSON.stringify(linha)).not.toContain(valorSensivel);
    spy.mockRestore();
  });

  it("log.erro nunca vaza a mensagem de um Error que carrega dado de paciente em texto livre", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const erro = new Error("falha ao ler paciente Maria Silva, CPF 12345678900");
    await log.erro("falha ao processar evolução", erro);
    const linha = ultimaLinhaLogada(spy);
    const serializado = JSON.stringify(linha);
    expect(serializado).not.toContain("Maria Silva");
    expect(serializado).not.toContain("12345678900");
    const erroLogado = linha.erro as Record<string, unknown>;
    expect(erroLogado.tipoErro).toBe("Error");
    expect(erroLogado.message).toBeUndefined();
    spy.mockRestore();
  });
});

describe("log — nunca lança, mesmo quando a sanitização falha por um motivo inesperado (fix round 1, achado 4)", () => {
  beforeEach(() => {
    obterSessaoMock.mockResolvedValue(null);
  });

  it("dados com um getter que lança ao ser lido não derruba log.info", async () => {
    const payloadArmadilha: Record<string, unknown> = {};
    Object.defineProperty(payloadArmadilha, "campo", {
      enumerable: true,
      get(): string {
        throw new Error("leitura da propriedade falhou");
      },
    });
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(log.info("evento com payload hostil", payloadArmadilha)).resolves.toBeUndefined();
    const linha = ultimaLinhaLogada(spy);
    expect(linha.dados).toBe("[falha ao sanitizar]");
    spy.mockRestore();
  });
});
