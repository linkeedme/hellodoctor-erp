"use server";

export async function acaoPerigosaDinamica() {
  const { comServico } = await import("@/db/onboarding");
  return comServico((db) => db.selectFrom("clinica").selectAll().execute());
}
