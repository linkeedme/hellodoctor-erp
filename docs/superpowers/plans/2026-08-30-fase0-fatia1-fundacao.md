# Hello Doctor — Fase 0, Fatia 1: Fundação e Isolamento

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar o repositório do Hello Doctor com um Postgres cujo isolamento entre clínicas é garantido pelo banco, e um login que carrega `clinica_id` no token.

**Architecture:** Next.js App Router com TypeScript strict. Todo acesso a dado passa pelo servidor — o navegador nunca fala com o banco, e uma regra de lint quebra o build se alguém tentar. O Postgres roda RLS em toda tabela de domínio, e a aplicação conecta com dois roles distintos: `app_user` (sem BYPASSRLS) para request comum, e um role de serviço com BYPASSRLS restrito a criação de tenant, migração e seed. Migração é SQL escrito à mão, nunca gerada por diff de ORM.

**Tech Stack:** Next.js 15 (App Router) · TypeScript strict · Kysely (SQL-first, consultas tipadas) · PostgreSQL 16 · Auth.js v5 (Credentials, sessão JWT) · Vitest · Docker (Postgres efêmero para teste) · GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md`
**Plano de construção:** `docs/plano-de-construcao.md` (tarefas 0.1, 0.2, 0.3)
**Convenções:** `docs/estrutura-do-projeto.md` — leitura obrigatória antes da Task 1
**Schema:** `docs/schema-inicial.sql`

## Global Constraints

- **TypeScript strict** em todo o repositório. `any` é erro de lint, não warning.
- **Domínio em português** (tabela, coluna, tipo, Server Action, diretório de módulo). Infraestrutura genérica em inglês.
- **Arquivo em kebab-case.** Componente React PascalCase, função camelCase, tipo PascalCase.
- **Acesso a dado só via Server Action ou Route Handler.** Nenhum componente `"use client"` importa cliente de banco. Esta é a barreira nº 1 do projeto (RF-002).
- **Migração é SQL puro escrito à mão**, um arquivo por migração, numerado, nunca editado depois de mergeado em `main`.
- **Toda tabela de domínio carrega `clinica_id`**, tem RLS habilitado e policy — exceto as tabelas de referência de plataforma listadas na seção 15 de `docs/schema-inicial.sql`.
- **Commits:** Conventional Commits, tipo em inglês, escopo e descrição em português, minúscula, sem ponto final. Migração de schema é sempre commit próprio.
- **Nunca commitar credencial.** `.env.local` fica no `.gitignore` desde o primeiro commit.
- **Dado de paciente é sensível por padrão.** Ambiente de desenvolvimento e teste usa dado sintético, nunca export de clínica real.
- **Branch por tarefa.** Nunca commitar direto em `main`.

---

## Estrutura de arquivos desta fatia

| Arquivo | Responsabilidade |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts` | Configuração base do projeto |
| `eslint.config.mjs` | Lint, incluindo a regra da barreira de acesso a dado |
| `.github/workflows/ci.yml` | Build, lint, typecheck e testes em PR |
| `db/migrations/0001_fase0_fase1_baseline.sql` | Schema inicial — cópia integral de `docs/schema-inicial.sql` |
| `db/client.ts` | Conexão de request: abre transação e seta `app.clinica_id` / `app.usuario_id` |
| `db/onboarding.ts` | Conexão privilegiada (BYPASSRLS), isolada — só criação de tenant, migração e seed |
| `db/tipos.ts` | Tipos do banco para o Kysely |
| `scripts/db-migrate.ts` | Aplica migrações em ordem |
| `scripts/db-efemero.sh` | Sobe Postgres 16 descartável via Docker |
| `tests/rls-smoke/isolamento.test.ts` | Automatiza os 7 testes que validaram o schema |
| `lib/auth/config.ts` | Auth.js: Credentials, claim de `clinica_id` e `usuario_id` |
| `lib/auth/sessao.ts` | Leitura da sessão no servidor, com clínica ativa |
| `app/login/page.tsx` | Tela de login |
| `app/(autenticado)/layout.tsx` | Shell autenticado; redireciona sem sessão |
| `app/(autenticado)/trocar-clinica/action.ts` | Troca de clínica ativa para usuário multi-clínica |

---

## Task 1: Fundação do repositório e a barreira de acesso a dado

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `.github/workflows/ci.yml`
- Create: `eslint-rules/sem-banco-no-cliente.mjs`
- Test: `tests/lint/barreira-banco.test.ts`, `tests/lint/fixtures/componente-cliente-proibido.tsx`

**Interfaces:**
- Consumes: nada — é a primeira tarefa
- Produces: scripts npm `build`, `lint`, `typecheck`, `test`; a regra de lint `local/sem-banco-no-cliente` disponível para todas as tarefas seguintes

- [ ] **Step 1: Criar o repositório próprio e a estrutura inicial**

O código mora em repositório próprio, seguindo o padrão dos outros projetos do vault (`Terrazzo/terrazo-os`, `Vincol/codebase`).

```bash
cd "/Users/davi/Desktop/LNKD CORP/projetos/Hello Doctor"
mkdir -p hello-doctor && cd hello-doctor
git init -b main
mkdir -p db/migrations db/seed scripts lib/auth lib/auditoria lib/observabilidade \
         modules tests/lint tests/rls-smoke tests/isolamento-tenant tests/visibilidade-paciente \
         eslint-rules app
git mv ../docs ./docs 2>/dev/null || cp -r ../docs ./docs
```

Se o `git mv` falhar (docs ainda rastreados pelo repositório do vault), copie e remova do vault num commit separado do vault.

- [ ] **Step 2: Escrever `package.json` com os scripts que todas as tarefas seguintes usam**

```json
{
  "name": "hello-doctor",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:efemero": "bash scripts/db-efemero.sh",
    "db:migrate": "tsx scripts/db-migrate.ts",
    "test:rls-smoke": "vitest run tests/rls-smoke"
  },
  "dependencies": {
    "next": "15.1.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "kysely": "0.27.5",
    "pg": "8.13.1",
    "next-auth": "5.0.0-beta.25",
    "@node-rs/argon2": "2.0.2",
    "zod": "3.24.1"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "@types/node": "22.10.2",
    "@types/react": "19.0.2",
    "@types/pg": "8.11.10",
    "eslint": "9.17.0",
    "eslint-config-next": "15.1.0",
    "typescript-eslint": "8.18.1",
    "vitest": "2.1.8",
    "tsx": "4.19.2"
  }
}
```

Rodar `npm install`.

- [ ] **Step 3: Escrever `tsconfig.json` com strict de verdade**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "noEmit": true,
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Escrever o teste que prova que a barreira de acesso a dado funciona**

Este é o teste mais importante desta tarefa. A barreira nº 1 do projeto (RF-002) precisa ser mecânica, não convenção.

Fixture — arquivo propositalmente proibido, em `tests/lint/fixtures/componente-cliente-proibido.tsx`:

```tsx
"use client";

import { db } from "@/db/client";

export function ComponenteProibido() {
  return <div>{String(db)}</div>;
}
```

Teste, em `tests/lint/barreira-banco.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

describe("barreira de acesso a dado (RF-002)", () => {
  it("recusa import de cliente de banco em componente client", async () => {
    let saiuComErro = false;
    let saida = "";
    try {
      const r = await exec("npx", [
        "eslint",
        "tests/lint/fixtures/componente-cliente-proibido.tsx",
        "--format", "json",
      ]);
      saida = r.stdout;
    } catch (e) {
      saiuComErro = true;
      saida = (e as { stdout?: string }).stdout ?? "";
    }

    expect(saiuComErro).toBe(true);
    expect(saida).toContain("sem-banco-no-cliente");
  });
});
```

- [ ] **Step 5: Rodar o teste e confirmar que ele falha**

Run: `npx vitest run tests/lint/barreira-banco.test.ts`
Expected: FAIL — a regra `sem-banco-no-cliente` ainda não existe, então o eslint não acusa nada e `saiuComErro` é `false`.

- [ ] **Step 6: Escrever a regra de lint**

Em `eslint-rules/sem-banco-no-cliente.mjs`:

```js
const MODULOS_PROIBIDOS = [/^@\/db\//, /^kysely$/, /^pg$/];

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Proíbe importar cliente de banco em componente client (RF-002: acesso a dado só pelo servidor)",
    },
    messages: {
      proibido:
        "Acesso a dado só pelo servidor (RF-002). '{{fonte}}' não pode ser importado em arquivo com \"use client\". Mova a leitura para uma Server Action em modules/<modulo>/actions.ts.",
    },
    schema: [],
  },
  create(context) {
    const codigo = context.sourceCode ?? context.getSourceCode();
    const primeiro = codigo.ast.body[0];
    const ehClientComponent =
      primeiro?.type === "ExpressionStatement" &&
      primeiro.expression?.type === "Literal" &&
      primeiro.expression.value === "use client";

    if (!ehClientComponent) return {};

    return {
      ImportDeclaration(node) {
        const fonte = node.source.value;
        if (typeof fonte !== "string") return;
        if (MODULOS_PROIBIDOS.some((p) => p.test(fonte))) {
          context.report({ node, messageId: "proibido", data: { fonte } });
        }
      },
    };
  },
};
```

- [ ] **Step 7: Registrar a regra no eslint**

Em `eslint.config.mjs`:

```js
import next from "eslint-config-next";
import tseslint from "typescript-eslint";
import semBancoNoCliente from "./eslint-rules/sem-banco-no-cliente.mjs";

export default [
  ...next,
  ...tseslint.configs.strict,
  {
    plugins: { local: { rules: { "sem-banco-no-cliente": semBancoNoCliente } } },
    rules: {
      "local/sem-banco-no-cliente": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  { ignores: [".next/**", "node_modules/**"] },
];
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/lint/barreira-banco.test.ts`
Expected: PASS

- [ ] **Step 9: Confirmar que a regra não é falso-positivo em código legítimo**

Criar `tests/lint/fixtures/acao-servidor-permitida.ts`:

```ts
"use server";

import { db } from "@/db/client";

export async function contarClinicas(): Promise<number> {
  const r = await db.selectFrom("clinica").select(({ fn }) => fn.countAll().as("total")).executeTakeFirst();
  return Number(r?.total ?? 0);
}
```

Run: `npx eslint tests/lint/fixtures/acao-servidor-permitida.ts`
Expected: sem erro `sem-banco-no-cliente` (pode haver erro de import não resolvido até a Task 2 — isso é esperado e não é esta regra).

- [ ] **Step 10: Escrever o CI**

Em `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  verificar:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: hello_doctor_test
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
        ports: ["5432:5432"]
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/hello_doctor_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      - run: npm test
```

- [ ] **Step 11: Escrever `.gitignore` e `.env.example`**

`.gitignore`:

```
node_modules/
.next/
.env.local
.env*.local
*.tsbuildinfo
next-env.d.ts
.DS_Store
```

`.env.example`:

```
# Conexão de request — role SEM BYPASSRLS
DATABASE_URL=postgres://app_user:trocar@localhost:5432/hello_doctor

# Conexão privilegiada — só onboarding de tenant, migração e seed
DATABASE_URL_SERVICO=postgres://postgres:trocar@localhost:5432/hello_doctor

AUTH_SECRET=gerar-com-openssl-rand-base64-32
```

- [ ] **Step 12: Verificar tudo e commitar**

Run: `npm run lint && npm run typecheck && npm test`
Expected: os três passam.

```bash
git add -A
git commit -m "chore(ci): fundação do repositório com barreira de acesso a dado

Regra de lint própria recusa import de cliente de banco em componente
client, implementando RF-002 como barreira mecânica e não convenção."
```

---

## Task 2: Schema com RLS e os dois roles de conexão

**Files:**
- Create: `db/migrations/0001_fase0_fase1_baseline.sql` (cópia integral de `docs/schema-inicial.sql`)
- Create: `db/client.ts`, `db/onboarding.ts`, `db/tipos.ts`
- Create: `scripts/db-migrate.ts`, `scripts/db-efemero.sh`
- Test: `tests/rls-smoke/isolamento.test.ts`

**Interfaces:**
- Consumes: scripts npm da Task 1
- Produces:
  - `comClinica<T>(ctx: ContextoRequest, fn: (trx: Transaction<BancoHelloDoctor>) => Promise<T>): Promise<T>` — executa dentro de transação com `app.clinica_id` e `app.usuario_id` setados
  - `ContextoRequest = { clinicaId: string; usuarioId: string }`
  - `comServico<T>(fn: (db: Kysely<BancoHelloDoctor>) => Promise<T>): Promise<T>` — role BYPASSRLS, só onboarding/migração/seed
  - `BancoHelloDoctor` — interface de tabelas do Kysely

- [ ] **Step 1: Copiar o schema validado como migração 0001**

```bash
cp docs/schema-inicial.sql db/migrations/0001_fase0_fase1_baseline.sql
```

A partir deste momento `docs/schema-inicial.sql` vira referência histórica congelada e nunca mais é editado (convenção 7.3 de `docs/estrutura-do-projeto.md`).

- [ ] **Step 2: Escrever o script do Postgres efêmero**

Em `scripts/db-efemero.sh`:

```bash
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
```

Tornar executável: `chmod +x scripts/db-efemero.sh`

- [ ] **Step 3: Escrever o script de migração**

Em `scripts/db-migrate.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL_SERVICO;
if (!url) throw new Error("DATABASE_URL_SERVICO não definida");

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

await cliente.query(`
  create table if not exists migracao_aplicada (
    nome text primary key,
    aplicada_em timestamptz not null default now()
  )
`);

const dir = join(process.cwd(), "db", "migrations");
const arquivos = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

for (const arquivo of arquivos) {
  const { rowCount } = await cliente.query(
    "select 1 from migracao_aplicada where nome = $1",
    [arquivo],
  );
  if (rowCount && rowCount > 0) {
    console.log(`· ${arquivo} (já aplicada)`);
    continue;
  }

  const sql = await readFile(join(dir, arquivo), "utf8");
  await cliente.query("begin");
  try {
    await cliente.query(sql);
    await cliente.query("insert into migracao_aplicada (nome) values ($1)", [arquivo]);
    await cliente.query("commit");
    console.log(`✓ ${arquivo}`);
  } catch (erro) {
    await cliente.query("rollback");
    console.error(`✗ ${arquivo}`);
    throw erro;
  }
}

await cliente.end();
```

- [ ] **Step 4: Escrever o teste de isolamento antes do client**

Este teste automatiza o que foi verificado à mão durante o planejamento. Ele é a razão de existir desta tarefa.

Em `tests/rls-smoke/isolamento.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const URL_SERVICO = process.env.DATABASE_URL_SERVICO ?? "";
const URL_APP = process.env.DATABASE_URL ?? "";

let servico: pg.Client;
let app: pg.Client;
const CLINICA_A = "11111111-1111-1111-1111-111111111111";
const CLINICA_B = "22222222-2222-2222-2222-222222222222";

beforeAll(async () => {
  servico = new pg.Client({ connectionString: URL_SERVICO });
  await servico.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values
       ($1, 'Clinica A', '11111111000191'),
       ($2, 'Clinica B', '22222222000191')
     on conflict (id) do nothing`,
    [CLINICA_A, CLINICA_B],
  );

  app = new pg.Client({ connectionString: URL_APP });
  await app.connect();
});

afterAll(async () => {
  await servico?.end();
  await app?.end();
});

async function comoClinica<T>(clinicaId: string, sql: string, params: unknown[] = []) {
  await app.query("begin");
  await app.query("select set_config('app.clinica_id', $1, true)", [clinicaId]);
  try {
    return await app.query<T extends object ? T : never>(sql, params);
  } finally {
    await app.query("rollback");
  }
}

describe("isolamento entre clínicas (RF-001)", () => {
  it("não lê clínica de outro tenant", async () => {
    const r = await comoClinica(CLINICA_A, "select id from clinica where id = $1", [CLINICA_B]);
    expect(r.rowCount).toBe(0);
  });

  it("lê a própria clínica", async () => {
    const r = await comoClinica(CLINICA_A, "select id from clinica where id = $1", [CLINICA_A]);
    expect(r.rowCount).toBe(1);
  });

  it("não atualiza dado de outro tenant", async () => {
    const r = await comoClinica(
      CLINICA_A,
      "update clinica set razao_social = 'invadida' where id = $1",
      [CLINICA_B],
    );
    expect(r.rowCount).toBe(0);
  });

  it("não apaga dado de outro tenant", async () => {
    const r = await comoClinica(CLINICA_A, "delete from clinica where id = $1", [CLINICA_B]);
    expect(r.rowCount).toBe(0);
  });
});

describe("auditoria imutável (RF-006)", () => {
  // Os triggers bloqueia_update/bloqueia_delete são FOR EACH ROW: numa tabela
  // vazia eles NÃO disparam e o comando retorna sucesso com 0 linhas. Semear
  // uma linha antes é obrigatório — sem isso o teste falha por motivo errado.
  beforeAll(async () => {
    await servico.query(
      `insert into evento_auditoria (clinica_id, acao, entidade)
       values ($1, 'leitura', 'paciente')`,
      [CLINICA_A],
    );
  });

  it("recusa UPDATE em evento_auditoria", async () => {
    await expect(
      servico.query("update evento_auditoria set acao = 'adulterado' where true"),
    ).rejects.toThrow(/append-only/);
  });

  it("recusa DELETE em evento_auditoria", async () => {
    await expect(
      servico.query("delete from evento_auditoria where true"),
    ).rejects.toThrow(/append-only/);
  });
});
```

- [ ] **Step 5: Subir o banco, migrar e rodar o teste**

```bash
npm run db:efemero
export DATABASE_URL_SERVICO=postgres://postgres:postgres@localhost:55432/hello_doctor
npm run db:migrate
```

Criar o role de request, que a migração não cria (é infraestrutura, não schema):

```bash
docker exec hello-doctor-teste psql -U postgres -d hello_doctor -c \
  "create role app_user login password 'app_user'; \
   grant usage on schema public to app_user; \
   grant select, insert, update, delete on all tables in schema public to app_user; \
   alter default privileges in schema public grant select, insert, update, delete on tables to app_user;"
export DATABASE_URL=postgres://app_user:app_user@localhost:55432/hello_doctor
```

Run: `npm run test:rls-smoke`
Expected: os 6 testes passam. Se algum falhar, o problema está na policy do schema — corrigir por migração nova, nunca editando a 0001 se ela já foi aplicada em ambiente compartilhado.

- [ ] **Step 6: Escrever `db/tipos.ts` com as tabelas desta fatia**

```ts
import type { Generated, ColumnType } from "kysely";

type Criado = ColumnType<Date, Date | undefined, never>;

export interface TabelaClinica {
  id: Generated<string>;
  razao_social: string;
  cnpj: string;
  ativa: Generated<boolean>;
  criado_em: Criado;
}

export interface TabelaUsuario {
  id: Generated<string>;
  email: string;
  senha_hash: string;
  nome: string;
  ativo: Generated<boolean>;
  criado_em: Criado;
}

export interface TabelaMembro {
  id: Generated<string>;
  clinica_id: string;
  usuario_id: string;
  papel: string;
  ativo: Generated<boolean>;
  criado_em: Criado;
}

export interface BancoHelloDoctor {
  clinica: TabelaClinica;
  usuario: TabelaUsuario;
  membro: TabelaMembro;
}
```

Se algum nome de coluna divergir de `db/migrations/0001_fase0_fase1_baseline.sql`, o schema vence — ajustar este arquivo, nunca a migração.

- [ ] **Step 7: Escrever `db/client.ts`**

```ts
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
```

- [ ] **Step 8: Escrever `db/onboarding.ts`, isolado de propósito**

```ts
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
```

- [ ] **Step 9: Verificar e commitar em dois commits separados**

Run: `npm run typecheck && npm run lint && npm run test:rls-smoke`
Expected: os três passam.

```bash
git add db/migrations/0001_fase0_fase1_baseline.sql
git commit -m "feat(schema): migração baseline das fases 0 e 1 com RLS

Cópia integral de docs/schema-inicial.sql. A partir daqui o arquivo em
docs/ vira referência congelada; mudança de schema é migração nova."

git add db/client.ts db/onboarding.ts db/tipos.ts scripts/ tests/rls-smoke/
git commit -m "feat(db): conexão com dois roles e smoke de isolamento automatizado

comClinica() abre transação e seta app.clinica_id — único caminho de
request. comServico() (BYPASSRLS) fica isolado em arquivo próprio.
RF-001, RF-002, RF-006."
```

---

## Task 3: Sessão com Supabase Auth e clínica ativa

> **Esta tarefa foi reescrita em 30/08/2026.** A versão original especificava login por email e senha com hash argon2 e uma coluna `senha_hash`. Essa coluna nunca existiu: o schema real de `usuario` é `(id, nome, email, auth_provider_id unique, criado_em)`, desenhado para identidade delegada a provedor externo — como o próprio spec pede na tabela de stack. Provedor escolhido pelo dono: **Supabase Auth**, o mesmo fornecedor do Postgres gerenciado em região Brasil.

**Files:**
- Create: `lib/auth/consultas.ts`, `lib/auth/supabase-servidor.ts`, `lib/auth/sessao.ts`
- Create: `middleware.ts`
- Create: `app/login/page.tsx`, `app/login/action.ts`
- Create: `app/(autenticado)/layout.tsx`, `app/(autenticado)/trocar-clinica/action.ts`
- Create: `db/seed/usuario-dev.ts`
- Modify: `package.json` (dependências do Supabase), `.env.example`
- Test: `tests/rls-smoke/sessao.test.ts`

**Interfaces:**
- Consumes: `comClinica`, `comServico`, `ContextoRequest`, `BancoHelloDoctor` (Task 2)
- Produces:
  - `resolverUsuarioPorAuthId(authProviderId: string): Promise<{ id: string; nome: string; email: string } | null>`
  - `resolverClinicasDoUsuario(usuarioId: string): Promise<ClinicaDisponivel[]>` onde `ClinicaDisponivel = { id: string; razaoSocial: string }`
  - `resolverPapel(usuarioId: string, clinicaId: string): Promise<{ id: string; chave: string; nome: string } | null>`
  - `obterSessao(): Promise<SessaoAtiva | null>` onde `SessaoAtiva = { usuarioId: string; clinicaId: string; papelChave: string; clinicasDisponiveis: ClinicaDisponivel[] }`
  - `exigirSessao(): Promise<SessaoAtiva>`
  - `definirClinicaAtiva(clinicaId: string): Promise<void>`

**Onde o `clinica_id` vive (decisão registrada):** na sessão do servidor, num cookie de sessão revalidado contra o banco a cada request — **não** como custom claim no JWT do Supabase. Motivo: a Decisão 2 do spec proíbe o navegador de falar com o banco, então não usamos PostgREST e o claim não teria consumidor. Um custom claim exigiria um Auth Hook configurado no painel do Supabase, fora do versionamento, que ninguém revisa em PR. O cookie é código, é revisável, e alimenta o `set_config` do RLS igual. Não há assinatura criptográfica: a proteção contra cookie adulterado vem de `escolherClinicaAtiva` e `validarClinicaDisponivel` revalidarem o id contra a lista de clínicas que o usuário realmente pode acessar, buscada do banco a cada request.

**Limitação honesta desta tarefa:** não há Supabase CLI nesta máquina, logo não há stack local de identidade. Os testes cobrem a camada que é nossa — resolução de usuário, clínicas, papel e a regra do RF-003 — contra o Postgres local. O fluxo de login pelo Supabase é verificado por typecheck e build, não por teste automatizado. **Não escreva teste que pule silenciosamente quando faltar variável de ambiente**; se um teste precisa de recurso ausente, ele não deve existir nesta tarefa.

- [ ] **Step 1: Escrever o teste da regra central (RF-003)**

A regra: **um usuário só tem sessão válida numa clínica onde é `membro` ativo.** Existir em `usuario` não basta.

Em `tests/rls-smoke/sessao.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import {
  resolverUsuarioPorAuthId,
  resolverClinicasDoUsuario,
  resolverPapel,
} from "@/lib/auth/consultas";

const URL_SERVICO = process.env.DATABASE_URL_SERVICO;
if (!URL_SERVICO) {
  throw new Error(
    "DATABASE_URL_SERVICO não definida. Suba o banco com `npm run db:efemero` " +
      "e exporte as variáveis antes de rodar os testes. Este teste NÃO pula: " +
      "uma suíte de segurança que some sozinha é pior do que uma que falha.",
  );
}

let servico: pg.Client;
const CLINICA = "33333333-3333-3333-3333-333333333333";
const AUTH_COM = "auth-provider-com-clinica";
const AUTH_SEM = "auth-provider-sem-clinica";
let usuarioComId = "";
let usuarioSemId = "";
let papelDonaId = "";

beforeAll(async () => {
  servico = new pg.Client({ connectionString: URL_SERVICO });
  await servico.connect();

  await servico.query(
    `insert into clinica (id, razao_social, cnpj)
     values ($1, 'Clinica Sessao', '33333333000191')
     on conflict (id) do nothing`,
    [CLINICA],
  );

  const papel = await servico.query<{ id: string }>(
    `insert into papel (chave, nome) values ('dona', 'Dona da clínica')
     on conflict (chave) do update set nome = excluded.nome
     returning id`,
  );
  papelDonaId = papel.rows[0]!.id;

  const com = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Com Clinica', 'com@teste.local', $1)
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
    [AUTH_COM],
  );
  usuarioComId = com.rows[0]!.id;

  const sem = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Sem Clinica', 'sem@teste.local', $1)
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
    [AUTH_SEM],
  );
  usuarioSemId = sem.rows[0]!.id;

  await servico.query(
    `insert into membro (clinica_id, usuario_id, papel_id)
     values ($1, $2, $3)
     on conflict (clinica_id, usuario_id) do update set ativo = true`,
    [CLINICA, usuarioComId, papelDonaId],
  );
});

afterAll(async () => {
  await servico?.end();
});

describe("identidade vem do provedor externo", () => {
  it("resolve o usuário pelo auth_provider_id", async () => {
    const u = await resolverUsuarioPorAuthId(AUTH_COM);
    expect(u?.id).toBe(usuarioComId);
    expect(u?.email).toBe("com@teste.local");
  });

  it("devolve null para auth_provider_id desconhecido", async () => {
    expect(await resolverUsuarioPorAuthId("nao-existe")).toBeNull();
  });
});

describe("sessão exige membro ativo (RF-003)", () => {
  it("usuário com membro ativo recebe a clínica", async () => {
    const clinicas = await resolverClinicasDoUsuario(usuarioComId);
    expect(clinicas).toHaveLength(1);
    expect(clinicas[0]?.id).toBe(CLINICA);
  });

  it("usuário sem membro não recebe nenhuma clínica", async () => {
    expect(await resolverClinicasDoUsuario(usuarioSemId)).toHaveLength(0);
  });

  it("membro inativo não conta como clínica disponível", async () => {
    await servico.query("update membro set ativo = false where usuario_id = $1", [usuarioComId]);
    expect(await resolverClinicasDoUsuario(usuarioComId)).toHaveLength(0);
    await servico.query("update membro set ativo = true where usuario_id = $1", [usuarioComId]);
  });

  it("clínica inativa não conta como disponível", async () => {
    await servico.query("update clinica set ativa = false where id = $1", [CLINICA]);
    expect(await resolverClinicasDoUsuario(usuarioComId)).toHaveLength(0);
    await servico.query("update clinica set ativa = true where id = $1", [CLINICA]);
  });
});

describe("papel vem por FK, não por string", () => {
  it("resolve chave e nome do papel do membro", async () => {
    const papel = await resolverPapel(usuarioComId, CLINICA);
    expect(papel?.chave).toBe("dona");
    expect(papel?.nome).toBe("Dona da clínica");
  });

  it("devolve null para usuário sem membro naquela clínica", async () => {
    expect(await resolverPapel(usuarioSemId, CLINICA)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run db:efemero` e, com as variáveis exportadas, `npx vitest run tests/rls-smoke/sessao.test.ts`
Expected: FAIL — `@/lib/auth/consultas` não existe.

- [ ] **Step 3: Escrever `lib/auth/consultas.ts`**

Usa `comServico` porque roda **antes** de existir clínica ativa — é o caso (a) previsto para o role privilegiado na Task 2.

```ts
import "server-only";
import { comServico } from "@/db/onboarding";

export type ClinicaDisponivel = { id: string; razaoSocial: string };
export type PapelResolvido = { id: string; chave: string; nome: string };

export async function resolverUsuarioPorAuthId(
  authProviderId: string,
): Promise<{ id: string; nome: string; email: string } | null> {
  return comServico(async (db) => {
    const linha = await db
      .selectFrom("usuario")
      .select(["id", "nome", "email"])
      .where("auth_provider_id", "=", authProviderId)
      .executeTakeFirst();
    return linha ?? null;
  });
}

export async function resolverClinicasDoUsuario(
  usuarioId: string,
): Promise<ClinicaDisponivel[]> {
  return comServico(async (db) => {
    const linhas = await db
      .selectFrom("membro")
      .innerJoin("clinica", "clinica.id", "membro.clinica_id")
      .select(["clinica.id as id", "clinica.razao_social as razaoSocial"])
      .where("membro.usuario_id", "=", usuarioId)
      .where("membro.ativo", "=", true)
      .where("clinica.ativa", "=", true)
      .orderBy("clinica.razao_social")
      .execute();
    return linhas.map((l) => ({ id: l.id, razaoSocial: l.razaoSocial }));
  });
}

export async function resolverPapel(
  usuarioId: string,
  clinicaId: string,
): Promise<PapelResolvido | null> {
  return comServico(async (db) => {
    const linha = await db
      .selectFrom("membro")
      .innerJoin("papel", "papel.id", "membro.papel_id")
      .select(["papel.id as id", "papel.chave as chave", "papel.nome as nome"])
      .where("membro.usuario_id", "=", usuarioId)
      .where("membro.clinica_id", "=", clinicaId)
      .where("membro.ativo", "=", true)
      .executeTakeFirst();
    return linha ?? null;
  });
}
```

Se `db/tipos.ts` ainda não declarar `papel`, acrescente a interface seguindo o schema (`id`, `chave`, `nome`, `criado_em`) e registre-a em `BancoHelloDoctor`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/rls-smoke/sessao.test.ts`
Expected: PASS, os 8 testes.

- [ ] **Step 5: Instalar o Supabase e escrever o cliente de servidor**

```bash
npm install @supabase/supabase-js@2.47.10 @supabase/ssr@0.5.2
```

Em `lib/auth/supabase-servidor.ts`:

```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function clienteSupabaseServidor() {
  const armazem = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => armazem.getAll(),
        setAll: (lista) => {
          try {
            for (const { name, value, options } of lista) {
              armazem.set(name, value, options);
            }
          } catch {
            // chamado de Server Component: o middleware cuida do refresh
          }
        },
      },
    },
  );
}
```

Acrescentar ao `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=chave-anon-do-projeto
```

- [ ] **Step 6: Escrever `lib/auth/sessao.ts`**

```ts
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clienteSupabaseServidor } from "./supabase-servidor";
import {
  resolverUsuarioPorAuthId,
  resolverClinicasDoUsuario,
  resolverPapel,
  type ClinicaDisponivel,
} from "./consultas";

const COOKIE_CLINICA = "hd_clinica_ativa";

export type SessaoAtiva = {
  usuarioId: string;
  clinicaId: string;
  papelChave: string;
  clinicasDisponiveis: ClinicaDisponivel[];
};

export async function obterSessao(): Promise<SessaoAtiva | null> {
  const supabase = await clienteSupabaseServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const usuario = await resolverUsuarioPorAuthId(data.user.id);
  if (!usuario) return null;

  const disponiveis = await resolverClinicasDoUsuario(usuario.id);
  if (disponiveis.length === 0) return null;

  const armazem = await cookies();
  const pedida = armazem.get(COOKIE_CLINICA)?.value;
  const escolhida =
    disponiveis.find((c) => c.id === pedida) ?? disponiveis[0]!;

  const papel = await resolverPapel(usuario.id, escolhida.id);
  if (!papel) return null;

  return {
    usuarioId: usuario.id,
    clinicaId: escolhida.id,
    papelChave: papel.chave,
    clinicasDisponiveis: disponiveis,
  };
}

export async function exigirSessao(): Promise<SessaoAtiva> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  return sessao;
}

export async function definirClinicaAtiva(clinicaId: string): Promise<void> {
  const sessao = await exigirSessao();
  if (!sessao.clinicasDisponiveis.some((c) => c.id === clinicaId)) {
    throw new Error("Clínica não disponível para este usuário");
  }
  const armazem = await cookies();
  armazem.set(COOKIE_CLINICA, clinicaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
```

**Note a validação em `definirClinicaAtiva`:** sem ela, um cookie forjado faria o `set_config` apontar para outro tenant e o RLS filtraria pela clínica errada — com permissão total. É a linha mais importante do arquivo.

`obterSessao` também valida o cookie contra a lista de disponíveis (`disponiveis.find(...)`), então um cookie adulterado degrada para a primeira clínica legítima em vez de vazar.

- [ ] **Step 7: Escrever o middleware de refresh de sessão**

Em `middleware.ts` na raiz:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          for (const { name, value, options } of lista) {
            resposta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login).*)"],
};
```

- [ ] **Step 8: Escrever login, shell autenticado e troca de clínica**

`app/login/action.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { clienteSupabaseServidor } from "@/lib/auth/supabase-servidor";

export async function entrarComEmail(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const senha = String(formData.get("senha") ?? "");

  const supabase = await clienteSupabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) redirect("/login?erro=credenciais");
  redirect("/");
}
```

`app/login/page.tsx`:

```tsx
import { entrarComEmail } from "./action";

export default function PaginaLogin() {
  return (
    <main>
      <h1>Hello Doctor</h1>
      <form action={entrarComEmail}>
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <label htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" required autoComplete="current-password" />
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
```

`app/(autenticado)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { exigirSessao } from "@/lib/auth/sessao";

export default async function LayoutAutenticado({ children }: { children: ReactNode }) {
  const sessao = await exigirSessao();
  return <div data-clinica={sessao.clinicaId}>{children}</div>;
}
```

`app/(autenticado)/trocar-clinica/action.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { definirClinicaAtiva } from "@/lib/auth/sessao";

export async function trocarClinica(clinicaId: string): Promise<void> {
  await definirClinicaAtiva(clinicaId);
  revalidatePath("/", "layout");
}
```

- [ ] **Step 9: Escrever o seed de desenvolvimento**

Em `db/seed/usuario-dev.ts`, um script idempotente que cria clínica, papel, usuário e membro de desenvolvimento a partir de um `auth_provider_id` recebido por argumento — o id que o Supabase devolve ao criar o usuário no painel. Sem isso não há como entrar no sistema depois de autenticar.

O script usa `comServico`, imprime o que criou, e usa `on conflict do nothing` / `do update` para poder rodar mais de uma vez sem duplicar.

- [ ] **Step 10: Verificar e commitar**

Run: `npm run lint && npm run typecheck && npm test`
Expected: os três passam, com o banco efêmero de pé e as variáveis exportadas.

```bash
git add lib/auth/ app/ middleware.ts db/seed/ tests/rls-smoke/sessao.test.ts package.json .env.example
git commit -m "feat(auth): sessão com Supabase Auth e clínica ativa

Identidade vem do provedor externo via auth_provider_id; o clinica_id
vive na sessão do servidor e alimenta o RLS. Usuário sem membro ativo
não obtém sessão. RF-003."
```

- [ ] **Step 11: Marco da fatia — verificação final**

```bash
npm run db:efemero
npm run db:migrate
npm run lint && npm run typecheck && npm run build && npm test
```

Neste ponto existe um repositório com schema aplicado, isolamento provado por teste automatizado, auditoria imutável verificada, e uma sessão que carrega a clínica ativa para o RLS.

**O que esta fatia NÃO entrega, de propósito:** RBAC (tarefa 0.4), cadastro de clínica pela interface (0.5), a suíte completa de isolamento com manifesto (0.6) e a política de visibilidade de paciente (0.7). Ficam para a Fatia 2.

---

## Notas de execução

- **Docker é pré-requisito.** Não estava ativo na máquina no momento do planejamento — subir o Docker Desktop antes de começar a Task 2.
- **A alegação de que o schema já foi validado precisa ser reproduzida.** O plano de construção afirma que `docs/schema-inicial.sql` passou por 7 testes manuais num Postgres 16 efêmero; isso não foi confirmado de forma independente. O Step 5 da Task 2 é exatamente essa reprodução — se algum teste falhar ali, o problema está no schema e a correção vem antes de seguir.
- **Provedor de Postgres gerenciado ainda não escolhido.** A Task 2 roda inteiramente em Docker local. A escolha do provedor (região Brasil, decisão 4 do spec) só bloqueia o primeiro deploy, não o desenvolvimento — e é decisão do Davi, envolve conta e custo.

---

## Correções aplicadas no self-review

Dois defeitos encontrados na revisão do próprio plano, corrigidos inline antes da entrega:

1. **`comClinica` usava `executeQuery` com um `RawNode` forjado e `as never`.** Isso não compila contra a API pública do Kysely e o `as never` escondia o erro do TypeScript — exatamente o tipo de gambiarra que o `strict` deste projeto existe para impedir. Substituído pela tag `sql` do próprio Kysely, que parametriza corretamente.

2. **`trocarClinica` validava a permissão e não trocava nada.** A função checava se o usuário podia acessar a clínica e terminava com um comentário dizendo que a troca aconteceria "no cliente" — ou seja, não acontecia. Corrigido com `unstable_update` do Auth.js v5, que dispara o callback `jwt` com `trigger: "update"` já previsto no Step 6.
