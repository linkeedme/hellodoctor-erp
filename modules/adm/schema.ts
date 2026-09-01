import { z } from "zod";

const CONSELHOS = ["CRM", "CRO", "CRBM", "COREN", "CREFITO"] as const;
const VINCULOS = ["clt", "pj_parceiro", "aluguel_sala"] as const;

/**
 * Validação Zod espelhando o schema do banco (db/migrations/0001_fase0_fase1_baseline.sql).
 * O Zod recusa entrada inválida ANTES de qualquer query — a constraint do
 * banco continua existindo, mas como rede de segurança, não como o único guard.
 */

export const EsquemaClinica = z.object({
  razaoSocial: z.string().min(1, "Razão social é obrigatória"),
  nomeFantasia: z.string().min(1).optional(),
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve ter exatamente 14 dígitos numéricos, sem pontuação"),
});
export type EntradaClinica = z.infer<typeof EsquemaClinica>;

// Sem usuarioId de propósito: quem vira o primeiro membro (papel "dona") é
// resolvido de exigirUsuarioAutenticado() dentro de onboarding.ts, nunca de
// um campo do payload — ver o comentário em criarClinica().
export const EsquemaOnboarding = z.object({
  clinica: EsquemaClinica,
  nomeUnidadePrincipal: z.string().min(1, "Nome da unidade principal é obrigatório"),
});
export type EntradaOnboarding = z.infer<typeof EsquemaOnboarding>;

export const EsquemaUnidade = z.object({
  nome: z.string().min(1, "Nome da unidade é obrigatório"),
  endereco: z.record(z.string(), z.unknown()).default({}),
});
export type EntradaUnidade = z.infer<typeof EsquemaUnidade>;

export const EsquemaMembro = z.object({
  usuarioId: z.string().uuid("usuarioId precisa ser um uuid válido"),
  papelChave: z.string().min(1, "papelChave é obrigatório"),
});
export type EntradaMembro = z.infer<typeof EsquemaMembro>;

export const EsquemaProfissional = z.object({
  membroId: z.string().uuid("membroId precisa ser um uuid válido"),
  conselho: z.enum(CONSELHOS, { errorMap: () => ({ message: "conselho inválido" }) }),
  numeroConselho: z.string().min(1, "Número do conselho é obrigatório"),
  uf: z.string().length(2, "uf precisa ter 2 letras"),
  habilitacoes: z.array(z.string()).default([]),
  vinculo: z.enum(VINCULOS, {
    errorMap: () => ({ message: "vinculo é obrigatório: clt, pj_parceiro ou aluguel_sala" }),
  }),
});
export type EntradaProfissional = z.infer<typeof EsquemaProfissional>;
