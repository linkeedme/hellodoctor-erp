"use server";

import { comClinica } from "@/db/client";

export async function acaoPerigosa(clinicaId: string, usuarioId: string) {
  return comClinica({ clinicaId, usuarioId }, async (trx) =>
    trx.selectFrom("clinica").selectAll().execute(),
  );
}
