#!/usr/bin/env bash
set -euo pipefail

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
    echo "DATABASE_URL_SERVICO=postgres://postgres:postgres@localhost:$PORTA/hello_doctor"
    exit 0
  fi
  printf '.'
  sleep 1
done

echo " falhou" >&2
exit 1
