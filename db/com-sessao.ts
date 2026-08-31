import "server-only";
import type { Transaction } from "kysely";
import { comClinica } from "./client";
import type { BancoHelloDoctor } from "./tipos";
import { exigirSessao, type SessaoAtiva } from "@/lib/auth/sessao";

/**
 * O ÚNICO caminho de leitura/escrita de dado num request autenticado.
 *
 * Existe porque `comClinica` recebe `{clinicaId, usuarioId}` como dois textos
 * soltos: nada no compilador impede um call-site de montar esse par a partir
 * de formData, query string, ou de duas sessões diferentes. Aqui o contexto
 * vem de `exigirSessao()` e não há parâmetro para o chamador informá-lo.
 *
 * Se você está prestes a chamar `comClinica` direto numa Server Action, pare:
 * use este helper. `comClinica` fica reservado para migração, seed e teste.
 */
export async function comClinicaDaSessao<T>(
  fn: (trx: Transaction<BancoHelloDoctor>, sessao: SessaoAtiva) => Promise<T>,
): Promise<T> {
  const sessao = await exigirSessao();
  return comClinica(
    { clinicaId: sessao.clinicaId, usuarioId: sessao.usuarioId },
    (trx) => fn(trx, sessao),
  );
}
