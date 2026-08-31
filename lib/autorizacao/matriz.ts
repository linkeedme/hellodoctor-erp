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

type Entrada = { papel: string; modulo: Modulo; operacoes: readonly Operacao[] };

/**
 * Matriz de docs/modulos-e-funcionalidades.md seção 4.2.
 * Ausência de entrada = sem acesso ao módulo. Não existe permissão implícita.
 */
export const MATRIZ: readonly Entrada[] = [
  { papel: "dona", modulo: "adm", operacoes: ["ver", "criar", "editar", "excluir", "aprovar"] },
  { papel: "dona", modulo: "agd", operacoes: ["ver", "criar", "editar", "excluir", "aprovar"] },
  { papel: "dona", modulo: "prt", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "fin", operacoes: ["ver", "criar", "editar", "excluir", "aprovar"] },
  { papel: "dona", modulo: "cat", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "tpr", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "mid", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "pfl", operacoes: ["ver", "editar"] },
  { papel: "dona", modulo: "mig", operacoes: ["ver", "criar"] },

  { papel: "gestora", modulo: "adm", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "agd", operacoes: ["ver", "criar", "editar", "aprovar"] },
  { papel: "gestora", modulo: "prt", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "fin", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "cat", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "tpr", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "mid", operacoes: ["ver", "criar", "editar"] },

  { papel: "profissional", modulo: "agd", operacoes: ["ver", "criar", "editar"] },
  { papel: "profissional", modulo: "prt", operacoes: ["ver", "criar", "editar"] },
  { papel: "profissional", modulo: "mid", operacoes: ["ver", "criar"] },
  { papel: "profissional", modulo: "cat", operacoes: ["ver", "criar"] },
  { papel: "profissional", modulo: "pre", operacoes: ["ver", "criar", "editar"] },

  { papel: "recepcao", modulo: "agd", operacoes: ["ver", "criar", "editar"] },
  { papel: "recepcao", modulo: "prt", operacoes: ["ver", "criar"] },
  { papel: "recepcao", modulo: "mid", operacoes: ["ver", "criar"] },
  { papel: "recepcao", modulo: "cat", operacoes: ["ver"] },
  { papel: "recepcao", modulo: "tpr", operacoes: ["ver"] },
  { papel: "recepcao", modulo: "fin", operacoes: ["ver", "criar"] },

  { papel: "financeiro", modulo: "fin", operacoes: ["ver", "criar", "editar", "aprovar"] },
  { papel: "financeiro", modulo: "agd", operacoes: ["ver"] },
  { papel: "financeiro", modulo: "cat", operacoes: ["ver"] },
  { papel: "financeiro", modulo: "tpr", operacoes: ["ver"] },

  { papel: "consultora_comercial", modulo: "agd", operacoes: ["ver", "criar"] },
  { papel: "consultora_comercial", modulo: "cat", operacoes: ["ver"] },
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
