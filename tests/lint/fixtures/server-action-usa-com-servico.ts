"use server";

import { comServico } from "@/db/onboarding";

export async function acaoPerigosa() {
  return comServico((db) => db.selectFrom("clinica").selectAll().execute());
}
