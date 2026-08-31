export const MODULOS = [
  "adm", "agd", "prt", "mid", "cat", "tpr", "pre", "fin", "mig", "pfl",
] as const;
export type Modulo = (typeof MODULOS)[number];

export const OPERACOES = ["ver", "criar", "editar", "excluir", "aprovar"] as const;
export type Operacao = (typeof OPERACOES)[number];

export const PAPEIS = [
  { chave: "dona", nome: "Dona da clínica" },
  { chave: "gestora", nome: "Gestora" },
  { chave: "profissional", nome: "Profissional" },
  { chave: "recepcao", nome: "Recepção" },
  { chave: "financeiro", nome: "Financeiro" },
  { chave: "consultora_comercial", nome: "Consultora comercial" },
  { chave: "paciente", nome: "Paciente" },
] as const;

type PapelChave = (typeof PAPEIS)[number]["chave"];

type Entrada = { papel: PapelChave; modulo: Modulo; operacoes: readonly Operacao[] };

/**
 * Matriz de docs/modulos-e-funcionalidades.md seção 4.2 — célula a célula,
 * inclusive as notas de rodapé que restringem operação (ex.: nota 10, gestora
 * só aprova exceção financeira, não confirma recebimento do dia a dia; nota
 * 11, profissional/consultora só veem a própria comissão). Conferida por
 * tests/unit/matriz-fidelidade-doc.test.ts, que reparseia o documento e
 * compara célula a célula com esta matriz.
 *
 * Escopo: só os módulos que já existem em código (adm) mais os da Fase 1
 * (agd, prt, mid, cat, tpr, pre, fin, mig, pfl) — de propósito um subconjunto
 * dos módulos do documento (fora: map, ant, fun, por, iac), para o seed não
 * referenciar módulo inexistente nesta fatia.
 *
 * Ausência de entrada = sem acesso ao módulo. Não existe permissão implícita.
 */
export const MATRIZ: readonly Entrada[] = [
  { papel: "dona", modulo: "adm", operacoes: ["ver", "criar", "editar", "excluir", "aprovar"] },
  { papel: "dona", modulo: "agd", operacoes: ["ver", "criar", "editar", "excluir", "aprovar"] },
  { papel: "dona", modulo: "prt", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "fin", operacoes: ["ver", "criar", "editar", "excluir", "aprovar"] },
  { papel: "dona", modulo: "cat", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "tpr", operacoes: ["ver", "criar", "editar", "excluir", "aprovar"] },
  { papel: "dona", modulo: "mid", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "pre", operacoes: ["ver", "aprovar"] },
  { papel: "dona", modulo: "pfl", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "mig", operacoes: ["ver", "criar", "editar", "excluir"] },

  { papel: "gestora", modulo: "adm", operacoes: ["ver", "editar"] },
  { papel: "gestora", modulo: "agd", operacoes: ["ver", "criar", "editar", "aprovar"] },
  { papel: "gestora", modulo: "prt", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "fin", operacoes: ["ver", "aprovar"] },
  { papel: "gestora", modulo: "cat", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "tpr", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "mid", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "pre", operacoes: ["ver"] },
  { papel: "gestora", modulo: "pfl", operacoes: ["ver", "editar"] },
  { papel: "gestora", modulo: "mig", operacoes: ["ver", "criar", "editar"] },

  { papel: "profissional", modulo: "agd", operacoes: ["ver", "criar", "editar"] },
  { papel: "profissional", modulo: "prt", operacoes: ["ver", "criar", "editar"] },
  { papel: "profissional", modulo: "mid", operacoes: ["ver", "criar"] },
  { papel: "profissional", modulo: "cat", operacoes: ["ver", "criar"] },
  { papel: "profissional", modulo: "pre", operacoes: ["ver", "criar"] },
  { papel: "profissional", modulo: "fin", operacoes: ["ver"] },
  { papel: "profissional", modulo: "tpr", operacoes: ["ver"] },

  { papel: "recepcao", modulo: "agd", operacoes: ["ver", "criar", "editar"] },
  { papel: "recepcao", modulo: "prt", operacoes: ["ver", "criar"] },
  { papel: "recepcao", modulo: "mid", operacoes: ["ver", "criar"] },
  { papel: "recepcao", modulo: "cat", operacoes: ["ver"] },
  { papel: "recepcao", modulo: "tpr", operacoes: ["ver"] },
  { papel: "recepcao", modulo: "fin", operacoes: ["ver"] },

  { papel: "financeiro", modulo: "fin", operacoes: ["ver", "criar", "editar", "aprovar"] },
  { papel: "financeiro", modulo: "agd", operacoes: ["ver"] },
  { papel: "financeiro", modulo: "cat", operacoes: ["ver"] },
  { papel: "financeiro", modulo: "tpr", operacoes: ["ver"] },

  { papel: "consultora_comercial", modulo: "agd", operacoes: ["ver", "criar"] },
  { papel: "consultora_comercial", modulo: "prt", operacoes: ["ver"] },
  { papel: "consultora_comercial", modulo: "mid", operacoes: ["ver"] },
  { papel: "consultora_comercial", modulo: "cat", operacoes: ["ver"] },
  { papel: "consultora_comercial", modulo: "fin", operacoes: ["ver"] },
  { papel: "consultora_comercial", modulo: "tpr", operacoes: ["ver"] },
];

export function podeNaMatriz(
  papelChave: string,
  modulo: Modulo,
  operacao: Operacao,
): boolean {
  return MATRIZ.some(
    (e) => e.papel === papelChave && e.modulo === modulo && e.operacoes.includes(operacao),
  );
}
