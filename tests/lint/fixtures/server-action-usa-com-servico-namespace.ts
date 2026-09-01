"use server";

import * as dbOnboarding from "@/db/onboarding";

export async function acaoPerigosaNamespace() {
  return dbOnboarding.comServico((db) => db.selectFrom("clinica").selectAll().execute());
}
