import "server-only";
import { sql } from "kysely";
import { db } from "@/db/client";

export type EstadoDependencia = "saudavel" | "degradado";

export type EstadoStatus = {
  status: EstadoDependencia;
  dependencias: {
    banco: EstadoDependencia;
  };
};

/** Verifica de fato — um `select 1`, não uma suposição de que o pool está de pé. */
async function verificarBancoPadrao(): Promise<void> {
  await sql`select 1`.execute(db);
}

/**
 * `verificarBanco` é injetável para o teste do caso degradado poder apontar
 * para uma conexão quebrada (porta inválida, por exemplo) sem derrubar o
 * container de Postgres compartilhado pelo resto da suíte.
 *
 * Vive fora de `app/api/status/route.ts` porque o Next.js App Router só
 * aceita um conjunto fixo de exports num arquivo `route.ts` (GET, POST,
 * `dynamic`, etc.) — qualquer outro export quebra o build com "is not a
 * valid Route export field".
 */
export async function montarStatus(
  verificarBanco: () => Promise<void> = verificarBancoPadrao,
): Promise<EstadoStatus> {
  let banco: EstadoDependencia = "saudavel";
  try {
    await verificarBanco();
  } catch {
    banco = "degradado";
  }

  return {
    status: banco === "saudavel" ? "saudavel" : "degradado",
    dependencias: { banco },
  };
}
