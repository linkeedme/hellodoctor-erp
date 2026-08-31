import "server-only";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { BancoHelloDoctor } from "./tipos";

/**
 * Conexão com BYPASSRLS. Uso permitido APENAS em:
 *   (a) criação de tenant novo — não existe clinica_id para setar antes da clínica existir
 *   (b) migração
 *   (c) seed
 *
 * NUNCA usar para servir request de usuário. Está em arquivo separado para
 * que "usei o role errado" seja um erro visível de import, não um bug silencioso.
 */
const poolServico = new pg.Pool({
  connectionString: process.env.DATABASE_URL_SERVICO,
  max: 2,
});

const dbServico = new Kysely<BancoHelloDoctor>({
  dialect: new PostgresDialect({ pool: poolServico }),
});

export async function comServico<T>(
  fn: (db: Kysely<BancoHelloDoctor>) => Promise<T>,
): Promise<T> {
  return fn(dbServico);
}
