# Hello Doctor — Fase 0, Fatia 4: Governança

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar quem leu o quê, enxergar o sistema em produção, e provar o que cada paciente autorizou.

**Architecture:** A auditoria não é chamada opcional — o único caminho para ler dado clínico passa por um helper que grava o evento antes de devolver a linha, de forma que "esqueci de auditar" seja impossível e não apenas desaconselhado. A observabilidade carrega `clinica_id`, `usuario_id` e `request_id` em toda linha de log, e o Sentry nunca recebe dado de paciente. O consentimento é a interseção de finalidade × âncora × versão do termo, com revogação por camada.

**Tech Stack:** Next.js 15 · TypeScript strict · Kysely · PostgreSQL · Vitest

**Spec:** `docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md` — seções 4 (auditoria), 5 (LGPD), 7 (observabilidade), 11.10 (consentimento em dois eixos)
**Fatia anterior:** `docs/superpowers/plans/2026-09-01-fase0-fatia3-visibilidade.md`
**Pendências:** `docs/PENDENCIAS-FATIA-2.md`
**Convenções:** `docs/estrutura-do-projeto.md`

## Global Constraints

- **TypeScript strict.** `any` e `!` são erro de lint.
- **Domínio em português**, infraestrutura genérica em inglês. Arquivos em kebab-case.
- **`import "server-only"`** na primeira linha de módulo que toque banco ou sessão. Em teste, `vi.mock("server-only", () => ({}))` de escopo de arquivo mais `await import(...)` dinâmico.
- **Guard de env no topo do módulo** em todo teste que dependa do banco. Nenhum teste pula silenciosamente.
- **`comClinica` e `comServico` são proibidos** fora de `db/`, `scripts/`, `tests/` — regra `local/sem-conexao-privilegiada-fora-de-infra`. Use `comClinicaDaSessao`.
- **Ordem em Server Action:** validar (Zod) → `exigirPermissao` → `comClinicaDaSessao`.
- **Migração é SQL escrito à mão**, arquivo novo numerado. **Nunca editar `0001` nem `0002`** — ambas aplicadas no Supabase.
- **Toda tabela nova precisa entrar em `tests/isolamento-tenant/manifesto.ts`**, senão o build quebra. Isso é mecanismo, não lembrete.
- **Sabote todo teste que escrever.** Esta base já teve seis testes que passavam de fachada. Depois de verde, quebre a regra protegida e confirme que o teste cai.
- **Commits:** Conventional Commits, tipo em inglês, escopo e descrição em português, minúscula, sem ponto final. Sem atribuição a Claude ou Anthropic.
- **Branch por tarefa.**

## O que já existe (não reconstrua)

```
evento_auditoria(id, clinica_id, usuario_id, acao, entidade, entidade_id,
                 valor_antes jsonb, valor_depois jsonb, ip inet, request_id uuid, criado_em)
  -- imutável: triggers recusam UPDATE e DELETE com "append-only"
  -- NADA grava nela hoje

termo(id, clinica_id, finalidade, nome, criado_em)
termo_versao(id, termo_id, texto, hash_conteudo, vigente_desde, vigente_ate, criado_em)
consentimento(id, clinica_id, paciente_id, finalidade, ancora_tipo, ancora_id,
              termo_versao_id, assinado_em, evidencia jsonb, revogado_em, criado_em)

finalidade_consentimento = 'tratamento_clinico' | 'uso_interno' | 'uso_externo_marketing'
ancora_consentimento     = 'paciente' | 'protocolo_instancia' | 'atendimento' | 'foto'
```

`lib/auditoria/` e `lib/observabilidade/` existem como diretórios vazios.

---

## Task 1: Auditoria — e o caminho único de leitura

**Files:**
- Create: `lib/auditoria/registrar.ts`, `lib/auditoria/ler-auditado.ts`
- Create: `lib/contexto-request.ts`
- Test: `tests/rls-smoke/auditoria.test.ts`

**Interfaces:**
- Consumes: `comClinicaDaSessao`, `SessaoAtiva`
- Produces:
  - `registrarEvento(trx, sessao, evento: { acao, entidade, entidadeId?, valorAntes?, valorDepois? }): Promise<void>`
  - `lerAuditado<T>(entidade: string, entidadeId: string, consulta: (trx) => Promise<T>): Promise<T>` — grava o evento de leitura **e** devolve o dado, numa transação só
  - `obterRequestId(): string` — id estável por request

**A decisão de desenho, e o porquê:** a LGPD (art. 37) exige registro das operações de tratamento, e o spec diz que **leitura de prontuário é evento auditável**. A tentação é criar uma função `auditar()` que cada consulta chama. Isso é convenção: alguém esquece, e ninguém percebe que esqueceu — porque o dado aparece na tela normalmente.

Em vez disso, `lerAuditado` é o **único** caminho de leitura de dado clínico: ele recebe a consulta, grava o evento e devolve o resultado, tudo na mesma transação. Se a gravação falhar, a leitura não acontece. Esquecer de auditar deixa de ser possível: ou você usa o helper e audita, ou não lê.

- [ ] **Step 1: Escrever o teste antes**

Cobrir:
1. `lerAuditado` devolve o dado da consulta
2. `lerAuditado` grava exatamente um `evento_auditoria` com `acao='leitura'`, a entidade e o id corretos
3. O evento carrega `clinica_id` e `usuario_id` da sessão, não de parâmetro
4. Se a consulta lançar, **nenhum** evento fica gravado (transação reverte)
5. Se a gravação do evento falhar, a leitura não retorna dado
6. Dois `lerAuditado` seguidos geram dois eventos, não um

O caso 4 é o que prova a atomicidade — sem ele, um erro na consulta poderia deixar um evento de leitura que nunca aconteceu.

- [ ] **Step 2: Rodar, ver falhar, implementar, ver passar**

- [ ] **Step 3: `registrarEvento` para escrita**

Grava `valor_antes` e `valor_depois` em `jsonb`. **Nunca** grave a linha inteira: só os campos que mudaram. Dado clínico completo dentro da auditoria multiplica a superfície de exposição — a auditoria diz *que* mudou, não repete o prontuário.

Teste: alterar um campo grava antes e depois só daquele campo.

- [ ] **Step 4: Ligar o `registrarEvento` nas Server Actions que já existem**

`modules/adm/actions.ts` tem quatro (criar unidade, adicionar membro, registrar profissional, criar clínica). Cada uma passa a gravar o evento correspondente. Teste: cada action gera exatamente um evento com a ação certa.

- [ ] **Step 5: Sabotar**

1. Faça `lerAuditado` devolver o dado **sem** gravar o evento → o teste 2 tem que falhar
2. Faça a gravação acontecer **fora** da transação da consulta → o teste 4 tem que falhar
3. Remova o `registrarEvento` de uma das Server Actions → o teste dela tem que falhar

Reporte os três.

- [ ] **Step 6: Commitar**

```bash
git commit -m "feat(adm): auditoria com leitura pelo caminho unico

lerAuditado grava o evento e devolve o dado na mesma transacao: esquecer
de auditar deixa de ser possivel, porque nao existe outro caminho de
leitura de dado clinico. LGPD art. 37, RF-006."
```

---

## Task 2: Observabilidade

**Files:**
- Create: `lib/observabilidade/logger.ts`, `lib/observabilidade/sentry.ts`
- Create: `app/api/status/route.ts`
- Test: `tests/unit/logger.test.ts`, `tests/rls-smoke/status.test.ts`

**Interfaces:**
- Produces:
  - `log.info(mensagem, dados?)`, `log.erro(mensagem, erro, dados?)` — sempre com `clinica_id`, `usuario_id`, `request_id` quando houver sessão
  - `sanitizarParaSentry(dados): dados` — remove campos de paciente antes de reportar
  - `GET /api/status` — estado de cada dependência

- [ ] **Step 1: O logger, e o teste que importa**

Todo registro carrega `clinica_id`, `usuario_id` e `request_id` quando há sessão. Sem sessão (job, migração), carrega o que houver e nunca lança por falta de contexto — logger que quebra o request é pior que log ausente.

**O teste central:** dado um objeto com campos de paciente (`nome`, `cpf`, `contato`, `dados` de ficha, `texto` de evolução), o logger **não** os emite. Liste os campos proibidos explicitamente, e teste cada um.

- [ ] **Step 2: O sanitizador do Sentry**

`RNF-013`: payload de erro nunca contém dado de paciente — só `clinica_id`, `usuario_id`, `request_id`.

**Cuidado com o teste de fachada aqui:** testar que `sanitizar({nome: "x"})` remove `nome` prova pouco. Teste com um objeto **aninhado**, com o campo proibido a três níveis de profundidade, dentro de array, e com um `Error` que carrega o dado na mensagem. Se o sanitizador só olha o primeiro nível, o teste tem que falhar.

- [ ] **Step 3: Health check por dependência**

`GET /api/status` devolve 200 com o estado de cada dependência (banco, e o que mais existir). Cada uma é verificada de fato — um `select 1` no banco, não um "assumo que está no ar".

Teste: com o banco de pé, retorna 200 e o banco como saudável. **E o caso que importa:** com o banco fora, retorna estado degradado em vez de estourar. Simule fechando a conexão ou apontando para porta errada.

- [ ] **Step 4: Sabotar**

1. Faça o logger emitir um campo proibido → o teste dele tem que falhar
2. Faça o sanitizador olhar só o primeiro nível → o teste de objeto aninhado tem que falhar
3. Faça o health check devolver 200 sem consultar o banco → o teste de banco fora tem que falhar

- [ ] **Step 5: Commitar**

```bash
git commit -m "feat(adm): logger com contexto de tenant, sanitizador e health check

Toda linha de log carrega clinica_id, usuario_id e request_id. O payload
que vai para o Sentry passa por sanitizacao recursiva: campo de paciente
nao sai daqui, nem aninhado. RNF-013, RNF-021."
```

---

## Task 3: Consentimento em dois eixos

**Files:**
- Create: `modules/adm/consentimento.ts` (queries e regras), actions em `modules/adm/actions.ts`
- Create: `modules/adm/__tests__/consentimento.test.ts`
- Test: `tests/rls-smoke/consentimento.test.ts`

**Interfaces:**
- Produces:
  - `registrarConsentimento(entrada)` — cria versão vigente do termo se necessário e grava a assinatura
  - `revogarConsentimento(consentimentoId)` — marca `revogado_em`, **nunca** apaga
  - `consentimentoVigente(pacienteId, finalidade, ancoraTipo, ancoraId)` — devolve o consentimento válido ou null

**As regras a provar** — vêm da seção 11.10 do spec:

1. Um consentimento é a interseção de **finalidade × âncora × versão do termo**. As três coisas juntas, não uma.
2. **Revogar a camada de marketing não afeta a de tratamento.** Este é o teste que mais importa: um paciente que retira a autorização de uso de imagem continua com o prontuário intacto.
3. **A versão do termo é congelada na assinatura.** Se o texto mudar em 2027, o sistema ainda sabe qual redação o paciente assinou em 2026 — por isso `termo_versao_id`, não `termo_id`.
4. Consentimento revogado **não conta** como vigente.
5. Consentimento de outra âncora não vale para esta (assinar para um atendimento não autoriza outro).
6. O `hash_conteudo` da versão bate com o texto — se alguém alterar o texto de uma versão já assinada, dá para detectar.

- [ ] **Step 1: Escrever os testes das 6 regras**

Cada uma com teste próprio, nomeado pela regra. A regra 2 precisa de asserção nos dois sentidos: revogar marketing **não** afeta tratamento, e revogar tratamento **não** afeta marketing.

- [ ] **Step 2: Implementar até passar**

`revogarConsentimento` marca `revogado_em` e nunca apaga — a linha é prova jurídica de que houve consentimento e de que ele foi retirado, com as duas datas.

- [ ] **Step 3: Ligar na auditoria**

Registrar e revogar consentimento são eventos auditáveis. Use o `registrarEvento` da Task 1.

- [ ] **Step 4: Sabotar**

1. Faça `revogarConsentimento` apagar a linha em vez de marcar → o teste que confere as duas datas tem que falhar
2. Faça `consentimentoVigente` ignorar `revogado_em` → o teste da regra 4 tem que falhar
3. Faça a revogação afetar todas as finalidades do paciente → o teste da regra 2 tem que falhar
4. Faça o consentimento guardar `termo_id` em vez de `termo_versao_id` → o teste da regra 3 tem que falhar

- [ ] **Step 5: Commitar**

```bash
git commit -m "feat(adm): consentimento por finalidade, ancora e versao do termo

Revogar marketing nao afeta tratamento. A versao assinada e congelada,
entao mudanca no texto do termo nao reescreve o que o paciente aceitou.
RF-007, 11.10."
```

---

## O que esta fatia NÃO entrega

**Perfil de clínica** (tarefa 0.11) fica para a Fatia 5, que fecha a Fase 0. Ele é a composição configurável de módulos, fichas, catálogos e termos por perfil — e o schema já tem `perfil_clinica`, `perfil_referencia`, `perfil_clinica_modulo` e `perfil_clinica_referencia` prontos.

Depois da Fatia 5, começa a **Fase 1**: agenda multi-visão, prontuário com ficha configurável, mídia clínica, tabela de preços, prescrição rápida e o importador. A primeira tela que uma clínica de verdade abre.
