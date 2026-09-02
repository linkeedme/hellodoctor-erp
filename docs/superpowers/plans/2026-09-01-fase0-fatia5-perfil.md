# Hello Doctor — Fase 0, Fatia 5: Perfil de clínica

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a Fase 0 — a clínica passa a ter um perfil que define quais módulos existem para ela, e as duas dívidas de fundação são pagas.

**Architecture:** O perfil não é um `enum` no código, é dado. Uma clínica compõe seu perfil a partir de perfis de referência (harmonização e injetáveis, emagrecimento, estética com aparelho, e os que vierem), ativando módulos e herdando fichas, catálogos e termos. Abrir uma vertical nova passa a ser configuração, não deploy.

**Tech Stack:** Next.js 15 · TypeScript strict · Kysely · PostgreSQL · Vitest

**Spec:** `docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md` — seção 11.16 (`perfil_clinica` é objeto configurável, lista aberta)
**Pendências que esta fatia paga:** `docs/PENDENCIAS-FATIA-2.md`, seção "ao fim da Fatia 4"

## Global Constraints

Valem todas as convenções de `docs/estrutura-do-projeto.md`. Em resumo: TypeScript strict, `any` e `!` são erro; domínio em português, infra em inglês; kebab-case; `import "server-only"` na primeira linha de módulo que toque banco ou sessão; guard de env no topo do módulo em teste; migração é arquivo novo, nunca edita `0001` nem `0002` (ambas no Supabase); `comClinica`/`comServico` proibidos fora de `db/`, `scripts/`, `tests/`; ordem em Server Action é validar → `exigirPermissao` → `comClinicaDaSessao`; toda escrita audita; tabela nova entra no manifesto de isolamento; commits em Conventional Commits com escopo e descrição em português, sem atribuição a Claude ou Anthropic.

**E a regra que vale mais que todas:** depois que os testes ficarem verdes, sabote o código e confirme que eles falham. Sete testes desta base já passaram sem proteger nada.

## O que já existe no schema (não reconstrua)

```
perfil_referencia(id, chave unique, nome, descricao, ativo, criado_em)
perfil_referencia_ficha_template(perfil_referencia_id, ...)
perfil_referencia_procedimento(perfil_referencia_id, ..., conselhos_autorizados[])
perfil_referencia_papel(perfil_referencia_id, ...)
perfil_referencia_termo(perfil_referencia_id, ...)

perfil_clinica(id, clinica_id unique, criado_em, atualizado_em)
perfil_clinica_modulo(perfil_clinica_id, modulo, ativo)  -- CHECK com os 16 códigos
perfil_clinica_referencia(perfil_clinica_id, perfil_referencia_id)
```

---

## Task 1: Pagar as duas dívidas de fundação

**Files:**
- Create: `db/migrations/0003_termo_unico_e_versao_vigente.sql`
- Create ou modificar: `middleware.ts` (já existe, do Supabase Auth)
- Test: `tests/rls-smoke/termo-concorrencia.test.ts`, `tests/rls-smoke/request-id.test.ts`

### Dívida 1 — o schema de termo permite estado ambíguo

Hoje não há constraint impedindo duas linhas de `termo` para o mesmo `(clinica_id, finalidade, nome)`, nem garantia de que exista no máximo **uma** `termo_versao` vigente por termo. Duas assinaturas simultâneas com texto diferente podem deixar duas versões "vigentes", e a leitura escolhe uma arbitrariamente.

Numa peça que existe para **provar o que o paciente autorizou**, ambiguidade sobre qual versão vale é um defeito real.

- [ ] **Step 1: Escrever o teste que reproduz a corrida**

Duas inserções concorrentes de `termo` com o mesmo `(clinica_id, finalidade, nome)`. Hoje as duas passam. Depois da migração, a segunda tem que falhar com violação de constraint.

O mesmo para `termo_versao`: duas versões com `vigente_ate is null` no mesmo termo. Hoje passam; depois, a segunda falha.

- [ ] **Step 2: Rodar e confirmar que hoje passa (a corrida existe)**

- [ ] **Step 3: Escrever a migração 0003**

```sql
-- 0003_termo_unico_e_versao_vigente.sql
--
-- Duas ambiguidades no schema de consentimento, encontradas na review da fatia 4:
--
-- 1. Nada impedia dois `termo` com o mesmo (clinica_id, finalidade, nome).
-- 2. Nada impedia duas `termo_versao` vigentes (vigente_ate is null) no mesmo
--    termo. A leitura escolhia uma arbitrariamente.
--
-- Numa peça cujo propósito é provar o que o paciente autorizou, estado ambíguo
-- sobre qual versão vale é defeito, não detalhe.

alter table termo
  add constraint termo_unico_por_clinica unique (clinica_id, finalidade, nome);

create unique index termo_versao_unica_vigente
  on termo_versao (termo_id)
  where vigente_ate is null;
```

**Antes de aplicar:** verifique se o banco já tem dados que violam essas constraints (termos duplicados, versões vigentes duplicadas). Se tiver, a migração falha. Trate isso — e descreva no relatório o que encontrou. Esta é a mesma classe de problema do backfill da migração `0002`: uma constraint nova precisa considerar o que já existe.

- [ ] **Step 4: Aplicar, ver o teste passar, sabotar**

Sabotagem: remova a constraint e confirme que o teste da corrida volta a falhar (ou seja, a corrida volta a ser possível). Restaure.

### Dívida 2 — o `request_id` é decorativo

`comNovoContextoRequest` existe em `lib/contexto-request.ts` e **não tem nenhum call site de produção**. Cada `registrarEvento` e cada linha de log gera um id novo, então nada correlaciona com nada dentro do mesmo request.

- [ ] **Step 5: Ligar o contexto no middleware**

O `middleware.ts` já existe (faz refresh da sessão do Supabase). Envolva o processamento do request com `comNovoContextoRequest`, de forma que todo log e todo evento de auditoria daquele request compartilhem o mesmo `request_id`.

**Atenção:** o middleware do Next roda num contexto diferente das Server Actions. Verifique se o `AsyncLocalStorage` aberto no middleware realmente alcança a Server Action — pode não alcançar. Se não alcançar, diga isso no relatório e proponha onde o contexto deve ser aberto para funcionar de verdade. **Não finja que ligou se não ligou** — um `request_id` que parece correlacionar e não correlaciona é pior que um obviamente decorativo.

- [ ] **Step 6: Teste que prova a correlação**

Duas operações auditadas no mesmo request precisam gravar o **mesmo** `request_id`. Operações em requests diferentes precisam gravar ids **diferentes**.

Se você concluir no Step 5 que não dá para ligar no middleware, este teste vira a prova do caminho que você propôs.

- [ ] **Step 7: Commitar** (dois commits: um de schema, um de código)

---

## Task 2: Perfil de clínica

**Files:**
- Create: `modules/pfl/perfil.ts`, `modules/pfl/schema.ts`, `modules/pfl/__tests__/perfil.test.ts`
- Create: `db/seed/perfis-referencia.ts`
- Modify: `modules/adm/onboarding.ts` (criar o perfil junto da clínica)
- Test: `tests/rls-smoke/perfil.test.ts`

**Interfaces:**
- `criarPerfilDaClinica(clinicaId, referenciasIds)` — compõe o perfil a partir de perfis de referência
- `modulosAtivos()` — devolve os módulos ativos da clínica da sessão
- `ativarModulo(modulo)` / `desativarModulo(modulo)`
- `moduloEstaAtivo(modulo)` — a checagem que o resto do sistema consulta

**As regras a provar:**

1. Toda clínica nasce com um perfil (o onboarding cria), assim como nasce com política de visibilidade
2. Compor o perfil a partir de uma referência **ativa os módulos daquela referência**
3. Compor a partir de duas referências ativa a **união** dos módulos, sem duplicar
4. Um módulo pode ser desativado manualmente depois, mesmo vindo de uma referência
5. `moduloEstaAtivo` respeita o isolamento de tenant — a clínica A não lê o perfil da B
6. Um código de módulo fora dos 16 permitidos é rejeitado pelo `CHECK` do banco
7. `perfil_clinica_referencia` é rastreabilidade, **não fonte de verdade em runtime** — desligar uma referência depois não desliga os módulos já ativados (o comentário da tabela no schema diz isso explicitamente; respeite)

- [ ] **Step 1: Seed dos perfis de referência**

Crie `db/seed/perfis-referencia.ts` com os perfis que o dono definiu na seção 11.16: **harmonização e injetáveis**, **emagrecimento e medicina do estilo de vida**, **estética corporal e facial com aparelho**. (Cirurgia plástica é fase 5 do roadmap — crie a linha de referência, mas sem conteúdo.)

Para o perfil de harmonização, popule o conteúdo real: módulos ativos, e as fichas/procedimentos/termos que fizerem sentido. Para os outros dois, crie a referência com módulos, mas conteúdo mínimo — o dono decidiu que só o perfil de harmonização recebe curadoria real agora.

Idempotente, como os outros seeds.

- [ ] **Step 2 a 6: Os testes das 7 regras, implementação, sabotagem**

Sabotagens obrigatórias:
1. Faça `moduloEstaAtivo` ignorar o `clinica_id` → o teste da regra 5 tem que falhar
2. Faça a composição sobrescrever em vez de unir → o teste da regra 3 tem que falhar
3. Remova a criação do perfil do onboarding → o teste da regra 1 tem que falhar

- [ ] **Step 7: Commitar**

---

## Com esta fatia, a Fase 0 fecha

Depois dela, a fundação está completa: multi-tenant com RLS provado, RBAC, visibilidade de paciente em três modos, escopo profissional, auditoria de caminho único, observabilidade sem vazamento, consentimento em dois eixos, e perfil de clínica configurável.

**A Fase 1 começa em seguida** — agenda, prontuário, foto, preços, prescrição e o importador. A primeira tela que uma clínica abre.
