import "server-only";

import { comClinicaDaSessao } from "@/db/com-sessao";
import { exigirPermissao } from "@/lib/autorizacao/verificar";

export async function listarUnidades() {
  await exigirPermissao("adm", "ver");
  return comClinicaDaSessao(async (trx, sessao) => {
    return trx
      .selectFrom("unidade")
      .select(["id", "nome", "ativa", "criado_em"])
      .where("clinica_id", "=", sessao.clinicaId)
      .execute();
  });
}

export async function listarMembros() {
  await exigirPermissao("adm", "ver");
  return comClinicaDaSessao(async (trx, sessao) => {
    return trx
      .selectFrom("membro")
      .innerJoin("usuario", "usuario.id", "membro.usuario_id")
      .innerJoin("papel", "papel.id", "membro.papel_id")
      .select(["membro.id", "usuario.nome", "usuario.email", "papel.chave as papelChave", "membro.ativo"])
      .where("membro.clinica_id", "=", sessao.clinicaId)
      .execute();
  });
}

export async function listarProfissionais() {
  await exigirPermissao("adm", "ver");
  return comClinicaDaSessao(async (trx, sessao) => {
    return trx
      .selectFrom("profissional")
      .select(["id", "membro_id", "conselho", "numero_conselho", "uf", "habilitacoes", "vinculo"])
      .where("clinica_id", "=", sessao.clinicaId)
      .execute();
  });
}
