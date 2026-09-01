import "server-only";
import type { Transaction } from "kysely";
import type { BancoHelloDoctor } from "@/db/tipos";
import { comClinicaDaSessao } from "@/db/com-sessao";
import { registrarEvento, type EntidadeAuditavel } from "./registrar";

/**
 * Único caminho de leitura de dado clínico (RF-006, LGPD art. 37). Roda a
 * consulta e só então grava o evento de leitura, tudo na mesma transação —
 * se `registrarEvento` falhar, a transação reverte e `lerAuditado` rejeita:
 * o chamador nunca recebe dado sem evento gravado.
 *
 * A ordem é consulta-depois-evento, não o contrário: várias policies deste
 * schema (`ficha`, `evolucao`, `medida`, `foto`, `atendimento`, `paciente`)
 * combinam `clinica_id` com `app_paciente_visivel(...)`. Como
 * `comClinicaDaSessao` já fixa a clínica da sessão, só o segundo fator pode
 * negar a linha — e nega em silêncio (SELECT vazio, sem lançar exceção). Se
 * o evento fosse gravado antes, uma leitura bloqueada pelo RLS intra-tenant
 * (modo restrito) registraria `acao='leitura'` de um dado que ninguém viu —
 * auditoria que mente é pior que auditoria ausente. Por isso o evento
 * carrega `valorDepois: { encontrado }`: registra o que de fato aconteceu,
 * não a intenção de ler.
 */
export async function lerAuditado<T>(
  entidade: EntidadeAuditavel,
  entidadeId: string,
  consulta: (trx: Transaction<BancoHelloDoctor>) => Promise<T>,
): Promise<T> {
  return comClinicaDaSessao(async (trx, sessao) => {
    const resultado = await consulta(trx);
    await registrarEvento(trx, sessao, {
      acao: "leitura",
      entidade,
      entidadeId,
      valorDepois: { encontrado: resultado !== null && resultado !== undefined },
    });
    return resultado;
  });
}
