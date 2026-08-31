"use server";

import { db } from "@/db/client";

export async function contarClinicas(): Promise<number> {
  const r = await db.selectFrom("clinica").select(({ fn }) => fn.countAll().as("total")).executeTakeFirst();
  return Number(r?.total ?? 0);
}
