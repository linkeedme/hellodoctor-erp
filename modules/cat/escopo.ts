import "server-only";

import { comClinicaDaSessao } from "@/db/com-sessao";

/**
 * RF-005: o trigger `verificar_escopo_profissional()` (db/migrations/
 * 0001_fase0_fase1_baseline.sql) já recusa no banco quando o conselho do
 * profissional não está autorizado para o procedimento — essa é a rede de
 * segurança real. Esta função existe só para dar mensagem legível ANTES de
 * chegar lá, sem depender da exceção do Postgres.
 *
 * tests/rls-smoke/escopo-profissional.test.ts prova que o trigger recusa
 * mesmo sem esta checagem (defesa em profundidade) — este arquivo nunca é a
 * única linha de defesa.
 */
export async function podeExecutar(
  procedimentoId: string,
  profissionalId: string,
): Promise<boolean> {
  return comClinicaDaSessao(async (trx, sessao) => {
    const profissional = await trx
      .selectFrom("profissional")
      .select("conselho")
      .where("id", "=", profissionalId)
      .where("clinica_id", "=", sessao.clinicaId)
      .executeTakeFirst();
    if (!profissional) return false;

    const autorizado = await trx
      .selectFrom("procedimento_conselho_autorizado")
      .select("conselho")
      .where("procedimento_id", "=", procedimentoId)
      .where("conselho", "=", profissional.conselho)
      .executeTakeFirst();

    return autorizado !== undefined;
  });
}
