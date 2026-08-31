import "server-only";
import { comServico } from "@/db/onboarding";

export type ClinicaDisponivel = { id: string; razaoSocial: string };
export type PapelResolvido = { id: string; chave: string; nome: string };

export async function resolverUsuarioPorAuthId(
  authProviderId: string,
): Promise<{ id: string; nome: string; email: string } | null> {
  return comServico(async (db) => {
    const linha = await db
      .selectFrom("usuario")
      .select(["id", "nome", "email"])
      .where("auth_provider_id", "=", authProviderId)
      .executeTakeFirst();
    return linha ?? null;
  });
}

export async function resolverClinicasDoUsuario(
  usuarioId: string,
): Promise<ClinicaDisponivel[]> {
  return comServico(async (db) => {
    const linhas = await db
      .selectFrom("membro")
      .innerJoin("clinica", "clinica.id", "membro.clinica_id")
      .select(["clinica.id as id", "clinica.razao_social as razaoSocial"])
      .where("membro.usuario_id", "=", usuarioId)
      .where("membro.ativo", "=", true)
      .where("clinica.ativa", "=", true)
      .orderBy("clinica.razao_social")
      .execute();
    return linhas.map((l) => ({ id: l.id, razaoSocial: l.razaoSocial }));
  });
}

export async function resolverPapel(
  usuarioId: string,
  clinicaId: string,
): Promise<PapelResolvido | null> {
  return comServico(async (db) => {
    const linha = await db
      .selectFrom("membro")
      .innerJoin("papel", "papel.id", "membro.papel_id")
      .select(["papel.id as id", "papel.chave as chave", "papel.nome as nome"])
      .where("membro.usuario_id", "=", usuarioId)
      .where("membro.clinica_id", "=", clinicaId)
      .where("membro.ativo", "=", true)
      .executeTakeFirst();
    return linha ?? null;
  });
}
