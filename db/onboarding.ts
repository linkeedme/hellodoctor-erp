import "server-only";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { BancoHelloDoctor } from "./tipos";

/**
 * Conexão com BYPASSRLS — não filtra por tenant nenhum, nem seta
 * app.clinica_id. Uso permitido APENAS em:
 *   (a) criação de tenant novo — não existe clinica_id para setar antes da clínica existir
 *   (b) migração
 *   (c) seed
 *
 * NUNCA usar para servir request de usuário. Estar em arquivo separado NÃO
 * basta como garantia — é só organização. Quem barra de verdade um import
 * fora desses três casos é a regra de lint
 * `local/sem-conexao-privilegiada-fora-de-infra`
 * (eslint-rules/sem-conexao-privilegiada-fora-de-infra.mjs), com uma
 * exceção explícita só para modules/adm/onboarding.ts (caso (a)).
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
