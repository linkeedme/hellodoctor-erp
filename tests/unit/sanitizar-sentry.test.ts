import { describe, it, expect } from "vitest";
import { sanitizarParaSentry } from "@/lib/observabilidade/sentry";

// `sentry.ts` não toca sessão nem banco (é transformação pura de dados),
// por isso este arquivo não precisa mockar "server-only" nem usar import
// dinâmico — mesmo padrão de tests/unit/matriz-permissoes.test.ts.
//
// Não existe `tests/unit/sanitizar-sentry.test.ts` na lista de arquivos do
// brief da Task 2 (só `logger.test.ts` e `status.test.ts`), mas o Step 2
// exige exatamente os casos de profundidade abaixo — "testar que
// sanitizar({nome: 'x'}) remove nome prova pouco" — e não há outro lugar
// natural para eles. Arquivo novo, dedicado, para não misturar a
// verificação de profundidade do sanitizador com os testes de contexto do
// logger (RNF-013 é uma garantia própria, mesmo reaproveitando o mesmo
// motor de `campos-proibidos.ts`).

describe("sanitizarParaSentry — objeto aninhado a três níveis (RNF-013)", () => {
  it("remove o campo proibido mesmo a 3 níveis de profundidade, preservando a forma do resto", () => {
    const entrada = {
      atendimento: {
        prontuario: {
          ficha: { cpf: "12345678900", idade: 40 },
        },
      },
    };
    const resultado = sanitizarParaSentry(entrada) as {
      atendimento: { prontuario: { ficha: { cpf: unknown; idade: unknown } } };
    };
    expect(resultado.atendimento.prontuario.ficha.cpf).toBe("[removido]");
    expect(resultado.atendimento.prontuario.ficha.idade).toBe(40);
    expect(JSON.stringify(resultado)).not.toContain("12345678900");
  });
});

describe("sanitizarParaSentry — array de objetos (RNF-013)", () => {
  it("remove o campo proibido em cada item de um array de objetos", () => {
    const entrada = {
      pacientes: [
        { nome: "Ana Souza", idade: 22 },
        { nome: "Bruno Lima", idade: 31 },
      ],
    };
    const resultado = sanitizarParaSentry(entrada) as {
      pacientes: Array<{ nome: unknown; idade: unknown }>;
    };
    expect(resultado.pacientes[0]?.nome).toBe("[removido]");
    expect(resultado.pacientes[1]?.nome).toBe("[removido]");
    expect(resultado.pacientes[0]?.idade).toBe(22);
    expect(resultado.pacientes[1]?.idade).toBe(31);
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain("Ana Souza");
    expect(serializado).not.toContain("Bruno Lima");
  });
});

describe("sanitizarParaSentry — Error com dado de paciente na mensagem (RNF-013)", () => {
  it("nunca envia a mensagem crua: nem em message, nem embutida na primeira linha do stack", () => {
    const erro = new Error("falha ao ler paciente Maria Silva, CPF 12345678900");
    const resultado = sanitizarParaSentry(erro) as {
      tipoErro: unknown;
      message?: unknown;
      stack?: string;
    };
    expect(resultado.tipoErro).toBe("Error");
    expect(resultado.message).toBeUndefined();
    expect(JSON.stringify(resultado)).not.toContain("Maria Silva");
    expect(JSON.stringify(resultado)).not.toContain("12345678900");
    if (resultado.stack !== undefined) {
      expect(resultado.stack).not.toContain("Maria Silva");
      expect(resultado.stack).not.toContain("12345678900");
    }
  });

  it("um Error aninhado dentro de um objeto também é sanitizado, sem vazar a mensagem", () => {
    const entrada = { contexto: { erroOriginal: new Error("paciente Maria Silva não encontrado") } };
    const resultado = sanitizarParaSentry(entrada) as {
      contexto: { erroOriginal: { tipoErro: unknown; message?: unknown } };
    };
    expect(resultado.contexto.erroOriginal.tipoErro).toBe("Error");
    expect(resultado.contexto.erroOriginal.message).toBeUndefined();
    expect(JSON.stringify(resultado)).not.toContain("Maria Silva");
  });
});

describe("sanitizarParaSentry — referência circular", () => {
  it("não entra em loop infinito e substitui a referência de volta por um marcador", () => {
    type ComCircular = { nome: string; idade: number; auto?: ComCircular };
    const objeto: ComCircular = { nome: "Carla Nogueira", idade: 50 };
    objeto.auto = objeto;

    const resultado = sanitizarParaSentry(objeto) as { nome: unknown; idade: unknown; auto: unknown };
    expect(resultado.nome).toBe("[removido]");
    expect(resultado.idade).toBe(50);
    expect(resultado.auto).toBe("[circular]");
  });
});

describe("sanitizarParaSentry — capitalização diferente", () => {
  it("remove o campo proibido mesmo com a chave em outra capitalização (Nome, CPF)", () => {
    const entrada = { Nome: "Daniela Fontes", CPF: "98765432100", Idade: 28 };
    const resultado = sanitizarParaSentry(entrada) as { Nome: unknown; CPF: unknown; Idade: unknown };
    expect(resultado.Nome).toBe("[removido]");
    expect(resultado.CPF).toBe("[removido]");
    expect(resultado.Idade).toBe(28);
  });
});

describe("sanitizarParaSentry — sabotagem de profundidade (prova negativa manual)", () => {
  it("um objeto raso com o campo proibido no primeiro nível também é removido (não é o único caso coberto)", () => {
    // Este teste sozinho é o "de fachada" citado no brief — passa mesmo se
    // o sanitizador só olhar o primeiro nível. Ele só tem valor aqui porque
    // os testes acima (3 níveis, array, Error, circular) cobrem o resto: se
    // alguém reduzir o sanitizador para olhar só o primeiro nível, ESTE
    // teste continua verde, mas os de cima quebram.
    const resultado = sanitizarParaSentry({ nome: "x" }) as { nome: unknown };
    expect(resultado.nome).toBe("[removido]");
  });
});
