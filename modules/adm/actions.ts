"use server";

import { comClinicaDaSessao } from "@/db/com-sessao";
import { exigirPermissao } from "@/lib/autorizacao/verificar";
import { registrarEvento } from "@/lib/auditoria/registrar";
import { EsquemaMembro, EsquemaProfissional, EsquemaUnidade } from "./schema";
import { criarClinica as criarClinicaOnboarding } from "./onboarding";

/**
 * Criação de tenant novo — delega para modules/adm/onboarding.ts, o único
 * lugar desta fatia que usa `comServico` em vez de `comClinicaDaSessao`
 * (não existe clinica_id antes da clínica existir).
 */
export async function criarClinica(entrada: unknown) {
  return criarClinicaOnboarding(entrada);
}

// Ordem obrigatória: valida entrada (Zod) -> exige permissão -> só então
// abre transação via comClinicaDaSessao. Nunca abrir transação antes de
// verificar permissão.

export async function criarUnidade(entrada: unknown) {
  const dados = EsquemaUnidade.parse(entrada);
  await exigirPermissao("adm", "criar");
  return comClinicaDaSessao(async (trx, sessao) => {
    const unidade = await trx
      .insertInto("unidade")
      .values({ clinica_id: sessao.clinicaId, nome: dados.nome, endereco: dados.endereco })
      .returning(["id", "nome"])
      .executeTakeFirstOrThrow();
    await registrarEvento(trx, sessao, {
      acao: "criacao",
      entidade: "unidade",
      entidadeId: unidade.id,
      valorDepois: { nome: dados.nome },
    });
    return unidade;
  });
}

export async function adicionarMembro(entrada: unknown) {
  const dados = EsquemaMembro.parse(entrada);
  await exigirPermissao("adm", "criar");
  return comClinicaDaSessao(async (trx, sessao) => {
    const papel = await trx
      .selectFrom("papel")
      .select("id")
      .where("chave", "=", dados.papelChave)
      .executeTakeFirst();
    if (!papel) {
      throw new Error(`Papel desconhecido: ${dados.papelChave}`);
    }

    const membro = await trx
      .insertInto("membro")
      .values({ clinica_id: sessao.clinicaId, usuario_id: dados.usuarioId, papel_id: papel.id })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    await registrarEvento(trx, sessao, {
      acao: "criacao",
      entidade: "membro",
      entidadeId: membro.id,
      valorDepois: { usuarioId: dados.usuarioId, papelChave: dados.papelChave },
    });
    return membro;
  });
}

export async function registrarProfissional(entrada: unknown) {
  const dados = EsquemaProfissional.parse(entrada);
  await exigirPermissao("adm", "criar");
  return comClinicaDaSessao(async (trx, sessao) => {
    // RLS de `membro` só devolve linha se clinica_id bater com a clínica da
    // sessão (set_config feito por comClinicaDaSessao) — por isso não
    // precisa de um segundo where comparando clínicas: se o membro for de
    // outra clínica, a query abaixo já vem vazia, e a regra "profissional
    // exige membro da mesma clínica" está satisfeita.
    const membro = await trx
      .selectFrom("membro")
      .select("id")
      .where("id", "=", dados.membroId)
      .executeTakeFirst();
    if (!membro) {
      throw new Error("Membro não encontrado nesta clínica");
    }

    const profissional = await trx
      .insertInto("profissional")
      .values({
        clinica_id: sessao.clinicaId,
        membro_id: dados.membroId,
        conselho: dados.conselho,
        numero_conselho: dados.numeroConselho,
        uf: dados.uf,
        habilitacoes: dados.habilitacoes,
        vinculo: dados.vinculo,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    await registrarEvento(trx, sessao, {
      acao: "criacao",
      entidade: "profissional",
      entidadeId: profissional.id,
      valorDepois: {
        conselho: dados.conselho,
        numeroConselho: dados.numeroConselho,
        uf: dados.uf,
        vinculo: dados.vinculo,
      },
    });
    return profissional;
  });
}
