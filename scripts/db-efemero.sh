#!/usr/bin/env bash
set -euo pipefail

# Sobe um Postgres 16 efêmero via Docker, já com as duas roles que a suíte de
# testes espera: `postgres` (serviço, BYPASSRLS) e `app_user` (request, sem
# BYPASSRLS). Não roda migração nem seed — isso é `npm run db:migrate` /
# `npm run db:seed` depois.
#
# Uso:
#   npm run db:efemero
#   export DATABASE_URL_SERVICO="postgres://postgres:postgres@localhost:55432/hello_doctor"
#   export DATABASE_URL="postgres://app_user:app_user@localhost:55432/hello_doctor"
#   npm run db:migrate
#   npm test   # ou npm run test:rls-smoke / npm run test:visibilidade-paciente
#
# Argumentos opcionais: nome do container (padrão hello-doctor-teste) e porta
# (padrão 55432) — úteis para rodar mais de uma instância em paralelo.

NOME="${1:-hello-doctor-teste}"
PORTA="${2:-55432}"

docker rm -f "$NOME" >/dev/null 2>&1 || true
docker run -d --name "$NOME" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hello_doctor \
  -p "$PORTA:5432" \
  postgres:16 >/dev/null

printf 'aguardando postgres'
for _ in $(seq 1 30); do
  if docker exec "$NOME" pg_isready -U postgres >/dev/null 2>&1; then
    echo " ok"
    break
  fi
  printf '.'
  sleep 1
done

if ! docker exec "$NOME" pg_isready -U postgres >/dev/null 2>&1; then
  echo " falhou" >&2
  exit 1
fi

# app_user é o role de request (sem BYPASSRLS) que toda a suíte de RLS usa —
# ver docs/estrutura-do-projeto.md, "Conexão de banco: role de request x role
# de onboarding". Sem ele, quem clonar o repo não consegue rodar nenhum teste
# de RLS: falham por autenticação, não por erro de política.
#
# As migrações rodam pelo role de serviço (`postgres`, via
# DATABASE_URL_SERVICO), então as tabelas nascem com `postgres` como dono. O
# GRANT ON ALL TABLES abaixo cobre o que já existe no momento em que este
# script roda; o ALTER DEFAULT PRIVILEGES (setado como `postgres`) cobre
# tabela/sequence criada depois, por migração futura — sem isso, toda
# migração nova exigiria lembrar de rodar um GRANT manual à parte.
docker exec -i "$NOME" psql -U postgres -d hello_doctor -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'app_user' nobypassrls;
  end if;
end
$$;

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public grant usage, select on sequences to app_user;
SQL

echo "DATABASE_URL_SERVICO=postgres://postgres:postgres@localhost:$PORTA/hello_doctor"
echo "DATABASE_URL=postgres://app_user:app_user@localhost:$PORTA/hello_doctor"
