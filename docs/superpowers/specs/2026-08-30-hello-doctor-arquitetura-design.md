# Hello Doctor — Spec de Arquitetura e Design

**Data:** 2026-08-30
**Status:** aprovado (decisões 1, 2 e 3 travadas por Davi Torres)
**Autor:** Davi Torres + Claude (sessão de brainstorming)
**Próximo passo:** PRD, catálogo de módulos, design system, plano de construção. Detalhamento de cada módulo sai em workshop dedicado.

---

## 1. O que é

SaaS multi-tenant de gestão para clínicas de **medicina estética e bem-estar**: harmonização facial, protocolos de emagrecimento e procedimentos estéticos executados tanto por médicos quanto por não médicos (biomédico esteta, enfermeiro esteta, dentista com habilitação em HOF, esteticista).

Um produto, muitas clínicas, um único banco de dados com isolamento por linha.

### Fora do escopo do v1 (não-objetivos)

Registrar aqui é tão importante quanto registrar o escopo. Nada disso entra sem uma nova decisão explícita:

- **Odontologia clínica.** Odontograma, periograma e plano por dente/face são um subsistema inteiro. Sai do v1.
- **Faturamento de convênio (TISS).** O nicho é particular. TISS é meses de trabalho para um público que não é o nosso.
- **Telemedicina nativa.** Integrar depois, se e quando um cliente pagar por isso.
- **App nativo iOS/Android.** O v1 é web responsivo/PWA. A câmera do navegador dá conta da foto clínica.
- **Multi-idioma e multi-moeda.** Brasil, português, real.
- **Microsserviços, filas próprias, Kubernetes.** Ver decisão 2.

---

## 2. Posicionamento (o que a pesquisa competitiva revelou)

Benchmark conduzido em Amigo Clinic, MedX Care, Belle Software, Trinks, Clinicorp (Brasil) e Aesthetic Record, Zenoti, Boulevard (líderes de med spa nos EUA).

### Mesa de entrada — sem isso não se vende

Agenda, prontuário e financeiro básico; confirmação por WhatsApp; NFS-e; teste grátis sem cartão; preço público. **IA de transcrição de consulta virou paridade competitiva em 2026**, não diferencial: Amigo, MedX e Feegow já anunciam.

### As brechas reais

| Brecha | Evidência |
|---|---|
| **Foto clínica é fraca no mercado médico brasileiro** | Nem Amigo Clinic nem MedX Care têm módulo dedicado. Só o Belle trata como central, e sem padronização de captura. |
| **Evolução antropométrica não existe bem em lugar nenhum** | Das 6 ferramentas do benchmark, nenhuma tem gráfico de progressão corporal. Zenoti captura peso e sinais vitais sem série temporal. Clínicas usam planilha por fora. |
| **Ninguém versiona termo de consentimento** | Nenhuma das 6 consegue provar qual redação o paciente assinou se o texto mudou depois. |
| **Ninguém comunica receita controlada** | Só o Ninsaúde menciona. Em emagrecimento com GLP-1 e B2, é confiança regulatória. |
| **Suporte é a dor #1 do setor** | Amigo Clinic: 6,8/10 no Reclame Aqui, 134 reclamações, SLA de 5 dias úteis. |
| **Portabilidade de dados como refém** | Aesthetic Record cobrou US$ 1.120 para exportar dados dos próprios pacientes, com prazo de até 90 dias. |

### Compromissos de posicionamento

1. **Seus dados saem de graça, quando você quiser, em formato aberto.** Exportação completa é funcionalidade, não favor. Vira cláusula de contrato.
2. **SLA de suporte publicado**, tratado como parte do produto.
3. **Preço público**, seguindo MedX e Trinks, contra o padrão opaco de Amigo e iClinic.
4. **Rastreabilidade sanitária de verdade**: lote real, não SKU.

---

## 3. Decisões de arquitetura

### Decisão 1 — Prontuário: núcleo tipado + ficha configurável (aprovada)

Rejeitadas: schema fixo por especialidade (cada especialidade nova vira migração e deploy) e formulário 100% dinâmico/EAV (nenhum relatório funciona, nenhum gráfico funciona, a IA não tem onde encaixar a transcrição — entrega um formulário caro).

**Adotado:** um núcleo clínico fortemente tipado, igual para toda especialidade, onde vivem relatórios, gráficos, IA e auditoria. Por cima dele, a ficha de anamnese e avaliação é um **template versionado por especialidade**, guardado em `JSONB` e validado contra **JSON Schema**.

Consequência prática: abrir uma nova especialidade é **configuração, não deploy**. Mas o peso do paciente continua sendo uma coluna `numeric` que o gráfico entende, não uma chave solta dentro de um JSON.

**Regra de fronteira** — o que pode ir para o JSONB e o que não pode:

| Vai para o núcleo tipado | Vai para o JSONB |
|---|---|
| Qualquer dado que apareça em gráfico, relatório, filtro ou alerta | Perguntas de anamnese específicas da especialidade |
| Qualquer dado com consequência financeira ou de estoque | Texto livre de avaliação |
| Qualquer dado que a fiscalização sanitária possa pedir | Checklists e escalas próprias da clínica |
| Qualquer dado que a IA precise preencher de forma estruturada | Observações que ninguém agrega |

Na dúvida, é núcleo tipado. Mover do JSONB para o núcleo depois é migração de dados; o contrário é trivial.

### Decisão 2 — Isolamento: um banco, `tenant_id` + RLS (aprovada)

Rejeitadas: schema por tenant (migração em N schemas é sofrimento operacional recorrente) e banco por tenant (custo e operação inviáveis com uma pessoa).

**Adotado:** banco único, coluna `clinica_id` em toda tabela de domínio, Row Level Security do Postgres ativo em todas elas.

**Condição inegociável:** suíte automatizada de isolamento no CI. Para **cada tabela**, o teste autentica como Clínica A e tenta ler, escrever e apagar dado da Clínica B. O teste só passa se **todas** as tentativas falharem. Roda a cada commit, e uma tabela nova sem teste de isolamento quebra o build.

Sem isso, essa decisão é irresponsável com dado de saúde. Com isso, é a escolha certa.

**Defesa em profundidade — RLS é a segunda barreira, não a única.** Todo acesso a dado passa pelo servidor (Server Actions e Route Handlers). O navegador nunca fala direto com o banco. Motivos: dado de saúde exige um único ponto de auditoria, regra de escopo profissional precisa de um único lugar para ser aplicada, e a superfície de ataque encolhe. O RLS existe para o dia em que alguém errar no servidor.

### Decisão 3 — Construção: vertical fina ponta a ponta (aprovada)

Rejeitadas: módulo por módulo até 100% (descobre no mês 8 que o fluxo entre eles não fecha) e big bang (é assim que projetos sem prazo externo ficam 80% prontos para sempre).

**Adotado:** agendar → atender → fotografar → evoluir → cobrar, tudo raso e funcionando, antes de aprofundar qualquer módulo.

### Decisão 4 — Hospedagem gerenciada, região Brasil (aprovada)

Prontuário, foto clínica e áudio de consulta são dado sensível (LGPD art. 11). Ficam em infraestrutura gerenciada com residência no Brasil. Davi não opera servidor.

Justificativa: o time é uma pessoa mais agentes. O recurso escasso é a atenção do Davi, e ela deve ir para o domínio clínico, não para patch de segurança às 22h.

### Decisão 5 — Funil nativo, WhatsApp via Zaple (aprovada)

O funil comercial mora **dentro** do Hello Doctor, porque o orçamento estético é clinicamente amarrado: procedimento, número de sessões, área tratada, foto de avaliação. Num CRM genérico ele vira texto livre e perde o dado que alimenta o protocolo.

O canal de WhatsApp (inbox, bot, disparo, templates) fica no **Zaple**, consumido por API. Reconstruir sessão de 24 horas, templates e aprovação Meta pela segunda vez seria desperdício, e o Zaple ganha um vertical de saúde.

Contrato entre os dois: o Hello Doctor publica eventos (agendamento criado, confirmação pendente, orçamento sem resposta há N dias, sessão a vencer) e o Zaple executa a conversa. O Zaple devolve respostas do paciente como eventos.

---

## 4. Modelo de domínio

O núcleo tipado. Detalhamento de campos sai no workshop de cada módulo.

### Tenancy e identidade

- `clinica` — o tenant. Razão social, CNPJ, configurações, plano.
- `unidade` — endereço físico. Uma clínica pode ter mais de um. Sala e agenda pendem daqui.
- `usuario` — pessoa. Pode pertencer a mais de uma clínica (o injetor que atende em três lugares é comum no nicho).
- `membro` — `usuario` × `clinica`, com papel.
- `profissional` — extensão de `membro`: conselho (CRM, CRO, CRBM, COREN, CREFITO), número, UF, habilitações.
- `papel` e `permissao` — RBAC.

**Escopo profissional é regra de negócio, não treinamento.** Cada `procedimento` do catálogo declara quais conselhos e habilitações podem executá-lo e quem pode prescrever. O sistema recusa a execução fora do escopo. Essa é a consequência direta de "médicos ou não médicos" atenderem no mesmo produto.

### Paciente e consentimento

- `paciente` — cadastro, CPF, contato, endereço, responsável legal quando menor.
- `termo` e `termo_versao` — texto, vigência, hash do conteúdo.
- `consentimento` — paciente, `termo_versao_id`, assinado em, evidência (assinatura, IP, dispositivo, carimbo de tempo), revogado em.

**Consentimento em três camadas separadas e assinadas individualmente**, cada uma com sua versão de termo:

1. **Tratamento clínico** — o procedimento em si, seus riscos e alternativas.
2. **Uso interno** — guarda de imagem no prontuário, uso em discussão de caso e treinamento interno.
3. **Uso externo / marketing** — publicação em rede social e material de divulgação.

Nenhuma ferramenta do benchmark versiona termo. Versionar significa que, se a redação mudar em 2027, o sistema ainda sabe exatamente o que aquele paciente assinou em 2026. Revogação da camada 3 tem efeito imediato: a foto some de todo fluxo de marketing e permanece no prontuário.

### Clínico

- `atendimento` — **a unidade base**. Paciente, profissional, unidade, data, tipo (avaliação, procedimento, retorno), status. Tem `sessao_planejada_id` **nulo** quando é avulso.
- `ficha` — anamnese e avaliação: `template_versao_id` + `dados` JSONB validado.
- `ficha_template` e `ficha_template_versao` — o JSON Schema por especialidade.
- `evolucao` — o registro clínico do atendimento.
- `medida` — paciente, tipo (peso, cintura, quadril, percentual de gordura, pressão), valor `numeric`, unidade, medido em, atendimento. **Série temporal, uma linha por medição.** É o que permite o gráfico que ninguém no mercado tem.
- `foto` — paciente, atendimento, `pose_id`, arquivo, capturada em, metadados de captura.
- `pose` — frontal, perfil direito, perfil esquerdo, oblíquo, e por região corporal. Carrega o **guia de enquadramento** exibido na captura.
- `aplicacao` — atendimento, região anatômica, coordenada no mapa, `lote_id`, quantidade, unidade (UI, ml), profissional.
- `mapa` e `mapa_regiao` — face e corpo, com regiões anatômicas nomeadas.

**Regra sobre estoque (corrigida no workshop de 30/08 — ver seção 11):** registrar a aplicação **é** o ato que baixa o estoque e lança o custo real do lote. Não existe tela separada de "dar baixa" desconectada do prontuário. Belle e Clinicorp fazem baixa por receita média configurada no serviço, desconectada do que saiu de fato, e o resultado documentado é divergência crônica corrigida na unha todo fechamento.

**Mas o registro NÃO é obrigatório no momento do atendimento.** Davi (fonte de domínio) confirmou que na prática o profissional registra na hora ou depois, e forçar o registro em tempo real quebra o fluxo da sala. Portanto:

- `aplicacao` tem **duas datas distintas e ambas auditadas**: `ocorrido_em` (quando o procedimento foi feito) e `registrado_em` (quando foi lançado no sistema).
- Atendimento concluído sem registro de aplicação gera **pendência**, não bloqueio. Existe uma fila de "atendimentos aguardando registro" por profissional.
- O estoque expõe **divergência temporária conhecida**: saldo contábil, consumo pendente de lançamento, e saldo projetado. O sistema nunca finge que o saldo está fechado quando há registro em aberto.
- Registro retroativo é permitido e auditado; a política de prazo limite é decisão do workshop do módulo de estoque.

**Regra dura sobre foto:** a padronização acontece **na captura**, com guia de pose sobreposto à câmera e alinhamento da foto nova sobre a anterior. Comparar fotos tiradas sem padrão é insolúvel depois, e o acervo já tirado não se refaz.

**Regra dura sobre vínculo:** ficha e mapa de aplicação pendem da **sessão específica**, nunca do paciente em geral. É o que permite reconstruir, numa fiscalização sanitária, exatamente o que foi feito, com qual produto e lote, por qual profissional, sessão a sessão.

### Catálogo e protocolo

- `procedimento` — o catálogo de serviço. Nome, duração, preço base, insumos previstos, conselhos autorizados.
- `protocolo_template` — jornada reutilizável: sessões previstas com procedimento, ordem e **intervalo esperado** (mínimo, ideal, máximo) entre elas.
- `protocolo_instancia` — o template aplicado a um paciente. Iniciado em, status.
- `sessao_planejada` — ordem, procedimento, data prevista, data realizada, `atendimento_id`, status, **aderência ao intervalo**.

Em harmonização e emagrecimento o resultado depende do espaçamento correto, não só de quantas sessões faltam. O sistema acompanha aderência, não saldo.

**Avulso usa o mesmo `procedimento` do catálogo, sem o envelope comercial de pacote.** Modelar avulso como "pacote de uma sessão" polui comissão, funil e taxa de recompra com pacotes fantasmas.

### Comercial

- `lead`, `etapa_funil`, `oportunidade`
- `orcamento` — o objeto que **atravessa o funil**. Nasce na avaliação, aceita múltiplas opções (A, B, C), tem validade, e carrega o preço até o agendamento sem redigitação.
- `venda` — o orçamento aceito, com sua composição congelada.
- `saldo_sessao` — venda, procedimento, quantidade comprada, consumida, validade.

**Trava dura de saldo:** é impossível agendar ou consumir sessão sem saldo disponível. O Belle tem reclamação pública de cliente que recebeu mais sessões do que pagou.

### Financeiro

- `titulo` e `parcela` — a receber, com parcelamento.
- `recebimento` — a baixa efetiva.
- `comissao` — profissional, base de cálculo, percentual, valor. Separada por tipo de receita (procedimento, produto, pacote).
- `movimento_caixa`

**Segregação de papéis:** quem registra a venda não pode ser quem confirma o recebimento, e ambos os atos são auditados. Falha real encontrada no Belle, e é exposição a fraude interna.

### Estoque

- `produto` — nome, marca, unidade de medida.
- `lote` — produto, número, validade, quantidade, **custo unitário real de aquisição**.
- `movimento_estoque` — entrada e saída, com `aplicacao_id` como origem da saída clínica.

Custo reportado é o do lote efetivamente usado, não média. Um lote comprado em promoção reflete o custo real pago. Alerta de vencimento vem **com sugestão de substituto disponível**, senão o insumo vence do mesmo jeito porque ninguém decide o que fazer com ele.

### Agenda

- `agendamento` — profissional, sala, paciente, procedimento ou sessão planejada, início, fim, status (agendado, confirmado, atendido, faltou, cancelado).
- `sala`, `bloqueio`, `horario_trabalho`

### Prescrição

- `prescricao` — atendimento, itens, classificação (simples, controlada), referência da assinatura digital.

Prescrição controlada (GLP-1 tarja vermelha, sibutramina B2) é requisito do v1, não de depois — é metade do nicho.

### Auditoria

- `evento_auditoria` — quem, o quê, quando, de onde, valor antes e depois. **Imutável, append-only.**

**Leitura de prontuário é evento auditável.** A LGPD trata acesso a dado sensível como operação de tratamento. Se alguém abrir a ficha de um paciente, isso fica registrado.

---

## 5. LGPD

Não é um módulo. É requisito transversal que atravessa todos os outros.

| Exigência | Como é atendida |
|---|---|
| Base legal para dado sensível (art. 11) | Consentimento em três camadas, versionado, com evidência de assinatura |
| Finalidade específica | Camada 3 (marketing) é separada da camada 1 (tratamento). Revogar a 3 não apaga o prontuário |
| Direito de acesso e portabilidade (art. 18) | Exportação completa do paciente em formato aberto, self-service |
| Direito de eliminação | Anonimização, respeitando a guarda legal de prontuário (CFM: 20 anos) |
| Registro de operações (art. 37) | Trilha de auditoria imutável, incluindo leitura |
| Segurança (art. 46) | Criptografia em repouso e em trânsito, RLS, acesso só via servidor, URLs de mídia assinadas e de curta duração |
| Incidente (art. 48) | Runbook e canal de comunicação definidos |
| Encarregado (DPO) | Papel nomeado, canal público |
| Operador × Controlador | A clínica é controladora; o Hello Doctor é operador. Contrato precisa dizer isso, e o DPA é anexo |

A gravação de áudio da consulta exige **consentimento próprio**, apresentado no momento, e o áudio tem política de retenção separada do prontuário.

---

## 6. Stack

Escolhida para o teto de "uma pessoa mais agentes": poucas peças móveis, tudo gerenciado, nada exótico.

| Camada | Escolha | Por quê |
|---|---|---|
| Aplicação | Next.js (App Router) + TypeScript strict | Stack que o Davi já opera. Server Actions dão o ponto único de acesso a dado |
| Banco | Postgres gerenciado, região São Paulo | RLS nativo, JSONB com validação, série temporal sem esforço |
| Acesso a dado | Servidor apenas (Server Actions e Route Handlers) | Ponto único de auditoria e de regra de escopo profissional |
| Auth | Provedor gerenciado, com claim de `clinica_id` no token | Alimenta o RLS |
| Storage de mídia | Bucket privado, S3-compatível, URLs assinadas de curta duração | Foto clínica nunca é URL pública |
| Jobs assíncronos | Serviço gerenciado de jobs | Transcrição e disparo não podem viver no request. Não operar fila própria |
| Transcrição | AssemblyAI (PT-BR) | Já em uso na casa |
| Prescrição | Integração Memed | Assinatura ICP-Brasil e controlados resolvidos. Não construir do zero |
| Assinatura de termos | Provedor de assinatura eletrônica | Termos clínicos e de imagem |
| Pagamento | Gateway com PIX, cartão recorrente e boleto | Pacote parcelado é o coração do negócio |
| NFS-e | Integração com emissor | Mesa de entrada do setor |
| WhatsApp | Zaple, via API | Decisão 5 |
| Erros | Sentry | |
| Logs e métricas | Logs estruturados em serviço gerenciado, com `clinica_id` e `request_id` em toda linha | |
| Testes | Vitest (unidade e integração) + Playwright (fluxo) + suíte de isolamento de tenant | |

Fornecedores específicos de cada integração são decisão do workshop do módulo correspondente.

---

## 7. Observabilidade

Requisito do Davi desde o pedido original, e coerente com uma pessoa operando o sistema: **você precisa descobrir o problema antes da clínica te ligar.**

- **Toda linha de log carrega `clinica_id`, `usuario_id` e `request_id`.** Sem isso, investigar problema de uma clínica específica em banco compartilhado é impossível.
- **Erros vão para o Sentry com contexto de tenant**, e nunca com dado de paciente no payload.
- **Métricas de negócio, não só técnicas:** agendamentos criados por dia por clínica, atendimentos concluídos, fotos capturadas, transcrições na fila, taxa de falha de integração. Uma clínica que parou de agendar é sinal antes de virar cancelamento.
- **Health check por dependência** (banco, storage, Memed, gateway, Zaple), com página de status.
- **Alerta acionável apenas.** Alerta que não exige ação é ruído que treina você a ignorar alertas.
- **Trilha de auditoria é separada do log.** Log é operacional e expira; auditoria é legal e não expira.

---

## 8. Fases

| Fase | Nome | Entrega | Marco de saída |
|---|---|---|---|
| **0** | Fundação | Multi-tenant com RLS e suíte de isolamento, auth, papéis e escopo profissional, auditoria imutável, observabilidade, consentimento versionado | Nada visível ao usuário. É o chão. Pular é retrabalho garantido |
| **1** | Mesa de entrada | Paciente · agenda multi-visão sobre 3 recursos · atendimento avulso · ficha configurável · evolução · foto com captura padronizada · tabela de preços com política · prescrição rápida impressa · recebimento simples | **Uma clínica real troca o sistema atual pelo nosso** |
| **2** | O que é nosso | Protocolo multi-sessão com aderência de intervalo, mapa de aplicação com lote, estoque com baixa pela aplicação e custo real, antropometria com gráfico de evolução | O produto deixa de ser genérico e vira específico de estética |
| **3** | Comercial | Funil, orçamento que atravessa o funil, pacotes com trava de saldo, parcelamento, comissão, integração Zaple, NFS-e | A clínica passa a **vender** dentro do sistema |
| **4** | Diferenciação | Simulação visual com captura de lead, IA de consulta (gravação, transcrição, preenchimento do prontuário estruturado), prescrição com Memed incluindo controlados, portal do paciente | O que sustenta preço |
| **5** | Cirurgia | Jornada cirúrgica completa: contrato, pré-operatório, recursos externos, pós-operatório programado (ver 11.18) | Abre o perfil de cirurgia plástica |

**Por que a IA de transcrição está na fase 4:** é a mais chamativa e a menos decisiva. Os três maiores concorrentes já a anunciam e nenhuma clínica troca de sistema por causa dela — trocam por agenda e financeiro que funcionam. E dentro da própria fase 4, a **simulação visual passa na frente da transcrição**, porque é a única aplicação de IA com receita comprovada nesse nicho (Clinicorp Face DS, Aesthetic Record com EntityMed). Com um detalhe operacional que só quem já apanhou sabe: a simulação captura o contato e empurra para o funil **antes** de mostrar o resultado.

---

## 9. Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| **Não existe clínica piloto com data** | **Alta** | O maior risco do projeto não é técnico. Sem uma clínica real usando cedo, a fase 1 pode entregar oito módulos que ninguém validou. O marco da fase 1 é explicitamente "uma clínica real atende um dia inteiro" — e conseguir essa clínica é tarefa do Davi, em paralelo à fase 0 |
| Vazamento de dado entre clínicas | Crítica | Suíte de isolamento no CI + acesso só via servidor + RLS como segunda barreira |
| Time de uma pessoa | Alta | Arquitetura deliberadamente chata. Cada serviço a mais é um lugar que quebra sem quem levante |
| Escopo total maior que o de concorrentes com anos de estrada | Alta | Faseamento com marco verificável. Nenhuma fase começa antes da anterior fechar |
| Escopo profissional (quem pode aplicar o quê) mal modelado | Alta | Vira responsabilidade legal da clínica e nossa. Modelado no catálogo desde a fase 0 |
| Custo de IA por consulta transcrita | Média | Fase 4. Medir custo real por minuto antes de precificar |
| Dependência do Memed e do gateway | Média | Isolar atrás de interface própria. Trocar fornecedor não pode ser reescrita |
| Foto clínica virar custo de storage descontrolado | Média | Política de compressão, thumbnails e retenção definida na fase 1, não depois |

---

## 10. O que fica para o workshop

Este spec fixa a arquitetura e a **superfície** dos módulos. A profundidade de cada um sai em workshop dedicado, com o Davi na sala:

Agenda · Prontuário e ficha configurável · Mídia clínica · Protocolo e catálogo · Mapa de aplicação e estoque · Antropometria · Funil e orçamento · Financeiro e comissão · Prescrição · Portal do paciente · IA clínica · Administração do tenant

Cada workshop produz: modelo de dados detalhado, regras de negócio, telas, estados de erro e critérios de aceite.


---

## 11. Correções do workshop com o especialista

Registradas em 30/08/2026, extraídas de Davi Torres (cirurgião-dentista, ex-consultor de clínicas, com clientes no nicho). **Estas afirmações têm origem `[Davi]` e são fato, não hipótese.** Elas corrigem premissas que haviam entrado no spec e no PRD por inferência.

### 11.1 Vínculo do profissional é misto e configurável `[Davi]`

Na mesma clínica convivem CLT, parceiro PJ com repasse e profissional que aluga sala. `profissional.vinculo` é campo obrigatório e dirige:

- **Comissão**: percentual, repasse ou aluguel fixo são mecânicas diferentes.
- **Visibilidade de paciente**: quem aluga sala frequentemente traz o próprio paciente. A pergunta "de quem é este paciente" deixa de ter resposta única e vira regra de permissão.
- **Agenda**: horário próprio versus horário da clínica.
- **Estoque**: possibilidade de o profissional usar insumo próprio, não o da clínica.

Consequência de arquitetura: o modelo de permissão não pode assumir que toda a clínica enxerga todo paciente.

### 11.2 O dono do orçamento varia por porte da clínica `[Davi]`

Clínica pequena: o próprio profissional avalia, orça e fecha. A partir de certo porte entra **consultora de vendas dedicada**, que assume o paciente após a avaliação clínica.

Consequência: `consultor comercial` é papel opcional; o funil precisa funcionar idêntico com e sem ele, e a atribuição de comissão de venda é independente da comissão de execução.

### 11.3 O registro da aplicação não pode ser obrigatório no momento do atendimento `[Davi]`

Ver a regra corrigida na seção 4. Duas datas distintas, pendência em vez de bloqueio, e divergência de estoque exposta em vez de escondida.

### 11.4 Os quatro modelos de venda convivem `[Davi]`

Pacote fechado parcelado, procedimento avulso, mensalidade/assinatura e crédito pré-pago na clínica — todos praticados no nicho. São quatro mecânicas financeiras distintas:

| Modelo | Unidade de saldo | Mecânica |
|---|---|---|
| Pacote fechado | Sessão de um procedimento | `saldo_sessao` com trava dura |
| Avulso | Nenhuma | Venda e execução no mesmo ato |
| Assinatura | Recorrência mensal | Cobrança recorrente, direito de consumo por período |
| Crédito pré-pago | Valor em reais | Carteira, abatida em qualquer procedimento |

Crédito pré-pago é o mais distinto: o saldo é em **reais**, não em sessões, e não define na compra o que será consumido. Exige carteira, não `saldo_sessao`.

**Decidido `[Davi]`:** os quatro entram na **fase 3**, juntos. Justificativa aceita: o financeiro é o módulo mais caro de remexer depois. Consequência assumida: a fase 3 provavelmente dobra de tamanho, e a assinatura recorrente traz sozinha falha de cartão, dunning, suspensão e reativação.

### 11.5 Visibilidade de paciente é política configurável por clínica `[Davi]`

Quando o profissional é parceiro ou aluga sala e traz o próprio paciente, não existe resposta única para "de quem é esse paciente". Cada clínica define a política no onboarding, entre:

1. **Isolado no profissional** — só ele e quem ele autorizar veem o prontuário.
2. **Aberto à clínica** — o paciente pertence à clínica, todos com permissão veem.
3. **Clínica com clínico restrito** — o dado é da clínica; agenda e financeiro visíveis à gestão, evolução clínica só para quem atende.

**Consequência de arquitetura, e é séria:** o modelo de permissão precisa suportar os três casos **desde a fase 0**. Não é possível adicionar isolamento intra-tenant depois sem reescrever o acesso a dado. O RLS passa a filtrar por `clinica_id` **e** por política de visibilidade.

### 11.6 Insumo próprio e insumo da clínica convivem `[Davi]`

O mesmo profissional pode, em atendimentos diferentes, usar produto próprio ou da clínica. Portanto `lote` tem **proprietário**: a clínica (padrão) ou um profissional específico.

Consequências: o custo do procedimento só entra no resultado da clínica quando o insumo é dela; a comissão muda quando o profissional bancou o produto; e o alerta de vencimento precisa ir para o dono do lote, não para a gestão.

### 11.7 O tenant é sempre uma clínica com CNPJ `[Davi]`

Profissional autônomo não assina o Hello Doctor sozinho. Ele é sempre usuário dentro de um tenant clínica. Isso mantém o modelo de tenancy simples e fecha a porta para um plano individual no v1.

### 11.8 A agenda reserva múltiplos recursos, não só o profissional `[Davi]`

Equipamento (laser, criolipólise, ultraformer, radiofrequência) é **recurso escasso e compartilhado**. Dois profissionais marcando o mesmo aparelho no mesmo horário quebra o dia da clínica.

`agendamento` reserva simultaneamente: **profissional + sala + equipamento(s)**, e a detecção de conflito roda sobre os três. `procedimento` declara quais recursos exige.

**Impacto:** isto é um escalonador de múltiplos recursos, não uma agenda de pessoa. É significativamente mais caro que o previsto e está na fase 1.

### 11.9 Um paciente tem vários protocolos ativos ao mesmo tempo `[Davi]`

Harmonização facial e emagrecimento rodam em paralelo, com cronogramas, intervalos e saldos independentes.

**Impacto na interface:** não existe "o plano do paciente". A tela do paciente mostra **planos**, cada um com sua linha do tempo e sua aderência. Toda tela que assumir plano único está errada.

### 11.10 Consentimento tem DOIS eixos, não um `[Davi]`

Correção da modelagem da seção 4. Davi confirmou que **todos** estes momentos de assinatura acontecem na prática: antes de cada procedimento, uma vez na primeira consulta, por protocolo contratado, e imagem sempre separada do clínico.

Portanto um consentimento é a interseção de:

| Eixo | Valores |
|---|---|
| **Finalidade** | tratamento clínico · uso interno / prontuário · uso externo / marketing |
| **Escopo (âncora)** | paciente (guarda-chuva) · protocolo contratado · procedimento específico · imagem |
| **Versão** | `termo_versao_id`, com hash do texto vigente na data |

`consentimento` referencia uma âncora polimórfica (`paciente_id`, `protocolo_instancia_id` ou `atendimento_id`) além da finalidade e da versão do termo.

**Por que importa:** modelar como camada única travaria tanto a clínica que assina por procedimento quanto a que assina guarda-chuva. As duas práticas coexistem no mercado.

### 11.11 Protocolos de tratamento são construídos pela clínica `[Davi]`

Não entregamos catálogo de protocolo pronto. Cada clínica ou profissional monta o seu. O `protocolo_template` é editável pela clínica e define:

- Sessões, procedimentos, ordem e intervalos esperados
- **Os pontos de acompanhamento e quais medidas coletar em cada um** (o acompanhamento de emagrecimento varia por clínica: consulta mensal com pesagem intermediária, multiprofissional, com ou sem contato entre consultas)
- Quem participa de cada etapa

**Impacto:** existe um editor de protocolo como funcionalidade de produto, e ele é da fase 2. O acompanhamento é configuração do template, nunca regra no código.

### 11.12 A captura de foto tem dois caminhos, não um `[Davi]`

O equipamento varia por clínica: celular do profissional, tablet da clínica e câmera dedicada convivem. Portanto o sistema precisa suportar **captura direta** (câmera do navegador, com guia de pose sobreposto) **e importação de arquivo**, com o mesmo pareamento de paciente + pose nos dois caminhos.

**Risco de LGPD a tratar:** quando a foto é tirada pelo celular pessoal do profissional, ela fica na galeria dele. A captura no PWA precisa gravar direto no sistema sem passar pela galeria, e a política da clínica deve orientar sobre isso.

### 11.13 Comissão é um motor de regras, não um campo `[Davi]`

Todas as quatro mecânicas são praticadas, às vezes na mesma clínica:

| Base de cálculo | Descrição |
|---|---|
| Percentual sobre o bruto | Sobre o valor cobrado do paciente |
| Percentual sobre o líquido | Desconta o custo do insumo aplicado antes de calcular |
| Valor fixo por procedimento | Tabela de quanto se paga por execução, independente do preço |
| Escalonada | O percentual muda por meta de faturamento ou por vínculo do profissional |

Uma regra de comissão é `{base, valor ou percentual, condição (vínculo, meta, procedimento), vigência}`, configurável por clínica e por profissional.

**Consequência forte:** a comissão sobre o líquido amarra o cálculo ao **lote e ao custo real** do insumo. Isso significa que o registro da aplicação (seção 11.3) deixa de ser burocracia clínica e passa a mexer no bolso do profissional — o que é, provavelmente, o melhor incentivo de adoção que o produto tem.

### 11.14 O dashboard da dona inclui o funil com jornada completa `[Davi]`

Além de faturamento do dia, ocupação de agenda, orçamentos em aberto e pacientes em risco de evasão, a dona acompanha o funil inteiro:

**captação → agendamentos → comparecimentos → conversão**

**Consequência:** taxa de comparecimento (no-show) é métrica de primeira classe, não subproduto do status da agenda. O funil não termina na venda: ele começa antes do agendamento e mede a perda em cada degrau.

### 11.15 Prioridade de IA `[Davi]`

Em ordem, o que o dono quer no produto:

1. **Simulação visual do resultado** — usada na avaliação, no momento de conversão.
2. **Gravação e transcrição da consulta que PREENCHE o prontuário** — não gera apenas texto solto: popula os campos estruturados da ficha e a evolução clínica.
3. **Evolução** — acompanhamento da progressão do paciente.

**Nota de arquitetura:** o item 2 valida a decisão 1 do spec. Uma IA que precisa preencher ficha estruturada exige um núcleo tipado com campos conhecidos. Num prontuário totalmente dinâmico (EAV) a IA não teria onde encaixar o resultado da transcrição.

**A confirmar no workshop de IA:** se "evolução" significa comparação assistida da série de fotos (a brecha que nenhum concorrente cobre) ou sumarização da evolução textual do prontuário.

### 11.16 O produto atende múltiplos PERFIS de clínica, e a lista é aberta `[Davi]`

Dentro de estética e medicina do emagrecimento existem modelos de operação muito diferentes: clínica que só faz consulta, clínica que pede exames, clínica de aparelho sem médico, clínica de cirurgia plástica. Davi confirmou os quatro perfis abaixo **e mais outros**, ou seja, a lista é extensível por definição.

| Perfil | Centro de gravidade |
|---|---|
| Harmonização e injetáveis | Mapa de aplicação, lote, foto padronizada, protocolo |
| Emagrecimento e medicina do estilo de vida | Exames, antropometria, prescrição controlada, consulta longa com retorno mensal |
| Estética corporal e facial com aparelho | Sessões em série, agenda amarrada ao equipamento, profissional frequentemente não médico |
| Cirurgia plástica | Contrato, pré-operatório, recursos externos, pós-operatório programado |
| **Outros** | A definir com o mercado |

**Decisão de arquitetura — o conceito de `perfil_clinica`:** um perfil é um objeto de configuração, **nunca um enum no código**, que define para a clínica no onboarding:

- Quais módulos ficam ativos (e a navegação se ajusta, sem deixar espaço morto)
- Quais fichas de anamnese vêm carregadas
- Qual catálogo de procedimentos vem sugerido
- Quais protocolos modelo
- Quais termos de consentimento
- Quais papéis existem

Todos os perfis rodam o **mesmo núcleo tipado** (paciente, atendimento, evolução, medida, foto, financeiro, auditoria). A diferença é composição por cima.

**Por que isso importa mais do que parece:** o benchmark mostrou que Amigo Clinic e MedX Care se descrevem como genéricos "para clínicas e consultórios" — e nenhum dos dois tem foto clínica decente, rastreabilidade de lote ou protocolo multi-sessão sério. Atender todo mundo raso é o modo padrão de falha deste mercado. Perfis existem para preservar profundidade: a clínica de injetável continua com mapa de aplicação real, não com uma versão diluída para caber também no nutrólogo.

**Custo assumido:** o conceito de perfil e a capacidade de ligar/desligar módulo nascem na **fase 0**. Enxertar depois obriga a reescrever navegação, permissão e onboarding.

### 11.17 Exames entram como documento anexado, não como valor estruturado `[Davi]`

**Decisão:** no v1, o resultado de exame é um **arquivo anexado ao prontuário**. Não há extração de valor, faixa de referência, alerta de alteração nem gráfico de evolução de exame.

Trade-off registrado e aceito: sem valor estruturado, o médico volta à planilha quando quer ver evolução laboratorial. O MedX Care já entrega isso (inclusive com IA lendo o PDF) e usa como destaque comercial.

**Mitigação de custo futuro, sem custo hoje:** o anexo nasce vinculado a **tipo de exame + data de coleta**, não como arquivo solto na pasta do paciente. Assim, estruturar os valores depois é funcionalidade nova, não migração de dados.

### 11.18 Cirurgia plástica é fase própria, depois do v1 `[Davi]`

A jornada cirúrgica é um vertical inteiro, não um procedimento maior:

- Contrato de cirurgia com sinal e parcelas
- Pré-operatório: exames, risco cirúrgico, avaliação de anestesista
- Agendamento com **recursos externos** — hospital, anestesista, instrumentador — que não são usuários do sistema
- Termo de consentimento cirúrgico próprio, com peso jurídico
- Pós-operatório com retornos programados, mais parecido com protocolo do que com consulta
- Foto com valor jurídico, não apenas clínico

Vira a **fase 5**, iniciada só depois de o núcleo estar validado com clínica real.

### 11.19 A fase 1 não é "vertical fina", é MESA DE ENTRADA `[Davi]`

Correção da decisão 3. O conjunto que eu havia chamado de vertical fina é insuficiente: nenhuma clínica migra de sistema por ele. Sem agenda de verdade, tabela de preços e receita rápida, o produto não substitui o que a clínica já usa — vira **um segundo lugar para digitar**, que é o modo padrão de morte de uma implantação.

O marco da fase 1 muda de "uma clínica atende um dia inteiro" para **"uma clínica real troca o sistema atual pelo nosso"**. É uma barra mais alta e mais honesta.

### 11.20 Agenda: quatro visões sobre três recursos `[Davi]`

Todas obrigatórias no v1, sobre o mesmo dado:

| Visão | Para quem serve |
|---|---|
| **Dia por profissional** (colunas) | O balcão. A mais usada, hora a hora |
| **Dia por sala e por equipamento** | Enxerga o gargalo físico; é o que evita marcar dois lasers no mesmo horário |
| **Semana de um profissional** | O próprio profissional se organizando e vendo buracos |
| **Mês com ocupação** | Gestão: densidade, dias fracos, planejamento de campanha |

Combinada com 11.8 (reserva de profissional + sala + equipamento), a agenda é o componente mais caro da fase 1 e não pode ser subestimada.

### 11.21 Tabela de preços é política de preço, não lista `[Davi]`

O preço de um procedimento varia pelos quatro eixos, simultaneamente:

| Eixo | Consequência |
|---|---|
| **Por profissional que executa** | O sênior cobra mais que o júnior pelo mesmo procedimento. Essencial quando o parceiro define o próprio preço (ver 11.1) |
| **Por unidade** | A mesma rede cobra diferente por praça |
| **Promocional com vigência** | Preço tem data de início e fim |
| **Desconto com limite por papel** | Recepção até X%, gestora até Y%, dona sem limite |

**Consequências de modelagem:**
- `preco` tem **vigência**. O orçamento **congela o valor aplicado** no momento da emissão — orçamento antigo nunca recalcula com preço novo.
- O desconto é autorizado no ato, contra o papel de quem aplica, e vira relatório de quem descontou o quê.

### 11.22 Prescrição entra no v1, dividida em duas metades `[Davi]`

Prescrição é mesa de entrada, não diferencial: o médico prescreve todo dia, e escolher a medicação recebendo a posologia já preenchida é a diferença entre usar o sistema e voltar ao bloco de receituário.

**Metade que entra na fase 1 (barata):**
- **Base de medicações pronta + favoritos da clínica.** Entregamos cobertura ampla e a clínica marca o que usa, formando sua lista curta. Obrigar cadastro do zero garante que o médico nunca use.
- **Modelos de posologia padronizados pela clínica, editáveis pelo médico no ato da prescrição.** A edição vale para aquela receita e **não altera o modelo**.
- Receita gerada em PDF, impressa e assinada no papel.

**Metade que fica para a fase 4 (cara):**
- Assinatura digital ICP-Brasil e receita controlada via integração Memed. Homologação, custo por receita e dependência de terceiro.

A primeira metade entrega o valor diário; a segunda entrega conformidade e comodidade.

### 11.23 Lead e paciente são a MESMA entidade, com estágio `[Davi]`

Não existe tabela de lead separada. Quem entra em contato já nasce como `paciente`, num estágio inicial. Ganha-se histórico único desde o primeiro toque e elimina-se a duplicata na conversão.

`paciente.estagio`: **lead → avaliado → em tratamento → inativo**, com a origem da captação gravada no cadastro (é o primeiro degrau do funil que a dona acompanha — ver 11.14).

**Poluição da base, e como se resolve:** o cadastro acumula gente que nunca pisou na clínica. Mitigação: telas clínicas filtram por estágio por padrão; só o funil e a busca comercial enxergam o estágio lead.

**LGPD — a preocupação se dissolve:** um lead que nunca foi atendido carrega apenas nome, contato e origem. **Dado sensível de saúde só passa a existir a partir do primeiro atendimento.** Portanto a base legal do lead (legítimo interesse ou consentimento simples) é distinta da base legal do paciente em tratamento (art. 11), e as duas convivem na mesma tabela sem conflito.

### 11.24 A avaliação é atendimento clínico E degrau do funil `[Davi]`

Um `atendimento` do tipo **avaliação** gera prontuário (anamnese, foto, avaliação clínica) e é simultaneamente o ponto do funil onde o `orcamento` nasce.

**Consequência de arquitetura, e é uma simplificação grande:** o funil roda sobre `atendimento` e `orcamento`, entidades que já existem. Não há pipeline comercial paralelo duplicando informação clínica. O degrau "compareceu" do funil (ver 11.14) é literalmente o status do agendamento.

### 11.25 A cobrança da avaliação tem três modelos `[Davi]`

Convivem, por perfil e por clínica:

| Modelo | Mecânica |
|---|---|
| **Gratuita** | Isca de conversão. O custo é tempo de agenda; a métrica é taxa de conversão por avaliador |
| **Cobrada** | Consulta como outra qualquer. Comum em emagrecimento e nutrologia, onde a consulta é o produto |
| **Cobrada com abatimento** | Cobra e abate no valor do tratamento se fechar. Exige **crédito de abatimento** no orçamento — mecânica financeira adicional |

### 11.26 Follow-up de orçamento é cadência configurável `[Davi]`

A prática varia da clínica que não faz nada à que tem processo definido. O produto entrega uma **cadência padrão configurável** por clínica (contato em X dias, depois em Y), gera a fila de quem contatar hoje, e **mede quem seguiu a cadência**.

**Oportunidade comercial:** onde a clínica hoje não persegue orçamento de forma organizada, este módulo é receita já gerada sendo perdida — é o argumento de venda mais direto do produto, porque o retorno é calculável em cima do próprio dado da clínica.

### 11.27 A unidade de controle do estoque depende do produto `[Davi]`

`produto` declara seu modo de controle:

| Modo | Exemplo | Comportamento |
|---|---|---|
| **Fracionado** | Toxina botulínica — frasco de 100 UI, aplicação de 20 UI | Saldo em unidade de medida (UI, ml). A aplicação consome fração |
| **Unitário** | Seringa de preenchedor, uso único por paciente | Saldo em peças. A aplicação consome a peça inteira |

### 11.28 Frasco aberto NÃO é controlado `[Davi]`

**Decisão de simplificação:** o sistema não rastreia o estado individual do frasco (aberto, reconstituído, saldo remanescente, validade pós-abertura).

**Consequência aceita:** o saldo de um produto fracionado é a soma em unidade de medida por lote (ex.: "300 UI do lote X"), não "3 frascos, um aberto com 40 UI". A clínica gerencia frasco aberto no olho, como faz hoje.

**O que NÃO se perde:** a rastreabilidade de lote continua intacta — toda aplicação registra de qual lote saiu. O que sai de escopo é apenas o estado do recipiente físico.

**Revisitar se:** aparecer exigência sanitária ou demanda de cliente sobre validade pós-reconstituição, que é questão de segurança do paciente, não de custo.

### 11.29 Entrada de estoque: segregação é configurável, não obrigatória `[Davi]`

Varia por porte. Na clínica pequena a dona compra, recebe e lança sozinha — sem ninguém para conferir. A partir de certo tamanho existe administrativo dedicado. E, como insumo próprio e da clínica convivem (11.6), o profissional parceiro lança o próprio produto.

**Consequência:** a segregação de função entre quem lança e quem confere é **configurável por clínica**, não regra fixa. Diferente da segregação venda/recebimento (11.13 e RF-032), que permanece obrigatória por ser exposição a fraude.

### 11.30 O onboarding não pode assumir que existe dado para importar `[Davi]`

O controle de estoque atual varia da planilha mal atualizada ao inexistente, passando pelo sistema que controla por receita média e diverge sempre.

**Consequência para o onboarding:** o caminho padrão é **começar do zero com inventário físico**, não importar saldo. Importação existe como opção quando há dado confiável, nunca como pré-requisito.

**Consequência para a adoção — e é estratégica:** em boa parte das clínicas o produto não está substituindo um processo, está **criando um**. Isso muda a venda e o suporte: não basta migrar, é preciso ensinar a operar. E reforça por que a baixa de estoque precisa nascer do prontuário (11.3) — um processo novo só pega se não depender de disciplina extra.

### 11.31 A migração precisa trazer os quatro conjuntos `[Davi]`

A clínica não aceita trocar de sistema sem migrar:

1. **Cadastro de pacientes** — mínimo absoluto, ninguém redigita mil pacientes
2. **Agenda futura já marcada** — sem isso é preciso um dia de virada com remarcação manual, e é onde a maioria das migrações falha
3. **Prontuário e histórico clínico** — tecnicamente o mais difícil: cada sistema exporta diferente e a foto raramente vem com pose e data
4. **Financeiro em aberto** — parcelas a receber, saldo de pacote vendido, crédito de paciente. Sem isso a clínica opera dois sistemas até o último pacote vencer

### 11.32 A clínica importa sozinha, por planilha `[Davi]`

**Decisão:** não há migração assistida como serviço. Entregamos modelo de planilha e tela de importação; a clínica executa.

**Justificativa aceita:** migração assistida consome o tempo do Davi, que é o gargalo do projeto inteiro. Essa decisão escala; a outra não.

**Risco registrado, e é o maior do onboarding:** exigir os quatro conjuntos (11.31) e deixar a clínica sozinha com CSV é a combinação de maior taxa de falha em implantação. Prontuário e financeiro por planilha, sem apoio, é onde a clínica desiste.

**Mitigação — o importador é um mini-produto, não uma tela:**
- Pré-visualização do que será gravado, antes de gravar
- Validação linha a linha com mensagem de erro legível por leigo
- Correção do erro na própria tela, sem reeditar a planilha
- **Idempotência**: reimportar a mesma planilha não duplica registro
- Importação parcial: pacientes agora, financeiro depois, sem travar o uso
- Relatório do que entrou, do que falhou e por quê

O esforço vai para o importador, não para horas de implantação. É a decisão certa dado o time, desde que o importador seja realmente bom.

### 11.33 Portal do paciente entrega os quatro, com travas no self-booking `[Davi]`

| Funcionalidade | Valor |
|---|---|
| **Ficha e termos preenchidos antes da consulta** | O que mais reduz trabalho administrativo (confirmado no benchmark, Aesthetic Record). Libera a recepção no dia |
| **Ver evolução: fotos, peso, medidas** | Retenção pura. Quem vê resultado objetivo compra a próxima sessão |
| **Saldo de pacote e próximas sessões** | Elimina a pergunta que mais chega por WhatsApp na recepção |
| **Agendar e remarcar sozinho** | Reduz ligação, mas exige travas |

**Travas obrigatórias no self-booking**, pela natureza da agenda deste produto:
- Respeitar disponibilidade simultânea de **profissional + sala + equipamento** (11.8), não só do profissional
- Respeitar o **intervalo mínimo do protocolo** (11.9) — o paciente não pode marcar sessão antes do tempo
- Respeitar a **trava dura de saldo** — não marcar sessão sem saldo disponível
- Respeitar o **escopo profissional** — não oferecer procedimento que aquele profissional não pode executar

Sem essas travas, o self-booking transfere para a recepção o trabalho de desmarcar o que o paciente marcou errado, que é pior do que não ter self-booking.
