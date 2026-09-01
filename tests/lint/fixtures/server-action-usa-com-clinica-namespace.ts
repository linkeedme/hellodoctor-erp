"use server";

import * as dbClient from "@/db/client";

export async function acaoPerigosaNamespace(clinicaId: string, usuarioId: string) {
  return dbClient.comClinica({ clinicaId, usuarioId }, async (trx) =>
    trx.selectFrom("clinica").selectAll().execute(),
  );
}
