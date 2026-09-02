import "server-only";
import { createHash } from "node:crypto";
import type { Transaction } from "kysely";
import type { BancoHelloDoctor, FinalidadeConsentimento, AncoraConsentimento } from "@/db/tipos";
import { comClinicaDaSessao } from "@/db/com-sessao";
import { exigirPermissao } from "@/lib/autorizacao/verificar";
import { registrarEvento } from "@/lib/auditoria/registrar";
import { EsquemaConsentimento, EsquemaConsentimentoId } from "./schema";

/**
 * Contrato de integridade da regra 6 (11.10): `hash_conteudo` é sempre
 * sha256 hex do `texto` (utf-8). Documentado aqui porque é o único lugar
 * que grava a coluna — qualquer verificação de integridade fora deste
 * módulo (ex.: teste, auditoria futura) recalcula com este mesmo algoritmo
 * direto do texto armazenado, sem precisar importar esta função.
 */
function calcularHashConteudo(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * Garante que `termo` (clinica_id, finalidade, nomeTermo) existe e devolve
 * o id da `termo_versao` vigente cujo texto é `texto` — cria termo e/ou
 * versão nova só quando necessário (texto novo ou primeira assinatura).
 *
 * Regra 3: a versão antiga NUNCA é apagada nem tem o texto reescrito — só
 * ganha `vigente_ate`. Um consentimento já assinado continua apontando pra
 * ela por `termo_versao_id`, então a redação que o paciente aceitou fica
 * congelada mesmo que o termo evolua depois.
 */
async function obterOuCriarVersaoVigente(
  trx: Transaction<BancoHelloDoctor>,
  clinicaId: string,
  finalidade: FinalidadeConsentimento,
  nomeTermo: string,
  texto: string,
): Promise<string> {
  const termoExistente = await trx
    .selectFrom("termo")
    .select("id")
    .where("clinica_id", "=", clinicaId)
    .where("finalidade", "=", finalidade)
    .where("nome", "=", nomeTermo)
    .executeTakeFirst();

  const termoId =
    termoExistente?.id ??
    (
      await trx
        .insertInto("termo")
        .values({ clinica_id: clinicaId, finalidade, nome: nomeTermo })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;

  const hash = calcularHashConteudo(texto);

  const versaoVigente = await trx
    .selectFrom("termo_versao")
    .select(["id", "hash_conteudo"])
    .where("termo_id", "=", termoId)
    .where("vigente_ate", "is", null)
    .executeTakeFirst();

  if (versaoVigente && versaoVigente.hash_conteudo === hash) {
    return versaoVigente.id;
  }

  if (versaoVigente) {
    await trx
      .updateTable("termo_versao")
      .set({ vigente_ate: new Date() })
      .where("id", "=", versaoVigente.id)
      .execute();
  }

  const novaVersao = await trx
    .insertInto("termo_versao")
    .values({ termo_id: termoId, texto, hash_conteudo: hash })
    .returning("id")
    .executeTakeFirstOrThrow();

  return novaVersao.id;
}

/**
 * Cria a versão vigente do termo (se necessário) e grava a assinatura —
 * a interseção finalidade × âncora × versão do termo (RF-007/11.10).
 */
export async function registrarConsentimento(entrada: unknown) {
  const dados = EsquemaConsentimento.parse(entrada);
  await exigirPermissao("adm", "criar");

  return comClinicaDaSessao(async (trx, sessao) => {
    const termoVersaoId = await obterOuCriarVersaoVigente(
      trx,
      sessao.clinicaId,
      dados.finalidade,
      dados.nomeTermo,
      dados.texto,
    );

    const consentimento = await trx
      .insertInto("consentimento")
      .values({
        clinica_id: sessao.clinicaId,
        paciente_id: dados.pacienteId,
        finalidade: dados.finalidade,
        ancora_tipo: dados.ancoraTipo,
        ancora_id: dados.ancoraId,
        termo_versao_id: termoVersaoId,
        evidencia: dados.evidencia,
      })
      .returning(["id", "termo_versao_id", "assinado_em"])
      .executeTakeFirstOrThrow();

    await registrarEvento(trx, sessao, {
      acao: "criacao",
      entidade: "consentimento",
      entidadeId: consentimento.id,
      valorDepois: {
        pacienteId: dados.pacienteId,
        finalidade: dados.finalidade,
        ancoraTipo: dados.ancoraTipo,
        ancoraId: dados.ancoraId,
        termoVersaoId: consentimento.termo_versao_id,
      },
    });

    return consentimento;
  });
}

/**
 * Marca `revogado_em` e NUNCA apaga a linha — ela é prova jurídica de que
 * houve consentimento e de que ele foi retirado, com as duas datas. Revogar
 * uma finalidade/âncora não toca nenhuma outra linha: a revogação é por
 * `id`, não por paciente (regra 2 — marketing e tratamento são registros
 * independentes).
 */
export async function revogarConsentimento(consentimentoId: unknown) {
  const id = EsquemaConsentimentoId.parse(consentimentoId);
  await exigirPermissao("adm", "editar");

  return comClinicaDaSessao(async (trx, sessao) => {
    const atual = await trx
      .selectFrom("consentimento")
      .select(["id", "revogado_em"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!atual) {
      throw new Error("Consentimento não encontrado");
    }
    if (atual.revogado_em) {
      throw new Error("Consentimento já revogado");
    }

    const revogado = await trx
      .updateTable("consentimento")
      .set({ revogado_em: new Date() })
      .where("id", "=", id)
      .returning(["id", "revogado_em"])
      .executeTakeFirstOrThrow();

    await registrarEvento(trx, sessao, {
      acao: "revogacao",
      entidade: "consentimento",
      entidadeId: id,
      valorDepois: { revogadoEm: revogado.revogado_em },
    });

    return revogado;
  });
}

/**
 * Devolve o consentimento vigente para a interseção exata finalidade ×
 * âncora — ou `null`. Vigente = não revogado (regra 4) e da âncora pedida,
 * não de outra (regra 5).
 */
export async function consentimentoVigente(
  pacienteId: string,
  finalidade: FinalidadeConsentimento,
  ancoraTipo: AncoraConsentimento,
  ancoraId: string,
) {
  await exigirPermissao("adm", "ver");

  return comClinicaDaSessao(async (trx, sessao) => {
    const linha = await trx
      .selectFrom("consentimento")
      .selectAll()
      .where("clinica_id", "=", sessao.clinicaId)
      .where("paciente_id", "=", pacienteId)
      .where("finalidade", "=", finalidade)
      .where("ancora_tipo", "=", ancoraTipo)
      .where("ancora_id", "=", ancoraId)
      .where("revogado_em", "is", null)
      .orderBy("assinado_em", "desc")
      .executeTakeFirst();

    return linha ?? null;
  });
}
