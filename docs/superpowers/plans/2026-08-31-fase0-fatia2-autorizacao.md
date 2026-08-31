# Hello Doctor — Fase 0, Fatia 2: Autorização

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que toda leitura e escrita de dado passe por uma sessão autenticada e por uma permissão verificada no servidor, e cadastrar as entidades que o resto do sistema pende.

**Architecture:** Um único helper (`comClinicaDaSessao`) amarra sessão e banco, de forma que nenhum call-site precise montar o contexto de tenant à mão — é a correção da lacuna nº 1 deixada pela Fatia 1. Por cima dele, uma checagem de permissão que roda no servidor **antes** de qualquer query, contra uma matriz papel × módulo × operação semeada no banco. Os cadastros de clínica, unidade, membro e profissional usam essas duas peças.

**Tech Stack:** Next.js 15 App Router · TypeScript strict · Kysely · PostgreSQL 16 · Supabase Auth · Vitest

**Spec:** `docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md`
**Fatia anterior:** `docs/superpowers/plans/2026-08-30-fase0-fatia1-fundacao.md`
**Pendências que esta fatia fecha:** `docs/PENDENCIAS-FATIA-2.md` item 1
**Matriz de permissões:** `docs/modulos-e-funcionalidades.md` seção 4.2
**Convenções:** `docs/estrutura-do-projeto.md` — leitura obrigatória

## Global Constraints

- **TypeScript strict.** `any` é erro de lint, não warning. `!` (non-null assertion) é proibido pelo `tseslint.configs.strict` — use guards explícitos.
- **Domínio em português** (tabela, coluna, tipo, Server Action, módulo). Infraestrutura genérica em inglês.
- **Arquivos em kebab-case.** Componente PascalCase, função camelCase, tipo PascalCase.
- **Acesso a dado só via Server Action ou Route Handler.** A regra de lint `local/sem-banco-no-cliente` quebra o build se um `"use client"` importar `db`, `kysely` ou `pg` — por import estático, relativo, dinâmico ou re-export.
- **`import "server-only"` na primeira linha** de todo módulo novo que toque banco ou sessão. Isso impede que ele importe em teste sem `vi.mock("server-only", () => ({}))` de escopo de arquivo — siga o padrão de `tests/rls-smoke/com-clinica.test.ts`.
- **Nenhum teste pode pular silenciosamente.** Todo teste que dependa do banco tem guard **no topo do módulo** (não dentro do `beforeAll`) que lança erro acionável se faltarem `DATABASE_URL` e `DATABASE_URL_SERVICO`.
- **O schema vence.** Se um snippet deste plano divergir de `db/migrations/0001_fase0_fase1_baseline.sql`, o schema está certo. Foi assim que a Fatia 1 quebrou.
- **Migração é SQL escrito à mão**, arquivo novo numerado, nunca editando o `0001`.
- **Seed é dado, vive em `db/seed/`**, é idempotente e roda depois da migração.
- **Commits:** Conventional Commits, tipo em inglês, escopo e descrição em português, minúscula, sem ponto final. Sem atribuição a Claude ou Anthropic; use `git -c user.name="Davi" -c user.email="davi@linkeed.com.br" commit`.
- **Branch por tarefa.** Nunca commitar direto em `main`.
- **Depois que os testes passarem, sabote.** Quebre a regra que cada teste protege e confirme que ele falha. Um teste que passa com o código quebrado é pior que nenhum teste — nesta base isso já aconteceu três vezes.

## Enums e tabelas relevantes (do schema aplicado, não invente)

```
vinculo_profissional     = 'clt' | 'pj_parceiro' | 'aluguel_sala'
conselho_profissional    = 'CRM' | 'CRO' | 'CRBM' | 'COREN' | 'CREFITO'
operacao_permissao       = 'ver' | 'criar' | 'editar' | 'excluir' | 'aprovar'

papel(id, chave unique, nome, criado_em)
permissao(id, papel_id → papel, modulo, operacao, unique(papel_id, modulo, operacao))
clinica(id, razao_social, nome_fantasia, cnpj unique + check ^\d{14}$, ativa, criado_em, atualizado_em)
unidade(id, clinica_id, nome, endereco jsonb, ativa, criado_em)
usuario(id, nome, email, auth_provider_id unique, criado_em)
membro(id, clinica_id, usuario_id, papel_id, ativo, criado_em, unique(clinica_id, usuario_id))
profissional(id, clinica_id, membro_id unique, conselho, numero_conselho, uf char(2), habilitacoes text[], vinculo, criado_em)
```

## Estrutura de arquivos desta fatia

| Arquivo | Responsabilidade |
|---|---|
| `db/com-sessao.ts` | `comClinicaDaSessao` — o único caminho de dado de request |
| `lib/autorizacao/matriz.ts` | A matriz papel × módulo × operação, como dado tipado |
| `lib/autorizacao/verificar.ts` | `exigirPermissao` — checagem no servidor antes de qualquer query |
| `db/seed/papeis-permissoes.ts` | Semeia `papel` e `permissao` a partir da matriz, idempotente |
| `modules/adm/schema.ts` | Validação Zod dos cadastros |
| `modules/adm/queries.ts` | Leituras de clínica, unidade, membro, profissional |
| `modules/adm/actions.ts` | Server Actions dos cadastros |
| `modules/adm/onboarding.ts` | Criação de tenant — único lugar que usa `comServico` |
| `tests/unit/matriz-permissoes.test.ts` | A matriz como dado: unidade pura |
| `tests/rls-smoke/com-sessao.test.ts` | O helper usa a sessão, não parâmetro |
| `tests/rls-smoke/autorizacao.test.ts` | Cada papel × cada operação restrita |
| `tests/rls-smoke/adm-cadastros.test.ts` | Cadastros e suas regras |

---

## Task 1: O helper `comClinicaDaSessao`

Fecha a pendência nº 1 de `docs/PENDENCIAS-FATIA-2.md`. Hoje `comClinica({ clinicaId, usuarioId }, fn)` recebe dois textos soltos e nada impede um call-site de misturar sessões ou pegar o `clinicaId` de um `formData`.

**Files:**
- Create: `db/com-sessao.ts`
- Test: `tests/rls-smoke/com-sessao.test.ts`

**Interfaces:**
- Consumes: `comClinica`, `ContextoRequest` (`db/client.ts`); `exigirSessao`, `SessaoAtiva` (`lib/auth/sessao.ts`)
- Produces: `comClinicaDaSessao<T>(fn: (trx: Transaction<BancoHelloDoctor>, sessao: SessaoAtiva) => Promise<T>): Promise<T>`

- [ ] **Step 1: Escrever o teste antes**

O que este teste precisa provar: o contexto de tenant vem da **sessão**, e não há como o chamador informá-lo.

```ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` " +
      "e exporte as variáveis. Esta suíte NÃO pula: uma suíte de segurança que some sozinha " +
      "é pior do que uma que falha.",
  );
}

vi.mock("server-only", () => ({}));

const CLINICA_SESSAO = "77777777-7777-7777-7777-777777777777";
const CLINICA_ALHEIA = "88888888-8888-8888-8888-888888888888";
let usuarioId = "";

const sessaoFalsa = {
  usuarioId: "",
  clinicaId: CLINICA_SESSAO,
  papelChave: "dona",
  clinicasDisponiveis: [{ id: CLINICA_SESSAO, razaoSocial: "Clinica da Sessao" }],
};

vi.mock("@/lib/auth/sessao", () => ({
  exigirSessao: async () => sessaoFalsa,
}));

let servico: pg.Client;

beforeAll(async () => {
  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();
  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values
       ($1, 'Clinica da Sessao', '77777777000191'),
       ($2, 'Clinica Alheia', '88888888000191')
     on conflict (id) do nothing`,
    [CLINICA_SESSAO, CLINICA_ALHEIA],
  );
  const u = await servico.query<{ id: string }>(
    `insert into usuario (nome, email, auth_provider_id)
     values ('Usuario Sessao', 'sessao@teste.local', 'auth-sessao')
     on conflict (auth_provider_id) do update set nome = excluded.nome
     returning id`,
  );
  const linha = u.rows[0];
  if (!linha) throw new Error("falha ao semear usuario");
  usuarioId = linha.id;
  sessaoFalsa.usuarioId = usuarioId;
});

afterAll(async () => {
  await servico?.end();
});

describe("comClinicaDaSessao", () => {
  it("enxerga a clínica da sessão", async () => {
    const { comClinicaDaSessao } = await import("../../db/com-sessao");
    const achou = await comClinicaDaSessao(async (trx) => {
      const r = await trx
        .selectFrom("clinica")
        .select("id")
        .where("id", "=", CLINICA_SESSAO)
        .executeTakeFirst();
      return r?.id ?? null;
    });
    expect(achou).toBe(CLINICA_SESSAO);
  });

  it("NÃO enxerga clínica alheia, mesmo consultando o id direto", async () => {
    const { comClinicaDaSessao } = await import("../../db/com-sessao");
    const achou = await comClinicaDaSessao(async (trx) => {
      const r = await trx
        .selectFrom("clinica")
        .select("id")
        .where("id", "=", CLINICA_ALHEIA)
        .executeTakeFirst();
      return r?.id ?? null;
    });
    expect(achou).toBeNull();
  });

  it("entrega a sessão ao callback, para o chamador não precisar buscá-la de novo", async () => {
    const { comClinicaDaSessao } = await import("../../db/com-sessao");
    const vista = await comClinicaDaSessao(async (_trx, sessao) => sessao);
    expect(vista.clinicaId).toBe(CLINICA_SESSAO);
    expect(vista.usuarioId).toBe(usuarioId);
    expect(vista.papelChave).toBe("dona");
  });

  it("propaga usuarioId da sessão para app.usuario_id", async () => {
    const { comClinicaDaSessao } = await import("../../db/com-sessao");
    const { sql } = await import("kysely");
    const lido = await comClinicaDaSessao(async (trx) => {
      const r = await sql<{ valor: string | null }>`
        select current_setting('app.usuario_id', true) as valor`.execute(trx);
      return r.rows[0]?.valor ?? null;
    });
    expect(lido).toBe(usuarioId);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/rls-smoke/com-sessao.test.ts`
Expected: FAIL — `db/com-sessao.ts` não existe.

- [ ] **Step 3: Implementar o helper**

```ts
import "server-only";
import type { Transaction } from "kysely";
import { comClinica } from "./client";
import type { BancoHelloDoctor } from "./tipos";
import { exigirSessao, type SessaoAtiva } from "@/lib/auth/sessao";

/**
 * O ÚNICO caminho de leitura/escrita de dado num request autenticado.
 *
 * Existe porque `comClinica` recebe `{clinicaId, usuarioId}` como dois textos
 * soltos: nada no compilador impede um call-site de montar esse par a partir
 * de formData, query string, ou de duas sessões diferentes. Aqui o contexto
 * vem de `exigirSessao()` e não há parâmetro para o chamador informá-lo.
 *
 * Se você está prestes a chamar `comClinica` direto numa Server Action, pare:
 * use este helper. `comClinica` fica reservado para migração, seed e teste.
 */
export async function comClinicaDaSessao<T>(
  fn: (trx: Transaction<BancoHelloDoctor>, sessao: SessaoAtiva) => Promise<T>,
): Promise<T> {
  const sessao = await exigirSessao();
  return comClinica(
    { clinicaId: sessao.clinicaId, usuarioId: sessao.usuarioId },
    (trx) => fn(trx, sessao),
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/rls-smoke/com-sessao.test.ts`
Expected: PASS, os 4 testes.

- [ ] **Step 5: Sabotar e confirmar que o teste pega**

Troque `clinicaId: sessao.clinicaId` por `clinicaId: CLINICA_ALHEIA` fixo (ou por qualquer outro id) e rode de novo. **O teste "NÃO enxerga clínica alheia" precisa falhar.** Restaure e confirme verde. Registre no relatório o resultado das duas execuções.

- [ ] **Step 6: Commitar**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add db/com-sessao.ts tests/rls-smoke/com-sessao.test.ts
git commit -m "feat(db): helper comClinicaDaSessao como unico caminho de dado de request

comClinica recebe clinicaId e usuarioId como textos soltos e nada impede
um call-site de monta-los de formData ou de sessoes diferentes. Aqui o
contexto vem de exigirSessao() e nao ha parametro para informa-lo.
Fecha o item 1 de docs/PENDENCIAS-FATIA-2.md."
```

---

## Task 2: RBAC — permissão verificada no servidor

**Files:**
- Create: `lib/autorizacao/matriz.ts`, `lib/autorizacao/verificar.ts`
- Create: `db/seed/papeis-permissoes.ts`
- Modify: `package.json` (script `db:seed`)
- Test: `tests/unit/matriz-permissoes.test.ts`, `tests/rls-smoke/autorizacao.test.ts`

**Interfaces:**
- Consumes: `comServico` (`db/onboarding.ts`), `comClinicaDaSessao` (Task 1)
- Produces:
  - `type Modulo` e `type Operacao` (união de literais)
  - `MATRIZ: ReadonlyArray<{ papel: string; modulo: Modulo; operacoes: readonly Operacao[] }>`
  - `podeNaMatriz(papelChave: string, modulo: Modulo, operacao: Operacao): boolean`
  - `exigirPermissao(modulo: Modulo, operacao: Operacao): Promise<SessaoAtiva>` — lança se o papel da sessão não tem a operação

- [ ] **Step 1: Escrever a matriz como dado tipado**

Fonte: `docs/modulos-e-funcionalidades.md` seção 4.2. Esta fatia semeia apenas os módulos que já existem em código (`adm`) mais os da Fase 1, para o seed não referenciar módulo inexistente. Os papéis vêm da seção 4: `dona`, `gestora`, `profissional`, `recepcao`, `financeiro`, `consultora_comercial`, `paciente`.

Em `lib/autorizacao/matriz.ts`:

```ts
export const MODULOS = [
  "adm", "agd", "prt", "mid", "cat", "tpr", "pre", "fin", "mig", "pfl",
] as const;
export type Modulo = (typeof MODULOS)[number];

export const OPERACOES = ["ver", "criar", "editar", "excluir", "aprovar"] as const;
export type Operacao = (typeof OPERACOES)[number];

export const PAPEIS = [
  { chave: "dona", nome: "Dona da clínica" },
  { chave: "gestora", nome: "Gestora" },
  { chave: "profissional", nome: "Profissional" },
  { chave: "recepcao", nome: "Recepção" },
  { chave: "financeiro", nome: "Financeiro" },
  { chave: "consultora_comercial", nome: "Consultora comercial" },
  { chave: "paciente", nome: "Paciente" },
] as const;

type Entrada = { papel: string; modulo: Modulo; operacoes: readonly Operacao[] };

/**
 * Matriz de docs/modulos-e-funcionalidades.md seção 4.2.
 * Ausência de entrada = sem acesso ao módulo. Não existe permissão implícita.
 */
export const MATRIZ: readonly Entrada[] = [
  { papel: "dona", modulo: "adm", operacoes: ["ver", "criar", "editar", "excluir", "aprovar"] },
  { papel: "dona", modulo: "agd", operacoes: ["ver", "criar", "editar", "excluir", "aprovar"] },
  { papel: "dona", modulo: "prt", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "fin", operacoes: ["ver", "criar", "editar", "excluir", "aprovar"] },
  { papel: "dona", modulo: "cat", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "tpr", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "mid", operacoes: ["ver", "criar", "editar", "excluir"] },
  { papel: "dona", modulo: "pfl", operacoes: ["ver", "editar"] },
  { papel: "dona", modulo: "mig", operacoes: ["ver", "criar"] },

  { papel: "gestora", modulo: "adm", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "agd", operacoes: ["ver", "criar", "editar", "aprovar"] },
  { papel: "gestora", modulo: "prt", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "fin", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "cat", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "tpr", operacoes: ["ver", "criar", "editar"] },
  { papel: "gestora", modulo: "mid", operacoes: ["ver", "criar", "editar"] },

  { papel: "profissional", modulo: "agd", operacoes: ["ver", "criar", "editar"] },
  { papel: "profissional", modulo: "prt", operacoes: ["ver", "criar", "editar"] },
  { papel: "profissional", modulo: "mid", operacoes: ["ver", "criar"] },
  { papel: "profissional", modulo: "cat", operacoes: ["ver", "criar"] },
  { papel: "profissional", modulo: "pre", operacoes: ["ver", "criar", "editar"] },

  { papel: "recepcao", modulo: "agd", operacoes: ["ver", "criar", "editar"] },
  { papel: "recepcao", modulo: "prt", operacoes: ["ver", "criar"] },
  { papel: "recepcao", modulo: "mid", operacoes: ["ver", "criar"] },
  { papel: "recepcao", modulo: "cat", operacoes: ["ver"] },
  { papel: "recepcao", modulo: "tpr", operacoes: ["ver"] },
  { papel: "recepcao", modulo: "fin", operacoes: ["ver", "criar"] },

  { papel: "financeiro", modulo: "fin", operacoes: ["ver", "criar", "editar", "aprovar"] },
  { papel: "financeiro", modulo: "agd", operacoes: ["ver"] },
  { papel: "financeiro", modulo: "cat", operacoes: ["ver"] },
  { papel: "financeiro", modulo: "tpr", operacoes: ["ver"] },

  { papel: "consultora_comercial", modulo: "agd", operacoes: ["ver", "criar"] },
  { papel: "consultora_comercial", modulo: "cat", operacoes: ["ver"] },
  { papel: "consultora_comercial", modulo: "tpr", operacoes: ["ver"] },
];

export function podeNaMatriz(
  papelChave: string,
  modulo: Modulo,
  operacao: Operacao,
): boolean {
  return MATRIZ.some(
    (e) => e.papel === papelChave && e.modulo === modulo && e.operacoes.includes(operacao),
  );
}
```

- [ ] **Step 2: Testar a matriz como unidade pura**

Em `tests/unit/matriz-permissoes.test.ts` — sem banco, sem guard de env:

```ts
import { describe, it, expect } from "vitest";
import { MATRIZ, MODULOS, OPERACOES, PAPEIS, podeNaMatriz } from "@/lib/autorizacao/matriz";

describe("matriz de permissões", () => {
  it("não tem entrada duplicada de papel + módulo", () => {
    const chaves = MATRIZ.map((e) => `${e.papel}:${e.modulo}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("só referencia papéis declarados", () => {
    const validos = new Set(PAPEIS.map((p) => p.chave));
    for (const e of MATRIZ) expect(validos.has(e.papel)).toBe(true);
  });

  it("só referencia módulos e operações declarados", () => {
    for (const e of MATRIZ) {
      expect(MODULOS).toContain(e.modulo);
      for (const op of e.operacoes) expect(OPERACOES).toContain(op);
    }
  });

  it("dona pode excluir em adm; recepção não", () => {
    expect(podeNaMatriz("dona", "adm", "excluir")).toBe(true);
    expect(podeNaMatriz("recepcao", "adm", "excluir")).toBe(false);
  });

  it("papel sem entrada no módulo não tem nenhuma operação", () => {
    expect(podeNaMatriz("paciente", "fin", "ver")).toBe(false);
    expect(podeNaMatriz("profissional", "adm", "ver")).toBe(false);
  });

  it("papel desconhecido nunca pode", () => {
    expect(podeNaMatriz("invasor", "adm", "ver")).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar; implementar até passar**

Run: `npx vitest run tests/unit/matriz-permissoes.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 4: Escrever o seed idempotente**

Em `db/seed/papeis-permissoes.ts`. Usa `comServico` porque `papel` e `permissao` são tabelas de plataforma, sem `clinica_id`.

```ts
import { comServico } from "@/db/onboarding";
import { MATRIZ, PAPEIS } from "@/lib/autorizacao/matriz";

export async function semearPapeisEPermissoes(): Promise<{ papeis: number; permissoes: number }> {
  return comServico(async (db) => {
    for (const p of PAPEIS) {
      await db
        .insertInto("papel")
        .values({ chave: p.chave, nome: p.nome })
        .onConflict((oc) => oc.column("chave").doUpdateSet({ nome: p.nome }))
        .execute();
    }

    const papeis = await db.selectFrom("papel").select(["id", "chave"]).execute();
    const porChave = new Map(papeis.map((p) => [p.chave, p.id]));

    let permissoes = 0;
    for (const entrada of MATRIZ) {
      const papelId = porChave.get(entrada.papel);
      if (!papelId) throw new Error(`papel não semeado: ${entrada.papel}`);
      for (const operacao of entrada.operacoes) {
        await db
          .insertInto("permissao")
          .values({ papel_id: papelId, modulo: entrada.modulo, operacao })
          .onConflict((oc) => oc.columns(["papel_id", "modulo", "operacao"]).doNothing())
          .execute();
        permissoes++;
      }
    }
    return { papeis: PAPEIS.length, permissoes };
  });
}
```

Acrescente ao `package.json`: `"db:seed": "tsx scripts/db-seed.ts"`, e crie `scripts/db-seed.ts` chamando a função e imprimindo o resultado. Se `db/tipos.ts` não declarar `permissao`, acrescente conforme o schema.

- [ ] **Step 5: Escrever `exigirPermissao`**

Em `lib/autorizacao/verificar.ts`:

```ts
import "server-only";
import { exigirSessao, type SessaoAtiva } from "@/lib/auth/sessao";
import { podeNaMatriz, type Modulo, type Operacao } from "./matriz";

export class PermissaoNegada extends Error {
  constructor(
    readonly papel: string,
    readonly modulo: Modulo,
    readonly operacao: Operacao,
  ) {
    super(`Papel '${papel}' não pode '${operacao}' no módulo '${modulo}'`);
    this.name = "PermissaoNegada";
  }
}

/**
 * Verifica a permissão ANTES de qualquer query — RF-004: a ação sem permissão
 * é recusada no servidor antes de tocar o banco, não apenas escondida na UI.
 *
 * A fonte da verdade é a matriz em código, não a tabela: a tabela existe para
 * consulta e auditoria, e é semeada a partir da mesma matriz. Assim uma linha
 * apagada por engano no banco não concede acesso.
 */
export async function exigirPermissao(
  modulo: Modulo,
  operacao: Operacao,
): Promise<SessaoAtiva> {
  const sessao = await exigirSessao();
  if (!podeNaMatriz(sessao.papelChave, modulo, operacao)) {
    throw new PermissaoNegada(sessao.papelChave, modulo, operacao);
  }
  return sessao;
}
```

- [ ] **Step 6: Testar a verificação contra o banco semeado**

Em `tests/rls-smoke/autorizacao.test.ts`, com o guard de env no topo e `vi.mock` da sessão variando o `papelChave`: para **cada papel** de `PAPEIS`, e para uma amostra de módulo × operação, confirme que `exigirPermissao` resolve quando a matriz permite e lança `PermissaoNegada` quando não permite. Inclua explicitamente: `recepcao` não pode `excluir` em `adm`; `profissional` não tem nenhuma operação em `adm`; `financeiro` não pode `criar` em `prt`.

Confirme também que o seed e a matriz não divergem: leia `permissao` do banco e compare o conjunto `(papel, modulo, operacao)` com o derivado de `MATRIZ`. Devem ser idênticos.

- [ ] **Step 7: Sabotar**

Faça `podeNaMatriz` retornar sempre `true` e rode: os testes de negação precisam falhar. Restaure. Depois apague uma linha de `permissao` no banco e confirme que `exigirPermissao` **continua negando corretamente** — a fonte da verdade é a matriz, não a tabela. Registre os dois resultados no relatório.

- [ ] **Step 8: Commitar**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git commit -m "feat(adm): rbac com matriz papel x modulo x operacao verificada no servidor

A matriz em codigo e a fonte da verdade; a tabela permissao e semeada a
partir dela para consulta e auditoria. Linha apagada no banco nao concede
acesso. RF-004."
```

---

## Task 3: Cadastros — clínica, unidade, membro e profissional

**Files:**
- Create: `modules/adm/schema.ts`, `modules/adm/queries.ts`, `modules/adm/actions.ts`, `modules/adm/onboarding.ts`
- Test: `tests/rls-smoke/adm-cadastros.test.ts`

**Interfaces:**
- Consumes: `comClinicaDaSessao` (Task 1), `exigirPermissao` (Task 2), `comServico` (`db/onboarding.ts`)
- Produces: `criarClinica`, `criarUnidade`, `adicionarMembro`, `registrarProfissional`, e as leituras correspondentes

- [ ] **Step 1: Escrever os testes das regras**

Regras que precisam ser provadas, cada uma com teste próprio:

1. **CNPJ inválido é recusado** — o schema tem `check (cnpj ~ '^\d{14}$')`; a validação Zod deve recusar antes, com mensagem legível.
2. **CNPJ duplicado é recusado** — `unique` no banco; a Server Action deve devolver erro tratado, não estouro.
3. **Profissional sem `vinculo` é recusado** — `vinculo` é `not null`; a validação Zod exige um dos três valores do enum.
4. **Profissional exige `membro` da mesma clínica** — `membro_id` é `unique` e o `clinica_id` do profissional precisa bater com o do membro.
5. **Criar clínica não passa por `comClinicaDaSessao`** — é o único caso legítimo de `comServico`, porque não existe `clinica_id` antes da clínica existir.
6. **Unidade e membro passam por `exigirPermissao("adm", "criar")`** — papel sem a permissão recebe `PermissaoNegada` antes de qualquer query.
7. **Unidade criada numa sessão não aparece para outra clínica** — o teste de isolamento aplicado ao cadastro real.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/rls-smoke/adm-cadastros.test.ts`
Expected: FAIL — os módulos não existem.

- [ ] **Step 3: Escrever `modules/adm/schema.ts`**

Validação Zod espelhando o schema do banco: `cnpj` com `regex(/^\d{14}$/)`, `uf` com `length(2)`, `conselho` e `vinculo` como `z.enum` com os valores exatos do banco, `habilitacoes` como `z.array(z.string()).default([])`.

- [ ] **Step 4: Escrever `modules/adm/onboarding.ts`**

Criação de tenant. **Único lugar desta fatia que usa `comServico`**, com comentário explicando por quê (não existe `clinica_id` antes da clínica existir). Cria clínica, a unidade principal, e o primeiro membro com papel `dona`, numa transação só.

- [ ] **Step 5: Escrever `modules/adm/queries.ts` e `actions.ts`**

Toda Server Action segue a mesma forma:

```ts
"use server";

export async function criarUnidade(entrada: unknown) {
  const dados = EsquemaUnidade.parse(entrada);
  await exigirPermissao("adm", "criar");
  return comClinicaDaSessao(async (trx, sessao) => {
    return trx
      .insertInto("unidade")
      .values({ clinica_id: sessao.clinicaId, nome: dados.nome, endereco: dados.endereco })
      .returning(["id", "nome"])
      .executeTakeFirstOrThrow();
  });
}
```

Note a ordem: **valida entrada → exige permissão → abre transação**. Nunca abra transação antes de verificar permissão.

- [ ] **Step 6: Rodar até passar**

Run: `npx vitest run tests/rls-smoke/adm-cadastros.test.ts`
Expected: PASS.

- [ ] **Step 7: Sabotar**

Remova a chamada de `exigirPermissao` de `criarUnidade` e rode: o teste da regra 6 precisa falhar. Restaure. Troque `clinica_id: sessao.clinicaId` por um id fixo e rode: o teste da regra 7 precisa falhar. Restaure. Registre os dois no relatório.

- [ ] **Step 8: Verificação final e commit**

```bash
export DATABASE_URL_SERVICO="postgres://postgres:postgres@localhost:55432/hello_doctor"
export DATABASE_URL="postgres://app_user:app_user@localhost:55432/hello_doctor"
npm run lint && npm run typecheck && npm run build && npm test
```

```bash
git commit -m "feat(adm): cadastros de clinica, unidade, membro e profissional

Toda Server Action valida entrada, exige permissao e so entao abre
transacao via comClinicaDaSessao. Criar clinica e o unico caso de
comServico, por nao existir clinica_id antes da clinica existir."
```

---

## O que esta fatia NÃO entrega

Fica para a Fatia 3 (tarefas 0.6 e 0.7 do plano de construção):

- **Escopo profissional aplicado** — o catálogo declarando quais conselhos executam cada procedimento, e a recusa no servidor
- **A suíte de isolamento com manifesto** — a versão que lê `information_schema` e quebra o build quando existe tabela sem teste
- **A política de visibilidade de paciente em 3 modos** — isolamento **dentro** da mesma clínica. É a peça mais delicada do projeto: um bug ali não vaza entre clínicas, vaza prontuário entre profissionais da mesma clínica, e passa por "colega bisbilhotando" em vez de erro de sistema. O plano de construção reserva 3 sessões e pede para não comprimir.
