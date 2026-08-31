# Hello Doctor — Estrutura do projeto

**Fonte canônica:** `docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md`
**Complementos:** `docs/plano-de-construcao.md` (o que construir, em que ordem), `docs/schema-inicial.sql` (DDL das fases 0-1)
**Para quem é este documento:** qualquer agente (ou o Davi) que vai abrir uma tarefa do plano de construção e precisa saber onde o código mora, como o banco migra, como testar, e como não quebrar o que já existe.

---

## 1. Árvore de diretórios

```
hello-doctor/
├── app/                              # Next.js App Router — só orquestra, não acessa banco
│   ├── (autenticado)/                # shell com clinica_id + perfil no contexto (ver 11.16)
│   │   ├── agenda/
│   │   │   ├── dia-por-profissional/
│   │   │   ├── dia-por-sala-equipamento/
│   │   │   ├── semana/
│   │   │   ├── mes/
│   │   │   └── novo/
│   │   ├── pacientes/[id]/
│   │   │   ├── ficha/  evolucoes/  fotos/  exames/  antropometria/
│   │   │   ├── planos/                        # plural — 11.9
│   │   │   ├── financeiro/  prescricoes/  consentimentos/
│   │   ├── catalogo/{procedimentos,precos}/
│   │   ├── financeiro/{titulos,recebimentos}/  # fase 1: só recebimentos existe
│   │   ├── importar/
│   │   └── admin/{clinica,perfil,unidades,usuarios,papeis,visibilidade-de-paciente,termos,auditoria,status}/
│   ├── (portal)/                     # fase 4 — pasta nasce vazia, ver docs/plano-de-construcao.md
│   ├── api/                          # Route Handlers: webhooks (Zaple, futuro), health check
│   ├── onboarding/
│   └── login/
│
├── modules/                          # o domínio. Um diretório por módulo do catálogo
│   │                                  # (docs/modulos-e-funcionalidades.md, seção 2) — o nome do
│   │                                  # diretório é o mesmo código curto do catálogo, em minúsculas
│   ├── adm/                           # Administração do tenant
│   │   ├── actions.ts                 # Server Actions — ÚNICO ponto de escrita (RF-002)
│   │   ├── queries.ts                 # leituras server-only
│   │   ├── schema.ts                  # validação Zod, espelha o schema-inicial.sql
│   │   ├── permissoes.ts              # checagem de RBAC antes de qualquer query
│   │   └── __tests__/
│   ├── pfl/                           # Perfil de clínica
│   ├── agd/                           # Agenda
│   ├── prt/                           # Prontuário e ficha configurável
│   ├── mid/                           # Mídia clínica
│   ├── cat/                           # Protocolo e catálogo (fase 1: só cadastro raso de procedimento)
│   ├── tpr/                           # Tabela de preços
│   ├── pre/                           # Prescrição
│   ├── mig/                           # Migração / Importador
│   └── fin/                           # Financeiro (fase 1: só recebimento simples)
│
├── db/
│   ├── migrations/                    # SQL numerado sequencial — ver seção 4
│   │   ├── 0001_fase0_fase1_baseline.sql   # == docs/schema-inicial.sql, congelado aqui
│   │   └── ...
│   ├── seed/                          # fixtures de conteúdo semente (perfil_referencia_*, papel,
│   │   │                              # permissao, medicamento, poses padrão) — dado, não schema
│   │   ├── papeis-e-permissoes.sql
│   │   ├── perfil-harmonizacao-injetaveis.sql
│   │   └── medicamentos-base.{sql,csv}
│   └── client.ts                      # helper único de conexão — abre transação, faz
│                                       # SET LOCAL app.clinica_id / app.usuario_id, ver seção 3
│
├── lib/
│   ├── auth/                          # integração com o provedor de auth gerenciado
│   ├── auditoria/                     # helper que grava evento_auditoria (inclusive leitura)
│   └── observabilidade/               # logger estruturado (clinica_id/usuario_id/request_id), Sentry
│
├── tests/
│   ├── isolamento-tenant/             # suíte obrigatória do RF-001/RNF-012 — ver seção 5
│   ├── visibilidade-paciente/         # suíte dos 3 modos do RF-010 — ver seção 5
│   └── fluxo/                         # Playwright, golden path da fase 1
│
└── docs/
```

**Por que `modules/` e não o padrão "por camada" (`controllers/`, `services/`, `repositories/`):** o catálogo de módulos já é a decomposição certa do domínio — 15 módulos com dono, funcionalidades e contratos de interface definidos. Replicar essa decomposição em diretório evita que um agente precise "descobrir" onde uma regra deveria morar: se é `AGD-02` (detecção de conflito), mora em `modules/agd/`. Isso também torna a regra de fronteira da seção 6 do catálogo ("nenhum módulo lê a tabela de outro módulo diretamente") verificável: um `import` de `modules/mid/*` dentro de `modules/agd/` fora de `actions.ts`/eventos é code smell, não é suposto acontecer.

---

## 2. Convenções de código

- **TypeScript strict** em todo o repositório. `any` é erro de lint, não warning.
- **Domínio em português, infraestrutura em inglês.** Nome de tabela, coluna, tipo de domínio (`Paciente`, `Atendimento`, `EstagioPaciente`), Server Action (`criarAgendamento`, `registrarEvolucao`) e diretório de módulo (`modules/agd`) espelham o schema e o catálogo, que são 100% em português — traduzir para inglês só criaria uma camada de tradução mental sem ganho, e quebraria o rastreio direto de "RF-014 → `criarAgendamento`". Código genérico sem domínio (helper de data, cliente HTTP, componente de UI sem regra de negócio, utilitário de teste) fica em inglês, seguindo a convenção padrão do ecossistema TS/React. Esta é uma escolha deste projeto, registrada aqui para não virar debate recorrente entre agentes.
- **Nomenclatura de arquivo:** kebab-case (`registrar-aplicacao.ts`). Componente React: PascalCase. Função/variável: camelCase. Tipo/enum: PascalCase.
- **Acesso a dado é sempre via Server Action ou Route Handler** (Decisão 2 do spec, RF-002). Nenhum componente `"use client"` importa o cliente de banco — verificado por regra de lint própria (`eslint-plugin-boundaries` ou regra customizada) que falha o build se detectar. Esta é a barreira nº1 do projeto; a suíte de isolamento é a nº2.
- **Toda leitura ou escrita sensível chama o helper de auditoria** (`lib/auditoria`) antes de retornar — não depois, não "se der tempo". Leitura de ficha/evolução/foto sem evento de auditoria é bug de fase 0, não débito técnico aceitável.

---

## 3. Convenção de nomes no banco

Já em uso em `docs/schema-inicial.sql`; registrada aqui como regra, não como observação:

- Tabela e coluna: `snake_case`, português, sem abreviação fora das já consagradas no domínio (`ANT`, `RF-xx` continuam sendo códigos de catálogo, não nome de coluna).
- Chave estrangeira: `<entidade_no_singular>_id` (`paciente_id`, `profissional_id`).
- Toda tabela de domínio carrega `clinica_id` (Decisão 2). Exceção só para as ~9 tabelas de referência de plataforma listadas explicitamente na seção 15 de `schema-inicial.sql` — essa lista é a fonte de verdade que a suíte de isolamento consulta.
- Timestamp de criação/atualização: `criado_em` / `atualizado_em`, sempre `timestamptz`.
- Booleano: adjetivo (`ativo`, `ativa`) ou `requer_`/`permite_` — nunca prefixo `is_`/`flag_` (mistura idioma e não segue o resto do schema).
- Enum de banco (`create type ... as enum`) para conjunto fechado e estável (`vinculo_profissional`, `status_agendamento`). Quando o conjunto precisa crescer sem deploy — `perfil_referencia`, `modulo` em `perfil_clinica_modulo`, `papel` — é tabela ou coluna `text` com `CHECK`, nunca enum de banco (enum do Postgres exige migração para adicionar valor; a lista aberta do 11.16 não pode depender disso).
- Associação polimórfica (só `consentimento.ancora_*` hoje) é `<nome>_tipo` + `<nome>_id`, sem FK de banco — validada em app. Documentada explicitamente no comentário da tabela.
- Tabela de junção M:N: `<tabela_a>_<tabela_b>` (`agendamento_equipamento`), chave primária composta, sem `id` próprio.

---

## 4. Estratégia de migração de schema

1. **Migração é SQL puro, escrito à mão, nunca gerado por diff automático de ORM.** RLS, trigger, enum e `CHECK` são exatamente o tipo de DDL que ferramentas de diff (Prisma Migrate, Drizzle Kit push) erram ou simplificam mal. O ORM/query builder (a escolher na tarefa 0.1 do plano — Kysely é a recomendação, por ser SQL-first e não tentar "adivinhar" migração) serve para consultas tipadas na aplicação, não para desenhar schema.
2. **Um arquivo por migração, numerado sequencial, nunca editado depois de mergeado em `main`.** `db/migrations/0001_fase0_fase1_baseline.sql` é o conteúdo integral de `docs/schema-inicial.sql` na primeira aplicação. A partir da migração 2, cada mudança de schema (nova tabela, nova coluna, nova policy) é um arquivo novo — corrigir um erro em migração já mergeada é uma migração de correção, nunca um `git commit --amend` no arquivo antigo. Consequência direta: `docs/schema-inicial.sql` e `db/migrations/0001_*.sql` **divergem com o tempo** e isso é esperado — o `.sql` na raiz de `docs/` é o retrato de fase 0-1 congelado nesta data para leitura humana; `db/migrations/` é a história real aplicada.
3. **Toda migração roda num banco efêmero antes de ir para produção.** O jeito mais simples e já validado neste projeto: subir um Postgres descartável via Docker (`postgres:16`), aplicar a migração, rodar a suíte de isolamento contra ele, derrubar o container. Não depende de conta em provedor gerenciado — qualquer agente com Docker local reproduz. Se o provedor final (a escolher na tarefa 0.1) suportar branch de banco (ex.: Neon, Supabase branching), preferir isso para o passo de CI; o Docker efêmero continua sendo o caminho local.
4. **`ALTER TABLE` que adiciona coluna a tabela com dado real é sempre nullable primeiro.** Backfill roda como job separado, `NOT NULL` (se necessário) entra numa migração posterior, só depois do backfill confirmado. Isso vale em especial para a maior mudança de schema conhecida e já prevista: adicionar `atendimento.sessao_planejada_id` na fase 2, quando `sessao_planejada` nascer.
5. **Toda tabela nova de domínio precisa, na mesma migração, de:** `clinica_id` (ou justificativa documentada de por que não), `RLS enabled` + policy, e entrada correspondente no manifesto de teste de isolamento (seção 5) — ou entrada na allowlist de tabela global. Uma migração que cria tabela sem isso não passa de review.
6. **Seed é dado, não schema — vive em `db/seed/`, não em `db/migrations/`.** `papel`/`permissao` (a matriz da seção 4.2 do catálogo de módulos), `medicamento` (base de medicação), os `perfil_referencia_*` (conteúdo semente por perfil) e as poses padrão são inseridos por script de seed, versionado, idempotente (`ON CONFLICT DO NOTHING` ou equivalente), rodado depois da migração de schema — nunca dentro do `.sql` de schema.

### Conexão de banco: role de request × role de onboarding

A aplicação usa **dois roles de banco**, nunca um só:

- **`app_user`** (sem `BYPASSRLS`) — toda leitura/escrita de request comum. É o role sob o qual `db/client.ts` abre a conexão, seta `SET LOCAL app.clinica_id` / `app.usuario_id` a partir do claim do token, e roda a query dentro da mesma transação.
- **role de serviço com `BYPASSRLS`** — usado só para: (a) criação de tenant novo (`ADM-01`, RF-012 — não existe `clinica_id` para setar antes de a clínica existir), (b) rodar migração, (c) rodar seed. Nunca usado para servir request de usuário. Isolado atrás de uma função própria (`db/onboarding.ts`), não do helper geral de conexão — para que "esqueci de trocar de role" seja um erro óbvio de import, não um bug silencioso.

---

## 5. Estratégia de teste

Quatro camadas, cada uma com um papel que as outras não cobrem — nenhuma substitui a suíte de isolamento.

### 5.1 Unidade (Vitest, sem banco)

Regra de negócio pura, testável sem I/O: cálculo de conflito de horário sobre profissional+sala+equipamento, motor de limite de desconto por papel, validação Zod de `ficha.dados` contra o JSON Schema vigente. Roda em milissegundos, é a primeira linha de defesa e a mais barata — todo agente escreve isso antes de abrir PR, TDD (`superpowers:test-driven-development`).

### 5.2 Integração (Vitest + Postgres real)

Server Action completa, incluindo RLS — **contra banco real, nunca mockado.** RLS só existe dentro do Postgres; simular a política em memória testaria uma reimplementação da política, não a política. O padrão é o mesmo já validado na escrita deste schema: subir `postgres:16` efêmero via Docker, aplicar as migrações, rodar o teste, derrubar o container. `db/client.ts` de teste usa o mesmo `app_user` sem `BYPASSRLS` que produção usa — testar com o role de serviço daria falso positivo.

### 5.3 Suíte de isolamento de tenant (obrigatória, CI, RF-001/RNF-012)

**Mecânica exata:**

1. Um script lê `information_schema.tables` do schema `public` do banco de teste recém-migrado.
2. Para cada tabela, verifica se está (a) na allowlist de tabela global (seção 15 de `schema-inicial.sql` — hoje 9 tabelas: `perfil_referencia*`, `papel`, `permissao`, `medicamento`, `usuario`) ou (b) tem uma entrada no manifesto de teste de isolamento (`tests/isolamento-tenant/manifesto.ts`).
3. **Se uma tabela não está em nenhuma das duas listas, o build falha antes mesmo de rodar teste algum.** Essa é a garantia literal do spec ("tabela nova sem teste de isolamento quebra o build") — implementada como checagem de cobertura, não como convenção que alguém pode esquecer de seguir.
4. Para cada tabela do manifesto, o teste autentica como usuário da Clínica A (`app.clinica_id` = A) e tenta `SELECT`, `INSERT`, `UPDATE`, `DELETE` sobre uma linha semeada da Clínica B. **O teste só passa se todas as quatro tentativas falharem** (0 linhas afetadas ou erro de policy — nunca sucesso).
5. Roda a cada commit (CI), sem exceção, sem skip por tag.

Este é exatamente o mecanismo já exercitado manualmente na escrita do schema (ver testes 1 e 2 do smoke test que validou `docs/schema-inicial.sql`); a suíte formaliza isso como fixture reutilizável em vez de script ad hoc.

### 5.4 Suíte de visibilidade de paciente (obrigatória, CI, RF-010)

Irmã da suíte de isolamento, mas testando o eixo novo da seção 11.5 — não é isolamento entre clínicas, é isolamento **dentro** da mesma clínica. Matriz mínima, os três modos × duas relações com o paciente (responsável / não responsável) × com e sem grant explícito (`paciente_acesso_autorizado`) — 12 casos, todos os 6 já cobertos manualmente nos testes 3, 4 e 5 do smoke test do schema. Toda tabela nova que referencie `paciente_id` (diretamente ou via `atendimento_id`) entra nesta suíte antes de merge — mesma disciplina da 5.3, mesmo texto de regra: tabela paciente-scoped sem teste de visibilidade não passa review.

### 5.5 Fluxo (Playwright)

Cobre o que unidade e integração não veem: o **golden path do marco da fase 1** de ponta a ponta pelo navegador — cadastrar paciente → criar agendamento (3 recursos) → abrir atendimento → preencher ficha → capturar foto → aplicar preço da política vigente → emitir prescrição → registrar recebimento — e um punhado de cenários de erro caros de não cobrir (agendamento fora do escopo profissional recusado na tela, não só na API; tentativa de acessar paciente de outra clínica por URL direta retorna 404, não 403 revelador; desconto acima do limite do papel bloqueado no ato).

---

## 6. Padrão de commit

Segue o padrão já em uso nos outros repositórios do Davi (Conventional Commits, tipo em inglês, escopo e descrição em português):

```
tipo(escopo): descrição curta em português, minúscula, sem ponto final

Corpo opcional explicando o porquê, não o quê — o diff já mostra o quê.
Referencia o(s) ID(s) de funcionalidade do catálogo quando a tarefa
implementa um: RF-014, AGD-01, AGD-02.
```

- **Tipos:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.
- **Escopo:** o código do módulo em minúsculas (`agd`, `prt`, `mid`, `cat`, `tpr`, `pre`, `mig`, `fin`, `adm`, `pfl`) ou área técnica (`schema`, `ci`, `deps`, `auth`).
- Uma tarefa do plano de construção normalmente vira 1-3 commits (implementação, teste, ajuste de review) — não um commit gigante por fase.
- Migração de schema é sempre commit próprio, tipo `feat(schema)` ou `fix(schema)`, nunca misturado com código de aplicação no mesmo commit.

---

## 7. Como um agente trabalha neste repo sem quebrar o que existe

1. **Ler `docs/plano-de-construcao.md` antes de codar**, localizar a tarefa pelo ID (`0.7`, `1.4`...) e os IDs de funcionalidade que ela referencia. Implementação que não rastreia a nenhum ID do catálogo é escopo não pedido — parar e perguntar, não inventar.
2. **Toda tarefa tem um critério de saída verificável por comando** (seção do plano). O trabalho só está pronto quando esse comando roda e passa — "parece que funciona" não é critério (`superpowers:verification-before-completion`).
3. **Nunca editar `docs/schema-inicial.sql` depois que a migração 0001 estiver aplicada em qualquer ambiente compartilhado.** Mudança de schema é sempre migração nova (seção 4). O arquivo em `docs/` vira referência histórica congelada da fase 0-1, não fonte viva.
4. **Trabalhar em branch por tarefa**, nunca commitar direto em `main`. PR pequeno o bastante para revisar em uma sessão — se a tarefa do plano estimada em "2 sessões" está gerando um PR de 40 arquivos, provavelmente ela precisava ser quebrada em duas tarefas menores; isso é sinal para atualizar o plano, não para empurrar o PR gigante.
5. **Tocou tabela nova, coluna nova ou policy de RLS? Rodar a suíte de isolamento (5.3) e, se a tabela referencia paciente, a suíte de visibilidade (5.4) localmente antes de abrir PR.** CI roda de novo, mas descobrir localmente é mais barato que descobrir no CI.
6. **Mudança cirúrgica.** Se a tarefa é implementar `AGD-03` (visão dia por profissional), não "aproveitar" para refatorar `AGD-01`. Se notar problema real fora do escopo da tarefa, registrar (issue, comentário no PR, nota no plano) — não misturar no mesmo diff. Isto já é regra global do usuário (guidelines Karpathy), reafirmada aqui porque um plano de 60+ tarefas dependentes é onde ela mais paga: um PR que mistura escopo quebra o rastreio tarefa → funcionalidade → commit que todo o resto deste documento existe para manter.
7. **Nenhum módulo lê a tabela de outro módulo diretamente** (regra de fronteira, seção 6 do catálogo). Se `modules/fin` precisa de dado que mora em `modules/prt`, a chamada passa pela `queries.ts`/evento de `modules/prt`, nunca por uma query direta à tabela de outro módulo — mesmo estando no mesmo banco, mesmo processo.
8. **Dado de paciente é sensível por padrão.** Nenhum log, nenhum erro reportado ao Sentry, nenhuma mensagem de commit carrega nome, CPF, foto ou conteúdo de ficha de paciente real. Ambiente de desenvolvimento/teste usa dado sintético, nunca export de clínica real — nem da futura clínica piloto.
