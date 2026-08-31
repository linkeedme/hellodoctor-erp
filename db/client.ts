import "server-only";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import pg from "pg";
import type { BancoHelloDoctor } from "./tipos";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const db = new Kysely<BancoHelloDoctor>({
  dialect: new PostgresDialect({ pool }),
});

export type ContextoRequest = { clinicaId: string; usuarioId: string };

/**
 * Executa dentro de transação com app.clinica_id e app.usuario_id setados.
 * É o ÚNICO caminho de leitura/escrita de request. Fora daqui, o RLS não
 * tem o que filtrar e a query retorna vazio — falha fechada, por desenho.
 */
export async function comClinica<T>(
  ctx: ContextoRequest,
  fn: (trx: Transaction<BancoHelloDoctor>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`select
      set_config('app.clinica_id', ${ctx.clinicaId}, true),
      set_config('app.usuario_id', ${ctx.usuarioId}, true)`.execute(trx);
    return fn(trx);
  });
}
