# Hello Doctor — Fase 0, Fatia 3: Visibilidade e escopo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provar, e onde faltar corrigir, os dois mecanismos que impedem vazamento **dentro** de uma mesma clínica: quem enxerga o prontuário de quem, e quem pode executar o quê.

**Architecture:** A lógica já existe no banco — `app_paciente_visivel()` decide visibilidade em 8 policies, e o trigger `verificar_escopo_profissional()` recusa agendamento fora do conselho. Esta fatia escreve as suítes que provam esses mecanismos exaustivamente, corrige dois defeitos encontrados na leitura da função, e transforma em mecanismo a última garantia que hoje depende de disciplina: a de que toda tabela nova tenha teste de isolamento.

**Tech Stack:** Next.js 15 · TypeScript strict · Kysely · PostgreSQL (16 local, 17.6 no Supabase) · Vitest

**Spec:** `docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md` (seção 11.5 é a fonte da regra de visibilidade)
**Fatia anterior:** `docs/superpowers/plans/2026-08-31-fase0-fatia2-autorizacao.md`
**Pendências herdadas:** `docs/PENDENCIAS-FATIA-2.md`
**Convenções:** `docs/estrutura-do-projeto.md`

## Global Constraints

- **TypeScript strict.** `any` e `!` (non-null assertion) são erro de lint.
- **Domínio em português**, infraestrutura genérica em inglês. Arquivos em kebab-case.
- **`import "server-only"`** na primeira linha de módulo que toque banco ou sessão. Em teste, `vi.mock("server-only", () => ({}))` de escopo de arquivo mais `await import(...)` dinâmico.
- **Nenhum teste pode pular silenciosamente.** Guard de `DATABASE_URL` e `DATABASE_URL_SERVICO` no topo do módulo, nunca dentro do `beforeAll`.
- **Migração é SQL escrito à mão**, arquivo novo numerado. **Nunca editar o `0001`** — ele já está aplicado no Supabase.
- **Toda regra testada precisa ser sabotada depois.** Quebre o que o teste protege e confirme que ele falha. Esta base já teve cinco testes que passavam de fachada.
- **Acesso a dado só via Server Action ou Route Handler.** `comClinica` e `comServico` são proibidos fora de `db/`, `scripts/`, `tests/` (regra `local/sem-conexao-privilegiada-fora-de-infra`).
- **Ordem obrigatória em Server Action:** validar entrada (Zod) → `exigirPermissao` → `comClinicaDaSessao`.
- **Commits:** Conventional Commits, tipo em inglês, escopo e descrição em português, minúscula, sem ponto final. Sem atribuição a Claude ou Anthropic; use `git -c user.name="Davi" -c user.email="davi@linkeed.com.br" commit`.
- **Branch por tarefa**, merge em `main` só depois de review limpa.

## O que já existe no banco (não reconstrua)

```sql
-- decide visibilidade, usada em 8 policies (paciente, atendimento, ficha,
-- evolucao, medida, foto, agendamento, recebimento)
app_paciente_visivel(p_paciente_id uuid, p_escopo text default 'clinico')

politica_visibilidade_paciente(clinica_id pk, modo, atualizado_em)
  modo_visibilidade_paciente = 'isolado' | 'aberto' | 'restrito'

paciente_acesso_autorizado(id, clinica_id, paciente_id, profissional_id,
                           autorizado_por, criado_em, unique(paciente_id, profissional_id))

paciente.profissional_responsavel_id -> profissional(id)

-- escopo profissional
procedimento_conselho_autorizado(procedimento_id, conselho) pk composta
verificar_escopo_profissional()  -- trigger em agendamento
```

---

## Task 1: Corrigir os dois defeitos de `app_paciente_visivel`

**Files:**
- Create: `db/migrations/0002_visibilidade_falha_fechada.sql`
- Modify: `modules/adm/onboarding.ts` (criar a linha de política no onboarding)
- Test: `tests/rls-smoke/visibilidade-defeitos.test.ts`

**Interfaces:**
- Consumes: `comServico`, `comClinicaDaSessao`
- Produces: nada novo em TypeScript; a migração altera a função no banco

**Os dois defeitos, encontrados lendo a função:**

**Defeito 1 — falha ABERTA.** A função começa com `if v_modo is null or v_modo = 'aberto' then return true;`. Uma clínica **sem linha** em `politica_visibilidade_paciente` tem todos os pacientes visíveis a todos os profissionais. Se a linha for apagada por acidente, uma clínica configurada como `isolado` volta a ser aberta **em silêncio**. Todo o resto deste projeto falha fechado; isto é a exceção.

**Defeito 2 — `security definer` sem `search_path` fixo.** A função roda com os privilégios do dono e consulta `politica_visibilidade_paciente`, `paciente`, `profissional`, `membro` e `paciente_acesso_autorizado` sem qualificar schema. É o vetor clássico de escalada: quem conseguir criar objetos num schema à frente no `search_path` sequestra o que a função enxerga. Hoje não é explorável (o `app_user` não cria schema no Supabase), mas é dívida de segurança em código que decide quem lê prontuário.

- [ ] **Step 1: Escrever o teste dos dois defeitos, antes de corrigir**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_SERVICO) {
  throw new Error(
    "DATABASE_URL e DATABASE_URL_SERVICO precisam estar definidas. Rode `npm run db:efemero` " +
      "e exporte as variáveis. Esta suíte NÃO pula.",
  );
}

let servico: pg.Client;
const CLINICA_SEM_POLITICA = "cccc0000-0000-0000-0000-00000000000c";

beforeAll(async () => {
  servico = new pg.Client({ connectionString: process.env.DATABASE_URL_SERVICO });
  await servico.connect();
  await servico.query(
    `insert into clinica (id, razao_social, cnpj) values ($1, 'Sem Politica', '55555555000191')
     on conflict (id) do nothing`,
    [CLINICA_SEM_POLITICA],
  );
  // de propósito: NÃO cria linha em politica_visibilidade_paciente
  await servico.query("delete from politica_visibilidade_paciente where clinica_id = $1", [
    CLINICA_SEM_POLITICA,
  ]);
});

afterAll(async () => {
  await servico.query("delete from clinica where id = $1", [CLINICA_SEM_POLITICA]).catch(() => {});
  await servico?.end();
});

describe("defeito 1: clínica sem política configurada", () => {
  it("NÃO deve enxergar paciente por omissão — falha fechada", async () => {
    // paciente inexistente basta: o que se testa é o ramo v_modo is null
    const r = await servico.query<{ visivel: boolean }>(
      `select app_paciente_visivel('00000000-0000-0000-0000-000000000000'::uuid) as visivel`,
    );
    // com set_config apontando para a clínica sem política
    await servico.query("select set_config('app.clinica_id', $1, false)", [CLINICA_SEM_POLITICA]);
    const r2 = await servico.query<{ visivel: boolean }>(
      `select app_paciente_visivel('00000000-0000-0000-0000-000000000000'::uuid) as visivel`,
    );
    expect(r2.rows[0]?.visivel).toBe(false);
  });
});

describe("defeito 2: search_path fixo", () => {
  it("a função declara search_path explícito", async () => {
    const r = await servico.query<{ config: string[] | null }>(
      `select proconfig as config from pg_proc where proname = 'app_paciente_visivel'`,
    );
    const config = r.rows[0]?.config ?? [];
    expect(config.some((c) => c.startsWith("search_path="))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que os dois falham**

Run: `npx vitest run tests/rls-smoke/visibilidade-defeitos.test.ts`
Expected: FAIL nos dois — hoje a função retorna `true` sem política e não tem `proconfig`.

- [ ] **Step 3: Escrever a migração 0002**

```sql
-- 0002_visibilidade_falha_fechada.sql
--
-- Dois defeitos em app_paciente_visivel, encontrados na revisão da fatia 3:
--
-- 1. Falha ABERTA: clínica sem linha em politica_visibilidade_paciente tinha
--    todos os pacientes visíveis a todos. Uma linha apagada por acidente
--    reabria uma clínica configurada como 'isolado', em silêncio. Todo o
--    resto do projeto falha fechado; esta era a exceção.
--
-- 2. security definer sem search_path fixo: vetor clássico de escalada em
--    função que decide quem lê prontuário.
--
-- A garantia primária continua sendo o onboarding criar a linha de política.
-- Esta mudança é a rede: se a linha sumir, a clínica perde acesso e reclama
-- na hora, em vez de vazar em silêncio.

create or replace function app_paciente_visivel(
  p_paciente_id uuid,
  p_escopo text default 'clinico'
)
returns boolean as $$
declare
  v_modo modo_visibilidade_paciente;
  v_responsavel_id uuid;
  v_profissional_id uuid;
begin
  select modo into v_modo
  from politica_visibilidade_paciente
  where clinica_id = app_clinica_id();

  -- falha fechada: sem política configurada, ninguém vê
  if v_modo is null then
    return false;
  end if;

  if v_modo = 'aberto' then
    return true;
  end if;

  select profissional_responsavel_id into v_responsavel_id
  from paciente where id = p_paciente_id;

  select p.id into v_profissional_id
  from profissional p
  join membro m on m.id = p.membro_id
  where m.usuario_id = app_usuario_id() and m.clinica_id = app_clinica_id();

  if v_modo = 'restrito' and p_escopo = 'agenda_financeiro' then
    return true; -- agenda/financeiro abertos à gestão; RBAC decide quem é "gestão"
  end if;

  if v_profissional_id is not null and v_profissional_id = v_responsavel_id then
    return true;
  end if;

  return exists (
    select 1 from paciente_acesso_autorizado
    where paciente_id = p_paciente_id and profissional_id = v_profissional_id
  );
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;
```

- [ ] **Step 4: Aplicar e ver os testes passarem**

Run: `npm run db:migrate` e depois `npx vitest run tests/rls-smoke/visibilidade-defeitos.test.ts`
Expected: PASS nos dois.

- [ ] **Step 5: Garantir que o onboarding cria a política**

Como a função agora nega por omissão, `criarClinica` **precisa** criar a linha de `politica_visibilidade_paciente` na mesma transação, senão toda clínica nova nasce cega. Acrescente isso em `modules/adm/onboarding.ts`, com o modo padrão `'aberto'`, e escreva o teste que prova: criar clínica pelo fluxo real e conferir que a linha existe.

**Este teste é obrigatório** — sem ele, a correção do defeito 1 quebra o produto em vez de protegê-lo.

- [ ] **Step 6: Sabotar**

Remova a criação da política do onboarding e rode: o teste do Step 5 tem que falhar. Restaure.
Reverta a função para `if v_modo is null or v_modo = 'aberto'` e rode: o teste do defeito 1 tem que falhar. Restaure.
Reporte os dois resultados.

- [ ] **Step 7: Commitar**

```bash
git commit -m "fix(schema): app_paciente_visivel falha fechada e fixa search_path

Clinica sem politica configurada nao enxerga paciente nenhum, em vez de
enxergar todos. O onboarding passa a criar a linha de politica na mesma
transacao da clinica. RF-010, 11.5."
```

---

## Task 2: A suíte de visibilidade de paciente

Esta é a peça mais delicada do projeto. Um bug aqui **não vaza entre clínicas** — a suíte de isolamento pega isso. Vaza prontuário **entre profissionais da mesma clínica**, e passa por "colega curioso" em vez de erro de sistema. O plano de construção reserva 3 sessões e pede para não comprimir.

**Files:**
- Create: `tests/rls-smoke/visibilidade-paciente.test.ts`
- Modify: `package.json` (script `test:visibilidade-paciente`)

**A matriz a provar** — 3 modos × 2 relações com o paciente × 2 estados de grant, mais os escopos:

| Modo | Profissional é responsável | Tem grant | Escopo clínico | Escopo agenda/financeiro |
|---|---|---|---|---|
| `aberto` | sim | — | vê | vê |
| `aberto` | não | não | vê | vê |
| `isolado` | sim | — | vê | vê |
| `isolado` | não | não | **não vê** | **não vê** |
| `isolado` | não | sim | vê | vê |
| `restrito` | sim | — | vê | vê |
| `restrito` | não | não | **não vê** | vê |
| `restrito` | não | sim | vê | vê |

- [ ] **Step 1: Montar as fixturas**

Uma clínica, dois profissionais (`responsavel` e `outro`), um paciente com `profissional_responsavel_id = responsavel`. Cada caso troca o `modo` da política e a presença da linha em `paciente_acesso_autorizado`.

Os testes rodam como `app_user` (nunca com o role de serviço — testar com `BYPASSRLS` daria falso positivo em tudo), dentro de transação, com `set_config('app.clinica_id')` **e** `set_config('app.usuario_id')` — a função depende dos dois.

- [ ] **Step 2: Escrever os 8 casos da matriz acima**

Cada caso é um teste próprio, nomeado pelo cenário, exercitando a função `app_paciente_visivel` diretamente **e** um `select` real na tabela `paciente` (para provar que a policy usa a função corretamente, não só que a função devolve o booleano certo).

- [ ] **Step 3: Provar que a policy usa a função nas 8 tabelas**

`paciente`, `atendimento`, `ficha`, `evolucao`, `medida`, `foto`, `agendamento`, `recebimento` — para cada uma, no modo `isolado`, um profissional que não é responsável e não tem grant **não pode ler** a linha do paciente alheio. Este é o teste que pega uma policy que esqueceu de chamar a função.

- [ ] **Step 4: Rodar e sabotar, caso a caso**

Sabotagens obrigatórias, cada uma restaurada depois, com resultado reportado:
1. Faça a função retornar `true` sempre → os casos de "não vê" precisam falhar
2. Remova a checagem de grant (`paciente_acesso_autorizado`) → os dois casos com grant precisam falhar
3. Faça `p_escopo` ser ignorado no modo `restrito` → o caso `restrito`/não responsável/agenda precisa falhar
4. Remova a chamada da função de **uma** das 8 policies (escolha `evolucao`) → o teste daquela tabela precisa falhar

A sabotagem 4 é a mais importante: ela prova que a suíte cobre as policies, e não só a função.

- [ ] **Step 5: Commitar**

```bash
git commit -m "test(prt): suite de visibilidade de paciente nos 3 modos

Cobre modo x relacao com o paciente x grant explicito, e prova que as 8
policies chamam a funcao. Vazamento aqui e entre profissionais da mesma
clinica, que passa por colega curioso em vez de erro de sistema. RF-010."
```

---

## Task 3: Escopo profissional no servidor e o manifesto de isolamento

**Files:**
- Create: `modules/cat/escopo.ts` (checagem no servidor), `modules/cat/__tests__/`
- Create: `tests/isolamento-tenant/manifesto.ts`, `tests/isolamento-tenant/cobertura.test.ts`
- Modify: `package.json` (script `test:isolamento-tenant`)

**Parte A — escopo profissional reforçado no servidor**

O trigger `verificar_escopo_profissional()` já recusa no banco. Mas o erro que chega ao usuário é uma exceção de Postgres. A checagem no servidor existe para dar mensagem legível **antes**, sem depender da mensagem do banco — o banco continua sendo a rede.

- [ ] **Step A1:** Escrever `podeExecutar(procedimentoId, profissionalId)` em `modules/cat/escopo.ts`, consultando `procedimento_conselho_autorizado` via `comClinicaDaSessao`.
- [ ] **Step A2:** Teste: para cada conselho do enum, um procedimento que o autoriza e um que não. Provar que a função devolve o booleano certo.
- [ ] **Step A3:** Teste de defesa em profundidade: mesmo **sem** a checagem no servidor, o trigger recusa. Prove inserindo direto via `comServico` e esperando exceção com `/fora do escopo autorizado/`.
- [ ] **Step A4:** Sabote: faça `podeExecutar` retornar sempre `true` e confirme que os testes de negação falham. Restaure.

**Parte B — o manifesto de isolamento**

Hoje, "toda tabela nova precisa de teste de isolamento" é convenção escrita em `docs/estrutura-do-projeto.md`. Vira mecanismo:

- [ ] **Step B1:** Criar `tests/isolamento-tenant/manifesto.ts` exportando duas listas explícitas: as tabelas de domínio (com `clinica_id`, que precisam de teste de isolamento) e a allowlist de tabelas de plataforma (as 9 sem `clinica_id`, mais `migracao_aplicada`).

- [ ] **Step B2:** Escrever `tests/isolamento-tenant/cobertura.test.ts` que:
  1. lê `information_schema.tables` do schema `public`
  2. para cada tabela, exige que ela esteja **no manifesto** ou **na allowlist**
  3. **falha listando os nomes** das tabelas órfãs, com a instrução do que fazer

  Este teste é a garantia literal do spec ("tabela nova sem teste de isolamento quebra o build"), implementada como checagem de cobertura em vez de convenção que alguém esquece.

- [ ] **Step B3:** Escrever, no mesmo arquivo, o teste que percorre **cada tabela do manifesto** e verifica que ela tem RLS habilitado e ao menos uma policy. Uma tabela no manifesto sem RLS é pior que uma tabela órfã.

- [ ] **Step B4: Sabote (o passo que prova o mecanismo).** Crie uma tabela nova de domínio numa migração temporária, sem adicionar ao manifesto, e rode: `cobertura.test.ts` **tem que falhar nomeando a tabela**. Depois adicione ao manifesto mas sem RLS, e rode: o teste do Step B3 tem que falhar. Remova a migração temporária e confirme verde. Reporte os dois.

- [ ] **Step B5: Commitar**

```bash
git commit -m "test(db): manifesto de isolamento quebra o build em tabela sem cobertura

Toda tabela do schema precisa estar no manifesto de isolamento ou na
allowlist de plataforma, e toda tabela do manifesto precisa ter RLS e
policy. Era convencao em documento, virou mecanico. RNF-012."
```

---

## O que esta fatia NÃO entrega

Fica para a Fatia 4, que fecha a Fase 0 (tarefas 0.8 a 0.11 do plano de construção):

- **Consentimento em dois eixos** (finalidade × âncora × versão do termo)
- **Auditoria com leitura auditada** — hoje a tabela existe e é imutável, mas nada grava leitura de prontuário
- **Observabilidade** — logger com `clinica_id`/`usuario_id`/`request_id`, Sentry sem payload de paciente, health check por dependência
- **Perfil de clínica** — composição configurável de módulos, fichas, catálogos e termos

## Débito herdado da Fatia 2 (não bloqueia, registrar no fim)

- A ordem `validar → exigirPermissao → comClinicaDaSessao` é convenção, não mecanismo. Nenhuma regra obriga toda Server Action a segui-la.
- `exigirSessao()` roda duas vezes por escrita (uma em `exigirPermissao`, outra em `comClinicaDaSessao`): 6 queries de sessão antes de tocar dado de domínio.
