import "server-only";
import type { Transaction } from "kysely";
import type { BancoHelloDoctor } from "@/db/tipos";
import { comClinicaDaSessao } from "@/db/com-sessao";
import { registrarEvento } from "./registrar";

/**
 * Único caminho de leitura de dado clínico (RF-006, LGPD art. 37). Grava o
 * evento de leitura e só então roda a consulta, tudo na mesma transação: se
 * a gravação falhar, a consulta nem chega a rodar; se a consulta lançar
 * depois, a transação reverte e o evento já escrito some com ela. Não existe
 * caminho em que um dos dois aconteça sem o outro.
 */
export async function lerAuditado<T>(
  entidade: string,
  entidadeId: string,
  consulta: (trx: Transaction<BancoHelloDoctor>) => Promise<T>,
): Promise<T> {
  return comClinicaDaSessao(async (trx, sessao) => {
    await registrarEvento(trx, sessao, { acao: "leitura", entidade, entidadeId });
    return consulta(trx);
  });
}
