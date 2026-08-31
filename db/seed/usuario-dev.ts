/**
 * Seed de desenvolvimento: cria clínica, papel, usuário e membro a partir de
 * um `auth_provider_id` (o `id` que o Supabase devolve ao criar o usuário no
 * painel de Authentication). Sem isso não há como entrar no sistema depois
 * de autenticar — `resolverUsuarioPorAuthId` não encontra ninguém.
 *
 * Idempotente: roda mais de uma vez sem duplicar (`on conflict`).
 *
 * Uso: npx tsx db/seed/usuario-dev.ts <auth_provider_id> <email> [nome]
 *
 * NÃO usa `comServico`/`db/onboarding.ts`: aquele módulo começa com
 * `import "server-only"`, que lança incondicionalmente fora do bundler do
 * Next (mesma armadilha documentada em db/client.ts). Este script roda via
 * tsx, fora do Next — por isso, como `scripts/db-migrate.ts`, fala com o
 * banco por `pg.Client` puro, na role de serviço.
 */
import pg from "pg";

const [authProviderId, email, nome = "Desenvolvedor"] = process.argv.slice(2);

if (!authProviderId || !email) {
  console.error("Uso: npx tsx db/seed/usuario-dev.ts <auth_provider_id> <email> [nome]");
  process.exit(1);
}

const url = process.env.DATABASE_URL_SERVICO;
if (!url) throw new Error("DATABASE_URL_SERVICO não definida");

const CLINICA_DEV_ID = "00000000-0000-0000-0000-000000000001";

function primeiraLinha<T>(linhas: T[], contexto: string): T {
  const linha = linhas[0];
  if (!linha) throw new Error(`insert de ${contexto} não retornou linha`);
  return linha;
}

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

const clinicaResultado = await cliente.query<{ id: string; razao_social: string }>(
  `insert into clinica (id, razao_social, cnpj)
   values ($1, 'Clínica de Desenvolvimento', '00000000000191')
   on conflict (id) do update set razao_social = excluded.razao_social
   returning id, razao_social`,
  [CLINICA_DEV_ID],
);
const clinica = primeiraLinha(clinicaResultado.rows, "clinica");
console.log(`· clínica: ${clinica.razao_social} (${clinica.id})`);

const papelResultado = await cliente.query<{ id: string; chave: string }>(
  `insert into papel (chave, nome) values ('dona', 'Dona da clínica')
   on conflict (chave) do update set nome = excluded.nome
   returning id, chave`,
);
const papel = primeiraLinha(papelResultado.rows, "papel");
console.log(`· papel: ${papel.chave} (${papel.id})`);

const usuarioResultado = await cliente.query<{ id: string; email: string }>(
  `insert into usuario (nome, email, auth_provider_id)
   values ($1, $2, $3)
   on conflict (auth_provider_id) do update set nome = excluded.nome, email = excluded.email
   returning id, email`,
  [nome, email, authProviderId],
);
const usuario = primeiraLinha(usuarioResultado.rows, "usuario");
console.log(`· usuário: ${usuario.email} (${usuario.id})`);

const membroResultado = await cliente.query<{ id: string }>(
  `insert into membro (clinica_id, usuario_id, papel_id)
   values ($1, $2, $3)
   on conflict (clinica_id, usuario_id) do update set ativo = true, papel_id = excluded.papel_id
   returning id`,
  [CLINICA_DEV_ID, usuario.id, papel.id],
);
const membro = primeiraLinha(membroResultado.rows, "membro");
console.log(`· membro: ${membro.id}`);

await cliente.end();
