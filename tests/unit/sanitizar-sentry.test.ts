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

describe("sanitizarParaSentry — Error com propriedade própria proibida (fix round 1, achado 1)", () => {
  /**
   * Reprodução exata da review: uma classe de erro que carrega dado de
   * paciente como propriedade própria (parameter properties, o mesmo
   * idioma de `PermissaoNegada` em lib/autorizacao/verificar.ts), não só
   * na mensagem. Antes da correção, o loop de propriedades do erro
   * recursava no VALOR sem nunca comparar a CHAVE contra a lista — uma
   * string como "Maria Silva" caía no fallback `return valor` de
   * `removerCamposProibidos` (string não é objeto/array/Error) e saía
   * intacta dentro de `extra`.
   */
  class ErroComContexto extends Error {
    constructor(
      mensagem: string,
      contexto: Record<string, unknown>,
    ) {
      super(mensagem);
      Object.assign(this, contexto);
    }
  }

  it("remove nome/cpf de uma propriedade própria do erro, mantendo o código", () => {
    const erro = new ErroComContexto("falha", {
      nome: "Maria Silva",
      cpf: "12345678900",
      codigo: "X1",
    });
    const resultado = sanitizarParaSentry(erro) as {
      tipoErro: unknown;
      extra: { nome: unknown; cpf: unknown; codigo: unknown };
    };
    expect(resultado.tipoErro).toBe("Error");
    expect(resultado.extra.nome).toBe("[removido]");
    expect(resultado.extra.cpf).toBe("[removido]");
    expect(resultado.extra.codigo).toBe("X1");
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain("Maria Silva");
    expect(serializado).not.toContain("12345678900");
  });

  it("também remove campo proibido aninhado dentro de uma propriedade própria do erro", () => {
    const erro = new ErroComContexto("falha ao processar paciente", {
      paciente: { nome: "João Pereira", idade: 33 },
    });
    const resultado = sanitizarParaSentry(erro) as {
      extra: { paciente: { nome: unknown; idade: unknown } };
    };
    expect(resultado.extra.paciente.nome).toBe("[removido]");
    expect(resultado.extra.paciente.idade).toBe(33);
    expect(JSON.stringify(resultado)).not.toContain("João Pereira");
  });
});

describe("sanitizarParaSentry — campos do schema além dos 5 literais do brief (fix round 1, achado 2)", () => {
  it.each(["endereco", "responsavel_legal", "evidencia", "posologia", "medida", "medidas"])(
    "remove o campo proibido '%s'",
    (campo) => {
      const entrada = { [campo]: "dado-sensivel", idade: 40 };
      const resultado = sanitizarParaSentry(entrada) as Record<string, unknown>;
      expect(resultado[campo]).toBe("[removido]");
      expect(resultado.idade).toBe(40);
    },
  );

  /**
   * O trade-off registrado em campos-proibidos.ts: "valor" sozinho NÃO
   * está na lista (redigiria todo log financeiro para proteger um caso
   * específico). A defesa para `medida.valor` é bloquear o contêiner
   * ("medida"/"medidas") inteiro — cobre o call site idiomático desta
   * base (logar a entidade pelo nome do domínio). `recebimento.valor`
   * continua visível porque nada nesta base o embrulha sob uma chave
   * proibida.
   */
  it("medida.valor sai redigido quando embrulhado sob a chave 'medida' (convenção de call site)", () => {
    const entrada = { medida: { tipo: "circunferencia_braco", valor: 32.5, unidade: "cm" } };
    const resultado = sanitizarParaSentry(entrada) as { medida: unknown };
    expect(resultado.medida).toBe("[removido]");
  });

  it("recebimento.valor (financeiro) permanece intacto — não é dado de paciente", () => {
    const entrada = { recebimento: { valor: 150.0, formaPagamento: "pix" } };
    const resultado = sanitizarParaSentry(entrada) as { recebimento: { valor: unknown; formaPagamento: unknown } };
    expect(resultado.recebimento.valor).toBe(150.0);
    expect(resultado.recebimento.formaPagamento).toBe("pix");
  });
});

describe("sanitizarParaSentry — limite de profundidade (fix round 1, achado 4)", () => {
  function construirObjetoProfundo(profundidade: number, folha: unknown): unknown {
    let atual = folha;
    for (let i = 0; i < profundidade; i++) {
      atual = { proximo: atual };
    }
    return atual;
  }

  it("não estoura a pilha com um objeto de 100 mil níveis de profundidade, e não vaza o dado da folha", () => {
    const objetoProfundo = construirObjetoProfundo(100_000, { cpf: "12345678900" });
    expect(() => sanitizarParaSentry(objetoProfundo)).not.toThrow();
    const resultado = sanitizarParaSentry(objetoProfundo);
    expect(JSON.stringify(resultado)).not.toContain("12345678900");
  });

  it("trunca com um marcador ao passar do limite, em vez de continuar indefinidamente", () => {
    const objetoAlem = construirObjetoProfundo(50, { cpf: "12345678900" });
    const resultado = sanitizarParaSentry(objetoAlem);
    expect(JSON.stringify(resultado)).toContain("[profundo demais]");
  });
});

describe("sanitizarParaSentry — mesma referência em dois ramos, sem ciclo (achado menor)", () => {
  it("NÃO marca a segunda ocorrência como circular quando não há ciclo de verdade", () => {
    const compartilhado = { nome: "Fernanda Lima", idade: 45 };
    const entrada = { a: compartilhado, b: compartilhado };
    const resultado = sanitizarParaSentry(entrada) as {
      a: { nome: unknown; idade: unknown };
      b: { nome: unknown; idade: unknown };
    };
    expect(resultado.a.idade).toBe(45);
    expect(resultado.b.idade).toBe(45);
    expect(resultado.a.nome).toBe("[removido]");
    expect(resultado.b.nome).toBe("[removido]");
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
