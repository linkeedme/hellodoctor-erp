# Hello Doctor — Plano de construção

**Fontes:** `docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md` (seção 11 tem precedência), `docs/PRD.md` (RF-xxx), `docs/modulos-e-funcionalidades.md` (códigos de módulo/funcionalidade), `docs/estrutura-do-projeto.md` (como cada tarefa é executada no repo), `docs/schema-inicial.sql` (DDL das fases 0-1, já validado — ver seção 0 abaixo)
**Escopo deste plano:** fases 0 e 1 apenas, detalhadas tarefa a tarefa. Fases 2-5 aparecem só como tamanho aproximado ao final, sem detalhamento — não foram pedidas e detalhar agora seria inventar sequência sobre módulos ainda não fechados.

---

## 0. Como ler este plano

**O que é uma "sessão de trabalho de agente":** o trabalho que um agente entrega, testa e deixa em PR revisável dentro de um ciclo de execução contínuo, sem handoff de contexto — não uma unidade de tempo de relógio. Duas sessões podem caber na mesma tarde se a revisão for rápida, ou se esticar por uma semana se o Davi estiver com o comercial. O plano conta sessões porque dias de calendário deste time dependem de quanto o Davi consegue revisar, não de quanto um agente consegue produzir — e revisão é o recurso escasso real aqui, não código.

**Cada tarefa tem:** objetivo, funcionalidades do catálogo que implementa (rastreio direto a `RF-xxx`/`XXX-nn`), critério de saída verificável por comando, estimativa em sessões, e dependências.

**As tarefas já estão em ordem de dependência** — a numeração (`0.1`, `0.2`...) é a ordem de execução recomendada, não um rótulo arbitrário. Pular uma tarefa para adiantar a seguinte geralmente não funciona porque a de trás é FK real da de frente.

**O schema já foi validado, não é promessa.** `docs/schema-inicial.sql` foi aplicado de ponta a ponta num Postgres 16 efêmero (Docker) e passou por 7 testes funcionais diretos: isolamento entre clínicas (leitura cross-tenant bloqueada), os três modos de visibilidade de paciente (isolado sem grant bloqueia, com grant libera), o trigger de escopo profissional (agendamento fora do conselho autorizado é recusado pelo banco) e a imutabilidade da auditoria (UPDATE em `evento_auditoria` falha). A tarefa 0.2 abaixo built em cima de algo que já roda, não de um desenho no papel.

---

## Fase 0 — Fundação

**Marco de saída:** nada visível ao usuário. Suíte de isolamento de tenant 100% verde no CI (`RNF-012`), suíte de visibilidade de paciente 100% verde, `perfil_clinica` provado com dois perfis distintos sem `if` de nome de perfil no código.

| # | Tarefa | Funcionalidades | Critério de saída (comando) | Sessões |
|---|---|---|---|---|
| 0.1 | Fundação técnica do repositório: Next.js App Router + TS strict, lint, CI, escolha de provedor Postgres gerenciado (região BR) e de query builder (recomendação: Kysely) | RF-002 (base) | `npm run build`, `npm run lint` e `npm run typecheck` passam; CI roda em PR de teste e fica verde; regra de lint falha o build ao detectar cliente de banco importado em componente `"use client"` | 1 |
| 0.2 | Aplicar `docs/schema-inicial.sql` como `db/migrations/0001_fase0_fase1_baseline.sql`; `db/client.ts` com os dois roles (`app_user`, serviço `BYPASSRLS`) | RF-001 (schema) | `npm run db:migrate` aplica sem erro num Postgres efêmero; `npm run test:rls-smoke` automatiza os 7 testes já validados manualmente nesta sessão de planejamento | 2 |
| 0.3 | Autenticação com claim de `clinica_id`; troca de clínica ativa para usuário em mais de uma clínica | RF-003 | Teste de integração comprova que login sem clínica ativa não gera token válido para rota de domínio | 3 |
| 0.4 | RBAC: seed da matriz papel×permissão (catálogo, seção 4.2), checagem no servidor antes de qualquer query | RF-004, ADM-04 | Teste de integração cobre cada papel padrão × cada ação restrita da matriz; ação sem permissão recebe 403 antes de tocar o banco | 2 |
| 0.5 | Cadastro de clínica (onboarding via role de serviço), unidade, usuário, membro, profissional com vínculo | ADM-01, ADM-02, ADM-03, ADM-05, RF-011, RF-012 | Cadastro de clínica sem CNPJ válido é rejeitado; cadastro de profissional sem `vinculo` é rejeitado | 3 |
| 0.6 | Escopo profissional (mecanismo) + suíte automatizada de isolamento de tenant no CI, com manifesto + allowlist de tabela global | RF-001, RF-005 (base) | `npm run test:isolamento-tenant` roda no CI a cada commit; PR de teste que adiciona tabela sem entrada no manifesto nem na allowlist quebra o build | 3 |
| 0.7 | Política de visibilidade de paciente (3 modos), `paciente_acesso_autorizado`, suíte de visibilidade no CI | RF-010, ADM-06, ADM-07 | `npm run test:visibilidade-paciente` cobre os 3 modos × responsável/não-responsável × com/sem grant explícito (12 casos), verde no CI | 3 |
| 0.8 | Consentimento em dois eixos: `termo`/`termo_versao`/`consentimento`, versionamento, registro por âncora | RF-007, ADM-08, ADM-09 | Teste comprova que revogar finalidade marketing numa âncora específica não afeta consentimento de tratamento nem de outras âncoras | 2 |
| 0.9 | Auditoria imutável + leitura auditada em tudo que já existe até aqui | RF-006, ADM-10 | Teste automatizado replica a recusa de UPDATE/DELETE em `evento_auditoria`; leitura de paciente/membro gera evento | 2 |
| 0.10 | Observabilidade mínima: logger estruturado, Sentry sem payload de paciente, health check por dependência | RF-008, ADM-11 | `curl /api/status` retorna 200 com estado de cada dependência; teste comprova payload de erro simulado não contém campo de paciente (`RNF-013`) | 2 |
| 0.11 | Perfil de clínica: `perfil_referencia` + tabelas semente, `perfil_clinica`, ativação de módulo/papel, onboarding de composição, editor pós-onboarding — **conteúdo real seedado só para o perfil harmonização e injetáveis** (ver seção 4) | RF-009, PFL-01 a PFL-08 | Teste comprova dois perfis distintos no mesmo ambiente com navegação/catálogo/ficha padrão diferentes; checagem estática (grep) falha o build se aparecer nome de perfil fora de seed/fixture no código | 3 |

**Total Fase 0: 26 sessões.**

---

## Fase 1 — Mesa de entrada

**Marco de saída (11.19):** uma clínica real troca o sistema atual pelo Hello Doctor. Não "atende um dia" — troca de fato, o que exige agenda de recurso triplo, tabela de preços como política, prescrição rápida e migração dos 4 conjuntos funcionando de ponta a ponta.

| # | Tarefa | Funcionalidades | Critério de saída (comando) | Sessões |
|---|---|---|---|---|
| 1.1 | Paciente com estágio: CRUD, transição `lead → avaliado → em_tratamento → inativo`, filtro padrão de lead fora de telas clínicas | RF-013, PRT-01, PRT-02, PRT-09 | Teste: CPF duplicado na mesma clínica é rejeitado; responsável legal obrigatório para menor; transição de estágio fora dos 4 valores é rejeitada pelo enum | 1 |
| 1.2 | Procedimento (cadastro raso) + escopo por conselho aplicado de ponta a ponta | CAT-01 (raso), RF-005 (aplicado) | Teste de integração: tentativa de agendar profissional fora do escopo do conselho é recusada com mensagem explícita no servidor | 1 |
| 1.3 | Sala e equipamento (cadastro) | dependência de AGD | CRUD básico com teste de isolamento herdado do manifesto | 1 |
| 1.4 | Agenda: reserva tripla (profissional+sala+equipamento) e detecção de conflito sobre os três | RF-014, AGD-01, AGD-02, AGD-11 | Teste: sobreposição em qualquer um dos três recursos é bloqueada isoladamente; teste de concorrência (duas inserções simultâneas no mesmo equipamento) não deixa as duas passarem | 3 |
| 1.5 | Agenda: as 4 visões (dia por profissional, dia por sala/equipamento, semana, mês com ocupação) | RF-015, AGD-03 a AGD-06 | Teste de fluxo (Playwright): trocar de visão preserva filtro de unidade/profissional selecionado; cada visão renderiza com carga sintética de 50 agendamentos/dia sem erro | 4 |
| 1.6 | Agenda: bloqueio de horário, horário de trabalho por vínculo, sugestão de horário livre | AGD-07, AGD-08, AGD-12 | Teste: bloqueio de sala impede novo agendamento na janela; sugestão retorna só slots livres nos 3 recursos simultaneamente | 2 |
| 1.7 | Atendimento avulso | RF-016 | Atendimento sem `agendamento_id` funciona ponta a ponta sem exigir sessão planejada prévia | 1 |
| 1.8 | Ficha configurável: `ficha_template`/`ficha_template_versao`, editor administrativo de JSON Schema | RF-017, PRT-06 | Teste: novo template de especialidade criado via API/UI sem alteração de código; envio de dados fora do schema vigente é rejeitado na gravação | 3 |
| 1.9 | Ficha: preenchimento no atendimento, formulário dinâmico a partir do schema vigente | PRT-04 | Teste: submissão inválida recusada campo a campo; submissão válida grava e é lida de volta idêntica | 2 |
| 1.10 | Evolução clínica por atendimento | RF-018, PRT-05 | Todo atendimento concluído sem evolução aparece num relatório de pendência | 1 |
| 1.11 | Exame como anexo (tipo + data de coleta, sem valor estruturado) | RF-020, PRT-07 | Upload exige tipo+data antes de salvar; não existe campo de valor estruturado no v1 | 1 |
| 1.12 | Mídia clínica: captura direta com guia de pose sobreposto, gravação sem passar pela galeria | RF-019 (metade 1), MID-01, MID-03, MID-06 | Teste de fluxo: foto capturada aparece vinculada a paciente+pose+atendimento sem interação de download/galeria | 3 |
| 1.13 | Mídia clínica: importação de arquivo com o mesmo pareamento paciente+pose | RF-019 (metade 2), MID-02 | Upload por importação exige paciente+pose antes de salvar, igual à captura direta | 1 |
| 1.14 | Mídia clínica: comparativo antes/depois por pose, alinhamento automático | MID-04, MID-07 | Comparativo exibe duas fotos da mesma pose lado a lado; alinhamento roda sem erro num par de fotos de teste | 2 |
| 1.15 | Tabela de preços: eixos profissional/unidade, vigência, congelamento no momento do uso | RF-021 (parcial), TPR-01, TPR-02, TPR-03, TPR-05 | Teste: preço vigente resolvido corretamente por profissional×unidade×data; preço de atendimento passado não muda quando preço novo é cadastrado | 3 |
| 1.16 | Tabela de preços: limite de desconto por papel + relatório de desconto aplicado | RF-021 (parcial), TPR-04, TPR-06, TPR-07 | Teste: desconto acima do limite do papel de quem aplica é bloqueado pelo servidor; relatório lista quem descontou o quê | 2 |
| 1.17 | Prescrição: base de medicações + favoritos por clínica + modelo de posologia | RF-022 (parcial), PRE-01, PRE-02, PRE-03 | Clínica marca favorito a partir da base pronta sem cadastro manual de medicação (a fonte da base é decisão de workshop — ver riscos) | 2 |
| 1.18 | Prescrição: edição de posologia no ato (sem alterar o modelo) + geração de PDF | RF-022 (parcial), PRE-04, PRE-05, PRE-06 | Teste de regressão: editar posologia numa receita não altera `modelo_posologia`; prescrição fora do escopo do conselho é recusada; PDF gerado é válido | 2 |
| 1.19 | Recebimento simples sobre o atendimento avulso | RF-023 | Baixa gera `recebimento` auditável, visível na ficha do paciente | 1 |
| 1.20 | Migração/Importador: infraestrutura genérica — parser, pré-visualização, validação linha a linha com correção inline, idempotência, relatório | RF-024 (base), MIG-02 a MIG-05, MIG-07 | Reimportar o mesmo arquivo não duplica registro; planilha com 3 linhas inválidas de propósito mostra as 3 mensagens legíveis e permite corrigir sem reeditar o arquivo | 4 |
| 1.21 | Migração: conjunto pacientes | MIG-01 (pacientes) | Planilha modelo importa 100% dos casos válidos e reporta 100% dos inválidos com motivo | 1 |
| 1.22 | Migração: conjunto agenda futura | MIG-01 (agenda) | Agendamento futuro importado aparece nas 4 visões da agenda sem edição manual | 2 |
| 1.23 | Migração: conjunto prontuário/histórico | MIG-01 (prontuário) | Paciente + atendimento histórico + ficha (quando mapeável) + foto (com pose atribuída no importador) aparecem na timeline do paciente importado | 3 |
| 1.24 | Migração: conjunto financeiro em aberto | MIG-01 (financeiro) | Parcela a receber importada aparece em `/financeiro` como saldo em aberto | 1 |
| 1.25 | Fechamento das suítes de isolamento e visibilidade para todas as tabelas novas da fase 1 (~28 tabelas) | RNF-012, RF-010 | `npm run test:isolamento-tenant` e `npm run test:visibilidade-paciente` 100% verdes cobrindo o schema completo de fase 0-1 | 2 |
| 1.26 | Fluxo E2E do marco: paciente → agenda (3 recursos) → atendimento → ficha → foto → preço → prescrição → recebimento | marco da fase 1 | Teste Playwright único, verde no CI, cobrindo o golden path completo | 2 |

**Total Fase 1: 51 sessões.**

**Total Fase 0 + Fase 1: 77 sessões**, antes de qualquer linha de fase 2. Isso é o número bruto — a seção 3 propõe onde cortar.

---

## 2. Avaliação da proposta em aberto: multi-perfil desde a fundação, um perfil real na fase 1

**Proposta:** `perfil_clinica` nasce genérico na fase 0 (mecanismo provado com ≥2 perfis), mas só o perfil **harmonização e injetáveis** recebe conteúdo real (fichas, catálogo de procedimento sugerido, termos) na fase 1.

**Concordo, com números:**

- O mecanismo (tarefa 0.11, 3 sessões) já é genérico — construir para 1 ou para 4 perfis custa o mesmo em schema e código, porque a arquitetura é dado (`perfil_referencia` + tabelas semente), não `if`. A prova de extensibilidade (dois perfis distintos sem código condicional) já está no critério de saída de 0.11 e não depende de ter conteúdo real nos dois.
- **Popular conteúdo** (ficha de anamnese, procedimentos sugeridos, termos) para um perfil além do primeiro é ~1 sessão de curadoria de domínio por perfil (ficha + catálogo + termo), não de engenharia. Os outros 3 perfis (`emagrecimento`, `estética com aparelho`, `cirurgia` — este último trava até a fase 5) custariam **+3 sessões** agora, sem nenhuma clínica desses perfis para validar contra.
- Sem clínica piloto desses 3 perfis, essas 3 sessões produziriam conteúdo especulativo — exatamente o tipo de trabalho que os guidelines deste projeto pedem para evitar ("nada de configurabilidade que ninguém pediu"). Melhor gastar essas 3 sessões em qualquer tarefa da fase 1 que já tem clínica-alvo definida (harmonização e injetáveis é o perfil mais comum do nicho e o que o benchmark cobre melhor).
- **Risco assumido conscientemente:** se a clínica piloto acabar sendo de emagrecimento ou estética com aparelho (não harmonização), essas 3 sessões viram trabalho necessário mais cedo, não trabalho jogado fora — o mecanismo já suporta, só falta o conteúdo. Não é retrabalho de arquitetura, é a curadoria adiada que sempre teria que acontecer.

---

## 3. Corte para reduzir o tempo da Fase 1

**O corte não fecha em "metade" sem tocar itens marcados `[Davi]` como obrigatórios — isso precisa ficar explícito antes de qualquer número.**

### Cortes de baixo risco (não tocam achado `[Davi]` marcado como inegociável)

| Corte | Tarefa afetada | Economia |
|---|---|---|
| Ficha sem editor de UI — nova versão de template só via migração/seed controlada por agente, não tela de admin | 1.8: 3 → 1 | 2 sessões |
| Foto sem alinhamento automático — mantém guia de pose na captura (que é a regra dura), corta o alinhamento assistido | 1.12/1.14: 5 → 4 | 1 sessão |
| Tabela de preços sem eixo "por unidade" no lançamento (clínica piloto provavelmente tem 1 unidade) | 1.15: 3 → 2 | 1 sessão |
| Sugestão automática de horário livre cortada, fica só bloqueio manual | 1.6: 2 → 1 | 1 sessão |
| Favoritos de medicação sem tela dedicada — campo simples na base | 1.17: 2 → 1 | 1 sessão |
| E2E cobre só o golden path, sem os cenários de erro extras | 1.26: 2 → 1 | 1 sessão |

**Subtotal: 7 sessões (51 → 44, -14%).** Nenhum destes fere um achado `[Davi]` marcado como fato/obrigatório — são todos redução de polimento, não de garantia.

### Cortes que tocam achado marcado como obrigatório — decisão consciente do dono, não minha

| Corte | Acha `[Davi]` que fere | Economia | Risco assumido |
|---|---|---|---|
| Lançar com 2 visões de agenda (dia por profissional + mês), adiando semana e dia-por-sala-equipamento para logo após o lançamento | 11.20: "todas obrigatórias no v1" | 2 sessões | Recepção sem visão de sala/equipamento nos primeiros dias — justo o cenário que 11.20 cita para evitar dois lasers marcados no mesmo horário |
| Migração self-service só para pacientes + agenda futura; prontuário/histórico e financeiro em aberto da clínica piloto migram com apoio direto de um agente, não pelo importador | 11.32: "não há migração assistida como serviço" | ~4 sessões (infra genérica 4→2, prontuário 3→1) | Vira exceção pontual da própria decisão que a seção 11.32 tomou para não consumir o tempo do Davi — só é defensável como validação da primeira clínica, não como política |

**Com os dois grupos de corte somados: 51 → ~33 sessões (-35%).** É o teto realista de corte antes de comprometer o próprio motivo do marco existir — a seção 11.19 já registrou que uma fase 1 mais rasa é exatamente o "segundo lugar para digitar" que fez o marco antigo falhar. **Chegar a 50% exigiria cortar mais que isso, e nesse ponto deixa de ser corte de fase 1 e volta a ser a "vertical fina" que o próprio workshop rejeitou.** Não recomendo passar de ~35% de corte.

---

## 4. Fases 2-5 — tamanho aproximado, sem detalhamento

Não foram pedidas nesta rodada. Para dimensionar o projeto inteiro, não para planejar:

- **Fase 2** (protocolo multi-sessão, mapa de aplicação com lote, estoque, antropometria aprofundada): módulos `CAT` (aprofundado), `MAP`, `ANT` — pelo volume de funcionalidades (26 IDs) e a complexidade nova de estoque com proprietário de lote (11.6) e divergência exposta (11.3), estimativa grosseira de **35-45 sessões**, mesma ordem de grandeza da fase 1.
- **Fase 3** (funil, 4 modelos de venda, comissão como motor de regras, Zaple, NFS-e): o próprio PRD já avisa que "provavelmente dobra de tamanho" (11.4) por causa da assinatura recorrente sozinha (dunning, suspensão, reativação). Estimativa grosseira: **45-60 sessões**.
- **Fase 4** (simulação visual, IA de consulta, Memed/controlados, portal do paciente): depende de definição ainda pendente (11.15, formato de "evolução assistida") e de integração cara (Memed). Sem essa definição, qualquer número aqui é ruído — não estimado.
- **Fase 5** (cirurgia): explicitamente não planejada, nem em tamanho — "só depois do núcleo validado com clínica real" (11.18).

**Projeto inteiro até o fim da fase 3, ordem de grandeza:** 150-180 sessões. Não é um compromisso, é o tamanho do problema — útil para não vender internamente um prazo que a própria matemática do plano contradiz.

---

## 5. Riscos de execução (fase 0-1)

1. **Clínica piloto inexistente.** As 77 sessões acima constroem sobre hipótese até uma clínica real trocar de sistema. Continua sendo o risco #1 do projeto (spec, seção 9), e é o único item desta lista que não se resolve com mais sessões de engenharia.
2. **Política de visibilidade de paciente (tarefa 0.7) é a peça mais nova e mais fácil de errar silenciosamente.** Um bug aqui não vaza dado entre clínicas (isso a suíte de isolamento pega) — vaza prontuário entre profissionais da *mesma* clínica, o que é mais difícil de perceber em produção (parece "colega vendo o que não devia", não "erro de sistema") e, por 11.5, não dá para corrigir depois sem reescrever acesso a dado. Mereceu 3 sessões de propósito; não comprimir esse número.
3. **Migração/Importador (11 sessões, tarefas 1.20-1.24) é o módulo cujo fracasso mata a adoção mesmo com todo o resto perfeito.** O próprio PRD chama isso de "combinação de maior taxa de falha de implantação" (11.32) — e é o item mais fácil de subestimar de fora porque parece "só uma tela de upload".
