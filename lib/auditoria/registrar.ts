import "server-only";
import type { Transaction } from "kysely";
import type { BancoHelloDoctor } from "@/db/tipos";
import { obterRequestId } from "@/lib/contexto-request";

/**
 * O mínimo que `registrarEvento` precisa pra saber de quem e de qual
 * clínica é o evento. `SessaoAtiva` satisfaz isto estruturalmente — mas
 * `criarClinica` (Task 1, ver modules/adm/onboarding.ts) não tem sessão
 * antes da clínica existir, só o par recém-criado.
 */
export type ContextoAuditoria = { clinicaId: string; usuarioId: string };

/**
 * Ações e entidades conhecidas — não `string` solto. Um typo como
 * `"unidadee"` passaria pelo compilador e viraria um evento que nenhuma
 * consulta de auditoria futura vai encontrar. Sem escape para string
 * arbitrária: uma entidade nova precisa entrar aqui, de propósito.
 */
export type AcaoAuditoria = "leitura" | "criacao" | "atualizacao";
export type EntidadeAuditavel =
  | "clinica"
  | "unidade"
  | "membro"
  | "profissional"
  | "paciente"
  | "ficha"
  | "evolucao";

export type EventoAuditoria = {
  acao: AcaoAuditoria;
  entidade: EntidadeAuditavel;
  entidadeId?: string;
  valorAntes?: Record<string, unknown>;
  valorDepois?: Record<string, unknown>;
};

/**
 * Grava um evento em `evento_auditoria`, usando a transação de quem chama —
 * nunca abre a própria. `valorAntes`/`valorDepois` guardam só os campos que
 * mudaram, nunca a linha inteira: dado clínico completo dentro da auditoria
 * multiplica a superfície de exposição. A auditoria diz *que* mudou, não
 * repete o prontuário.
 */
export async function registrarEvento(
  trx: Transaction<BancoHelloDoctor>,
  contexto: ContextoAuditoria,
  evento: EventoAuditoria,
): Promise<void> {
  await trx
    .insertInto("evento_auditoria")
    .values({
      clinica_id: contexto.clinicaId,
      usuario_id: contexto.usuarioId,
      acao: evento.acao,
      entidade: evento.entidade,
      entidade_id: evento.entidadeId ?? null,
      valor_antes: evento.valorAntes ?? null,
      valor_depois: evento.valorDepois ?? null,
      request_id: obterRequestId(),
    })
    .execute();
}
