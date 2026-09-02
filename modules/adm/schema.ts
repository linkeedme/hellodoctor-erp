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

const FINALIDADES_CONSENTIMENTO = [
  "tratamento_clinico",
  "uso_interno",
  "uso_externo_marketing",
] as const;
const ANCORAS_CONSENTIMENTO = ["paciente", "protocolo_instancia", "atendimento", "foto"] as const;

// RF-007/11.10: um consentimento é a interseção de finalidade × âncora ×
// versão do termo. `nomeTermo` + `texto` identificam o termo e a redação
// vigente — modules/adm/consentimento.ts decide se precisa criar termo e/ou
// versão nova, ou reaproveitar a vigente.
export const EsquemaConsentimento = z.object({
  pacienteId: z.string().uuid("pacienteId precisa ser um uuid válido"),
  finalidade: z.enum(FINALIDADES_CONSENTIMENTO, { errorMap: () => ({ message: "finalidade inválida" }) }),
  nomeTermo: z.string().min(1, "Nome do termo é obrigatório"),
  texto: z.string().min(1, "Texto do termo é obrigatório"),
  ancoraTipo: z.enum(ANCORAS_CONSENTIMENTO, { errorMap: () => ({ message: "ancoraTipo inválido" }) }),
  ancoraId: z.string().uuid("ancoraId precisa ser um uuid válido"),
  evidencia: z.record(z.string(), z.unknown()).default({}),
});
export type EntradaConsentimento = z.infer<typeof EsquemaConsentimento>;

export const EsquemaConsentimentoId = z.string().uuid("consentimentoId precisa ser um uuid válido");
