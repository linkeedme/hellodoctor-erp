# Hello Doctor — Product Requirements Document (PRD)

## Status deste documento

Este PRD foi **reescrito do zero em 2026-08-30**, depois do workshop de domínio com Davi Torres (cirurgião-dentista, ex-consultor de clínicas, com clientes no nicho). O workshop virou a **seção 11** do spec de arquitetura (`docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md`), com 35 achados extraídos diretamente dele.

**Regra de origem aplicada em todo requisito de domínio deste documento:**

| Tag | Significa |
|---|---|
| `[Davi]` | Vem da seção 11 do spec — extraído do especialista no workshop. **Fato, não hipótese.** Tem precedência sobre qualquer outra fonte. |
| `[spec]` | Vem das seções 1–10 do spec (decisões de arquitetura já aprovadas antes do workshop, sessão original com Davi). Fato, mas anterior ao workshop de domínio — onde a seção 11 contradiz algo aqui, a seção 11 vence. |
| `[benchmark]` | Vem do benchmark competitivo (Amigo Clinic, MedX Care, Belle, Trinks, Clinicorp, Aesthetic Record, Zenoti, Boulevard), citado com fonte. |
| `[inferência]` | Dedução minha, sem confirmação do especialista nem dado de mercado. **Pendente de validação** — sinalizado explicitamente onde aparece em regra de negócio. |

**O que este documento resolve em relação à versão anterior:** toda a modelagem de domínio que era hipótese (fase 1, comissão, consentimento, estoque, vínculo do profissional, perfil de clínica, funil) agora está ancorada em `[Davi]`. **O que continua pendente:** metas numéricas de ativação/retenção/expansão (ainda sem clínica piloto), validação comercial das faixas de preço, e duas decisões que o próprio Davi deixou explicitamente para workshops seguintes (definição final de "evolução assistida" na IA, seção 11.15; e política de prazo de registro retroativo de estoque, seção 4 do spec).

---

**Data:** 2026-08-30
**Autor:** Bússola (Product Manager)
**Status:** v2 — para aprovação do dono do produto
**Fonte canônica de arquitetura:** `docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md` (aprovado, seção 11 tem precedência sobre qualquer inferência deste PRD)

---

## 1. Visão e problema

Hello Doctor é um SaaS multi-tenant de gestão para clínicas de **medicina estética e bem-estar**: harmonização facial, protocolos de emagrecimento e procedimentos estéticos executados por médicos e por não médicos habilitados (biomédico esteta, enfermeiro esteta, dentista com habilitação em HOF, esteticista).

### Por que existe

O benchmark competitivo mostrou que a mesa de entrada do setor — agenda, prontuário, financeiro, WhatsApp, NFS-e — já é paridade `[benchmark]`. Ninguém vence por ter isso. Seis brechas reais não são cobertas por nenhum concorrente: foto clínica sem padronização, evolução antropométrica ausente, termo de consentimento sem versionamento, comunicação de receita controlada inexistente, suporte como dor crônica do setor, e portabilidade de dado tratada como refém `[benchmark]`.

O workshop confirmou e aprofundou isso: o produto não compete por ter mais funcionalidade, compete por não tratar o nicho como genérico. **O conceito central que emergiu do workshop é o `perfil_clinica`** `[Davi 11.16]` — dentro de "estética e bem-estar" existem operações muito diferentes (harmonização e injetáveis, emagrecimento, estética corporal com aparelho, cirurgia plástica, e mais perfis ainda não mapeados), e o erro dos concorrentes generalistas é atender todos rasos. O Hello Doctor roda um único núcleo tipado para todos os perfis, mas cada perfil liga módulos, fichas, catálogo e termos diferentes por cima.

### Para quem

Clínicas de estética e bem-estar no Brasil, sempre com CNPJ próprio `[Davi 11.7]`, com equipe de vínculo misto — CLT, parceiro PJ com repasse, profissional que aluga sala — operando na mesma agenda, no mesmo prontuário e sob o mesmo controle de estoque `[Davi 11.1]`.

### O que muda na vida da clínica

- A clínica **troca de sistema de verdade**, não adota um segundo lugar para digitar — porque a fase 1 entrega agenda real, tabela de preços e prescrição rápida, não um recorte raso `[Davi 11.19]`.
- A dona vê o estoque com **divergência exposta, não escondida**: saldo contábil, consumo pendente de lançamento e saldo projetado, porque registrar a aplicação não trava o atendimento mas também não finge que o saldo está fechado `[Davi 11.3]`.
- A comissão sobre o líquido puxa o **custo real do lote aplicado** — o que torna o registro de aplicação uma questão de bolso do profissional, não burocracia clínica `[Davi 11.13]`.
- Numa fiscalização sanitária, a clínica reconstrói exatamente o que foi feito, com qual produto, qual lote e qual profissional, sessão a sessão `[spec]`.
- Se a clínica quiser sair do Hello Doctor, ela exporta tudo, de graça, em formato aberto `[spec]`.
- Migrar para o Hello Doctor não depende da agenda do Davi: a própria clínica importa pacientes, agenda futura, prontuário e financeiro em aberto por planilha, num importador feito para leigo `[Davi 11.31, 11.32]`.

---

## 2. Personas

### 2.1 Dona/gestora da clínica

**Perfil:** proprietária, frequentemente também profissional injetora. Entre 30 e 55 anos, gerencia de 1 a 4 unidades. `[inferência]` — faixa etária e número de unidades não vieram do workshop; é composição razoável a partir do porte descrito em 11.2 e 11.29, pendente de validação com clínica real.

**Seu dia:** abre o dashboard para ver faturamento do dia, ocupação de agenda, orçamentos em aberto, pacientes em risco de evasão **e o funil inteiro — captação → agendamentos → comparecimentos → conversão**, com taxa de não comparecimento como métrica de primeira classe `[Davi 11.14]`.

**Dor concreta:** não sabe, em tempo real, quanto de produto foi de fato consumido versus o lançado — mas o sistema não finge saber: expõe a divergência entre saldo contábil e consumo pendente em vez de escondê-la `[Davi 11.3]`. Não enxerga onde está perdendo paciente antes da venda fechar, porque hoje o funil não é medido como funil `[Davi 11.14]`.

**Vínculo com a equipe:** convive com CLT, parceiro PJ com repasse e profissional que aluga sala na mesma operação — cada um com mecânica de comissão, agenda e visibilidade de paciente diferentes `[Davi 11.1]`. Em clínica pequena, ela mesma avalia, orça e fecha; a partir de certo porte, delega o fechamento a uma consultora comercial dedicada `[Davi 11.2]`.

**O que a faz abandonar um software:** suporte lento quando o sistema trava no meio do dia `[benchmark]`. Relatório de comissão e estoque que não fecha com a realidade. Sentir que os dados são reféns do fornecedor `[benchmark]`.

### 2.2 Profissional injetor (médico ou não médico habilitado)

**Perfil:** executa o procedimento. Pode ser CRM, CRBM, COREN ou CRO habilitado em HOF. `profissional.vinculo` é campo obrigatório com três variações reais e coexistentes na mesma clínica `[Davi 11.1]`:

- **CLT** — horário e visibilidade de paciente definidos pela clínica.
- **Parceiro PJ com repasse** — comissão por repasse, pode trazer o próprio paciente.
- **Profissional que aluga sala** — frequentemente traz o próprio paciente e usa insumo próprio, não da clínica `[Davi 11.6]`; a pergunta "de quem é este paciente" não tem resposta única e depende da política de visibilidade que a clínica configurou `[Davi 11.5]`.

**Seu dia:** entra na sala, confere o prontuário, avalia, executa. Registra a aplicação (região, lote, quantidade) **na hora ou depois** — o sistema não exige tempo real, mas mantém a pendência visível até o registro acontecer `[Davi 11.3]`.

**Dor concreta:** hoje perde tempo registrando manualmente o que aplicou, quando registra. Quando o vínculo é aluguel de sala e ele usa produto próprio, precisa que o sistema saiba que aquele custo não entra no resultado da clínica `[Davi 11.6]`.

**O que o faz abandonar um software:** tela de registro clínico lenta ou que trava a agenda esperando um lançamento que ele faria depois de qualquer forma. Sistema que permite executar procedimento fora do próprio escopo profissional, expondo ele e a clínica `[spec]`.

### 2.3 Consultora comercial (papel opcional, a partir de certo porte)

**Perfil:** existe apenas em clínicas de porte maior. Assume o paciente depois da avaliação clínica para conduzir a negociação do orçamento `[Davi 11.2]`.

**Seu dia:** trabalha a fila de orçamentos em aberto com cadência de follow-up configurada pela clínica, contatando quem está no prazo de retorno `[Davi 11.26]`. Sua comissão de venda é independente da comissão de execução do profissional que atendeu `[Davi 11.2]`.

**Dor concreta:** em clínica sem esse papel, ninguém persegue orçamento de forma organizada, e a receita perdida por isso não é medida `[Davi 11.26]`. Onde o papel existe, ele precisa de visibilidade sobre orçamento e funil sem precisar abrir o prontuário clínico.

**O que a faz abandonar um software:** funil que trata orçamento genérico como texto livre, sem os dados clínicos (procedimento, área, sessões) que fecham a venda `[spec]`.

### 2.4 Recepcionista/secretária

**Perfil:** primeira linha de contato. Gerencia agenda, confirmação, recebimento no balcão, emissão de nota.

**Seu dia:** opera a agenda em quatro visões diferentes conforme a necessidade do momento — dia por profissional no balcão hora a hora, dia por sala/equipamento para não marcar dois lasers no mesmo horário, e consulta a visão de mês quando a gestão pede densidade de ocupação `[Davi 11.20]`. Aplica desconto no ato, dentro do limite que o papel dela autoriza — acima disso, precisa de alguém com mais alçada `[Davi 11.21]`.

**Dor concreta:** hoje agenda sem saber, sem abrir o prontuário inteiro, se o paciente tem saldo — o sistema precisa bloquear isso na tela de agendamento, não deixar para descobrir no check-in `[spec]`. Sem tabela de preço por profissional, promocional e por unidade tudo junto numa política só, ela erra o valor cobrado com frequência `[Davi 11.21]`.

**O que a faz abandonar um software:** agenda lenta em horário de pico. Falta de trava de saldo. Preço que não reflete o que a clínica realmente pratica (varia por quem executa, por unidade e por promoção vigente) `[Davi 11.21]`.

### 2.5 Paciente (e lead — mesma entidade, estágios diferentes)

**Não existe cadastro de lead separado.** Quem entra em contato já nasce como `paciente`, num estágio inicial, com a origem da captação gravada `[Davi 11.23]`. `paciente.estagio` percorre **lead → avaliado → em tratamento → inativo**.

**Sua jornada:** contato inicial (lead) → avaliação, que já é atendimento clínico completo (anamnese, foto, avaliação) **e** o ponto onde o orçamento nasce `[Davi 11.24]` → decisão entre opções de orçamento, podendo pagar (ou não) pela própria avaliação, com ou sem abatimento no tratamento `[Davi 11.25]` → execução, possivelmente em múltiplos protocolos paralelos e independentes (harmonização e emagrecimento rodando ao mesmo tempo, por exemplo) `[Davi 11.9]` → acompanhamento de evolução.

**Dor concreta:** não enxerga sua evolução de forma objetiva sem depender da clínica. Assina consentimento sem clareza sobre o que autorizou especificamente — o consentimento real no mercado tem dois eixos (finalidade × âncora: paciente-guarda-chuva, protocolo, procedimento específico ou imagem), não uma camada única `[Davi 11.10]`. Não sabe, sem perguntar, quanto de saldo já usou.

**O que resolve isso (fase 4, portal do paciente):** ficha e termos preenchidos antes da consulta, ver evolução (fotos, peso, medidas), ver saldo e próximas sessões, e agendar sozinho — com o sistema aplicando automaticamente as mesmas travas de saldo, intervalo, escopo profissional e disponibilidade de recurso que valem para a recepção `[Davi 11.33]`.

**Nuance de LGPD:** enquanto é só lead, o paciente carrega apenas nome, contato e origem — dado sensível de saúde só passa a existir a partir do primeiro atendimento, então a base legal do lead (legítimo interesse/consentimento simples) é distinta da do paciente em tratamento (art. 11), convivendo na mesma tabela sem conflito `[Davi 11.23]`.

---

## 3. Jobs To Be Done

- Quando **sou dona de uma clínica pequena**, eu quero **avaliar, orçar e fechar sozinha, sem depender de um papel comercial dedicado**, para que **o funil funcione igual em qualquer porte de clínica** `[Davi 11.2]`.
- Quando **meu vínculo é aluguel de sala e trago meu próprio paciente**, eu quero **que a clínica não veja meu prontuário por padrão**, para que **minha relação com o paciente continue sendo minha** `[Davi 11.1, 11.5]`.
- Quando **termino um atendimento sem tempo de registrar a aplicação**, eu quero **que ela vire pendência, não bloqueio**, para que **eu não perca o fluxo da sala** `[Davi 11.3]`.
- Quando **um paciente faz harmonização e emagrecimento ao mesmo tempo**, eu quero **ver os dois protocolos como planos separados**, para que **eu não misture aderência de jornadas diferentes** `[Davi 11.9]`.
- Quando **calculo comissão sobre o líquido**, eu quero **que o sistema puxe o custo real do lote aplicado**, para que **meu repasse reflita o que realmente aconteceu, não uma média** `[Davi 11.13]`.
- Quando **um contato chega pela primeira vez**, eu quero **que ele já exista como paciente em estágio lead**, para que **eu não duplique cadastro quando ele fechar** `[Davi 11.23]`.
- Quando **estou avaliando um paciente**, eu quero **que o orçamento nasça direto daquele atendimento clínico**, para que **eu não redigite dado clínico no funil comercial** `[Davi 11.24]`.
- Quando **minha clínica não persegue orçamento parado de forma organizada**, eu quero **uma cadência automática de follow-up com fila do dia**, para que **eu recupere receita que hoje se perde** `[Davi 11.26]`.
- Quando **estou trocando de sistema**, eu quero **migrar pacientes, agenda futura, prontuário e financeiro em aberto sozinha, por planilha**, para que **eu não precise operar dois sistemas em paralelo** `[Davi 11.31, 11.32]`.
- Quando **um paciente quer se auto-agendar no portal**, eu quero **que o sistema respeite saldo, intervalo do protocolo e escopo profissional automaticamente**, para que **a recepção não precise desfazer agendamento errado** `[Davi 11.33]`.
- Quando **cadastro um produto no estoque**, eu quero **declarar se ele é fracionado (UI/ml) ou unitário (peça)**, para que **o saldo seja controlado do jeito certo para aquele insumo** `[Davi 11.27]`.
- Quando **um lote é meu (profissional) e não da clínica**, eu quero **que o custo e o alerta de vencimento sigam para mim, não para a gestão**, para que **a contabilidade da clínica não misture o que não é dela** `[Davi 11.6]`.
- Quando **agendo um procedimento que usa equipamento compartilhado**, eu quero **que o sistema bloqueie conflito de profissional, sala e equipamento ao mesmo tempo**, para que **dois profissionais nunca marquem o mesmo laser no mesmo horário** `[Davi 11.8]`.
- Quando **preciso montar um protocolo de tratamento**, eu quero **definir eu mesma as sessões, os intervalos e os pontos de acompanhamento**, para que **o produto sirva ao jeito como minha clínica realmente acompanha o paciente** `[Davi 11.11]`.

---

## 4. Requisitos funcionais por fase

Fases conforme spec (seção 8, atualizada pela seção 11). Toda linha tem origem marcada.

### Fase 0 — Fundação (nada visível ao usuário; pular é retrabalho garantido)

| ID | Origem | Descrição | Critério de aceite |
|---|---|---|---|
| RF-001 | `[spec]` | Isolamento multi-tenant via `clinica_id` + RLS em toda tabela de domínio | Suíte automatizada no CI testa, para cada tabela de domínio, se um usuário autenticado como Clínica A lê/escreve/apaga dado da Clínica B. Build quebra se qualquer tentativa tiver sucesso ou se uma tabela nova não tiver teste associado |
| RF-002 | `[spec]` | Acesso a dado exclusivamente via servidor | Nenhuma chamada ao banco existe em código client; regra estática no CI falha o build se detectar cliente de banco importado em componente client |
| RF-003 | `[spec]` | Autenticação com claim de `clinica_id` no token | Token contém `clinica_id` e `usuario_id`; RLS usa esse claim; login sem clínica ativa não gera token válido para rota de domínio |
| RF-004 | `[spec]` | RBAC com papel e permissão por `membro` | Usuário sem permissão recebe 403 do servidor antes de qualquer acesso ao banco; teste cobre cada papel padrão x cada ação restrita |
| RF-005 | `[spec]` | Escopo profissional bloqueado no catálogo | Execução ou prescrição por profissional fora do escopo do `procedimento` é recusada pelo servidor com mensagem explícita |
| RF-006 | `[spec]` | Auditoria imutável e append-only, incluindo leitura de prontuário | Tabela de auditoria não aceita UPDATE nem DELETE (constraint/trigger de banco); toda leitura de ficha gera evento |
| RF-007 | `[Davi 11.10]` | Consentimento modelado em dois eixos: **finalidade** (tratamento clínico · uso interno · uso externo/marketing) × **âncora** (paciente-guarda-chuva · protocolo · procedimento · imagem), cada um com `termo_versao_id` | `consentimento` referencia âncora polimórfica (`paciente_id`, `protocolo_instancia_id` ou `atendimento_id`) + finalidade + versão; teste comprova que revogar finalidade marketing numa âncora específica não afeta consentimento de tratamento nem de outras âncoras |
| RF-008 | `[spec]` | Observabilidade mínima operante | Todo log estruturado carrega `clinica_id`, `usuario_id`, `request_id`; health check por dependência com página de status |
| RF-009 | `[Davi 11.16]` | `perfil_clinica` como objeto de configuração (não enum fixo), definindo módulos ativos, fichas carregadas, catálogo sugerido, protocolos modelo, termos e papéis, por clínica | Ativar um novo perfil não exige deploy; teste comprova que dois perfis diferentes no mesmo ambiente têm navegação, catálogo e ficha padrão distintos, sem código condicional por nome de perfil espalhado pela aplicação |
| RF-010 | `[Davi 11.5]` | Política de visibilidade de paciente configurável por clínica, com 3 modos: isolado no profissional, aberto à clínica, aberto com clínico restrito | RLS filtra por `clinica_id` **e** pela política vigente; teste comprova os três modos numa mesma base de dados, com profissionais e papéis diferentes tentando ler o mesmo paciente |
| RF-011 | `[Davi 11.1]` | `profissional.vinculo` obrigatório: CLT · parceiro PJ com repasse · aluga sala | Cadastro de profissional exige vínculo antes de habilitar agenda; vínculo é referenciado por RF-010 (visibilidade), pela regra de comissão (fase 3) e pelo proprietário do lote (fase 2) |
| RF-012 | `[Davi 11.7]` | Tenant é sempre uma clínica com CNPJ; não existe plano individual para profissional autônomo | Cadastro de novo tenant exige CNPJ válido antes de liberar qualquer módulo |

### Fase 1 — Mesa de entrada (marco: **uma clínica real troca o sistema atual pelo nosso** `[Davi 11.19]`)

| ID | Origem | Descrição | Critério de aceite |
|---|---|---|---|
| RF-013 | `[spec]` | Cadastro de paciente (agora com estágio) | CPF único por clínica; responsável legal obrigatório para menor; `paciente.estagio` inicia em `lead` e nunca é campo livre — só transita pelos 4 valores definidos `[Davi 11.23]` |
| RF-014 | `[Davi 11.8]` | Agenda reserva profissional + sala + equipamento simultaneamente | `procedimento` declara recursos exigidos; criação de agendamento roda detecção de conflito sobre os três recursos; tentativa de sobrepor qualquer um dos três é bloqueada |
| RF-015 | `[Davi 11.20]` | Quatro visões de agenda sobre o mesmo dado: dia por profissional, dia por sala/equipamento, semana de um profissional, mês com ocupação | As quatro visões existem no v1 (nenhuma é "depois"); trocar de visão não perde filtro de unidade/profissional selecionado |
| RF-016 | `[spec]` | Atendimento avulso | `atendimento` sem `sessao_planejada_id` funciona ponta a ponta sem exigir protocolo prévio |
| RF-017 | `[spec]` | Ficha configurável por especialidade | Nova especialidade é template novo (JSON Schema), sem deploy; ficha fora do schema vigente é rejeitada na gravação |
| RF-018 | `[spec]` | Evolução clínica por atendimento | Todo atendimento concluído tem `evolucao` associada |
| RF-019 | `[Davi 11.12]` | Captura de foto por dois caminhos: câmera do navegador com guia de pose sobreposto, e importação de arquivo — com o mesmo pareamento paciente + pose nos dois | Foto importada exige paciente e pose antes de salvar, igual à captura direta; captura via PWA grava direto no sistema sem depender da galeria do dispositivo |
| RF-020 | `[Davi 11.17]` | Exame como anexo vinculado a tipo de exame + data de coleta (sem extração de valor no v1) | Upload de exame exige tipo e data antes de salvar; não há campo de valor estruturado nem alerta de faixa de referência no v1 |
| RF-021 | `[Davi 11.21]` | Tabela de preços como política em 4 eixos: por profissional que executa, por unidade, promocional com vigência, desconto com limite por papel | `preco` tem vigência; orçamento **congela** o valor aplicado na emissão (nunca recalcula com preço novo); desconto acima do limite do papel de quem aplica é bloqueado e todo desconto vira relatório de quem descontou o quê |
| RF-022 | `[Davi 11.22]` | Prescrição rápida (metade 1, fase 1): base de medicações + favoritos por clínica, modelos de posologia editáveis no ato sem alterar o modelo, PDF impresso e assinado no papel | Clínica consegue marcar favoritos a partir de base pronta sem cadastro manual de medicação; editar posologia numa receita não altera o modelo salvo; receita gerada em PDF pronta para impressão |
| RF-023 | `[spec]` | Recebimento simples | Baixa de `titulo`/`parcela` gera `recebimento` auditável (ver RF-032, segregação) |
| RF-024 | `[Davi 11.31, 11.32]` | Migração self-service por planilha, cobrindo os 4 conjuntos: pacientes, agenda futura, prontuário/histórico, financeiro em aberto | Importador oferece pré-visualização antes de gravar, validação linha a linha com mensagem legível por leigo, correção do erro na própria tela, idempotência (reimportar não duplica), importação parcial por conjunto, e relatório do que entrou/falhou e por quê |

### Fase 2 — O que é nosso (marco: o produto deixa de ser genérico e vira específico de estética)

| ID | Origem | Descrição | Critério de aceite |
|---|---|---|---|
| RF-025 | `[Davi 11.11]` | Editor de protocolo: a clínica monta o próprio `protocolo_template` (sessões, procedimentos, ordem, intervalos esperados, pontos de acompanhamento e quais medidas coletar em cada um) | Clínica cria e edita template sem suporte do fornecedor; nenhuma regra de acompanhamento vive hardcoded no código — é sempre configuração do template |
| RF-026 | `[Davi 11.9]` | Paciente pode ter múltiplos `protocolo_instancia` ativos simultaneamente, cada um com sua linha do tempo e aderência | Tela do paciente lista **planos** (plural); nenhuma tela assume "o plano" no singular; aderência é calculada por instância, não por paciente |
| RF-027 | `[Davi 11.3]` | Mapa de aplicação com lote, registro não obrigatório no momento do atendimento | `aplicacao` grava `ocorrido_em` e `registrado_em` distintas, ambas auditadas; atendimento sem registro de aplicação gera item na fila de pendências por profissional, não bloqueia o fechamento do atendimento; registro retroativo é permitido e auditado |
| RF-028 | `[Davi 11.3]` | Estoque expõe divergência temporária conhecida | Tela de saldo mostra três números: saldo contábil, consumo pendente de lançamento, saldo projetado — nunca um saldo único que finge estar fechado enquanto há pendência aberta |
| RF-029 | `[Davi 11.27]` | Unidade de controle por produto: fracionado (UI/ml) ou unitário (peça) | `produto.modo_controle` declarado no cadastro; aplicação sobre produto fracionado consome fração da unidade de medida; sobre produto unitário consome a peça inteira |
| RF-030 | `[Davi 11.28]` | Frasco aberto não é controlado individualmente | Saldo de produto fracionado é a soma por lote na unidade de medida (ex.: "300 UI do lote X"), sem campo de estado do frasco físico; rastreabilidade de lote por aplicação continua obrigatória |
| RF-031 | `[Davi 11.6]` | Insumo tem proprietário: clínica (padrão) ou profissional específico | `lote.proprietario_id` opcional aponta para profissional; custo do procedimento só entra no resultado da clínica quando o lote é dela; alerta de vencimento vai para o dono real do lote |
| RF-032 | `[Davi 11.29]` | Segregação de função na entrada de estoque é configurável por clínica (diferente da segregação venda/recebimento, que é obrigatória — ver RF-041) | Clínica pequena pode ter a mesma pessoa comprando, recebendo e lançando; clínica que ativa a segregação tem a checagem aplicada pelo servidor |
| RF-033 | `[Davi 11.30]` | Onboarding de estoque não assume dado para importar; caminho padrão é inventário físico do zero | Fluxo de ativação de estoque oferece "começar do zero" como padrão; importação de saldo existente é opção, nunca pré-requisito |
| RF-034 | `[spec]` | Antropometria em série temporal com gráfico | Cada `medida` é uma linha própria com data; gráfico por tipo de medida existe com no mínimo 2 pontos |
| RF-035 | `[spec]` | Custo real por lote consumido | Relatório de custo usa o custo do lote efetivamente registrado em `aplicacao`, nunca média de receita configurada |

### Fase 3 — Comercial (marco: a clínica passa a **vender** dentro do sistema)

| ID | Origem | Descrição | Critério de aceite |
|---|---|---|---|
| RF-036 | `[Davi 11.23]` | Lead e paciente são a mesma entidade, com `estagio` e origem de captação gravada | Nenhum cadastro de lead separado existe; conversão de lead para avaliado não gera novo registro, só transição de estágio; telas clínicas filtram por padrão os estágios além de lead |
| RF-037 | `[Davi 11.24]` | Avaliação é atendimento clínico e degrau do funil ao mesmo tempo; orçamento nasce do `atendimento` tipo avaliação | Não existe pipeline comercial paralelo duplicando dado clínico; status "compareceu" do funil é literalmente o status do agendamento daquele atendimento |
| RF-038 | `[Davi 11.25]` | Três modelos de cobrança de avaliação: gratuita, cobrada, cobrada com abatimento | Modelo "cobrada com abatimento" gera crédito de abatimento vinculado ao orçamento, aplicado automaticamente se o tratamento fechar |
| RF-039 | `[Davi 11.26]` | Follow-up de orçamento com cadência configurável por clínica | Sistema gera fila diária de quem contatar; mede e reporta quem seguiu a cadência configurada vs. quem não seguiu |
| RF-040 | `[spec]` | Orçamento multi-opção que atravessa o funil | `orcamento` nasce da avaliação, aceita 2+ opções, tem validade; aceito gera `venda` com composição e preço congelados |
| RF-041 | `[spec]` | Segregação de papéis financeiros (venda × recebimento) — obrigatória, sem exceção de configuração | Usuário que registra venda não pode confirmar recebimento da mesma venda; tentativa é bloqueada e auditada como tentativa negada |
| RF-042 | `[Davi 11.4]` | Quatro modelos de venda coexistem: pacote fechado (`saldo_sessao`, trava dura), avulso (venda e execução no mesmo ato), assinatura (recorrência mensal, direito de consumo por período), crédito pré-pago (carteira em reais, não define o consumo na compra) | Cada modelo tem sua mecânica própria testável isoladamente; assinatura cobre fluxo de falha de cobrança, suspensão e reativação; crédito pré-pago é abatido em qualquer procedimento compatível no momento do uso, não na compra |
| RF-043 | `[spec]` | Trava dura de saldo | Agendar ou consumir sessão sem saldo disponível é bloqueado pelo servidor, mensagem exibida antes da confirmação |
| RF-044 | `[Davi 11.13]` | Comissão como motor de regras com 4 bases: percentual sobre bruto, percentual sobre líquido (desconta custo do insumo), valor fixo por procedimento, escalonada por meta/vínculo | Regra de comissão é `{base, valor ou percentual, condição, vigência}`, configurável por clínica e por profissional; comissão sobre líquido consulta o custo real do lote registrado em `aplicacao` (RF-027), nunca uma média |
| RF-045 | `[Davi 11.2]` | Comissão de venda (consultora comercial) é independente da comissão de execução (profissional) | As duas comissões são calculadas e reportadas separadamente sobre a mesma venda, sem depender uma da outra |
| RF-046 | `[Davi 11.14]` | Dashboard da dona com funil completo: captação → agendamentos → comparecimentos → conversão | Taxa de não comparecimento (no-show) é relatório de primeira classe, não subproduto do status de agenda; cada degrau do funil mostra volume e taxa de perda para o degrau seguinte |
| RF-047 | `[spec]` | Integração Zaple via eventos | Hello Doctor publica eventos (agendamento criado, confirmação pendente, orçamento sem resposta, sessão a vencer); Zaple devolve resposta do paciente como evento, sem inbox de WhatsApp nativo no Hello Doctor |
| RF-048 | `[spec]` | Emissão de NFS-e | Toda venda com recebimento confirmado permite emissão sem redigitação de valores |

### Fase 4 — Diferenciação (marco: o que sustenta preço)

| ID | Origem | Descrição | Critério de aceite |
|---|---|---|---|
| RF-049 | `[Davi 11.15]` | Prioridade 1 de IA: simulação visual do resultado, usada na avaliação | Captura de contato (nome + telefone ou e-mail) acontece **antes** de exibir o resultado; lead capturado gera/atualiza `paciente` em estágio lead automaticamente |
| RF-050 | `[Davi 11.15]` | Prioridade 2 de IA: transcrição de consulta que **preenche** o prontuário estruturado, não gera só texto solto | Transcrição popula campos conhecidos da ficha/evolução (núcleo tipado), com revisão humana obrigatória antes de salvar — nunca grava automaticamente sem confirmação do profissional |
| RF-051 | `[Davi 11.15]` | Prioridade 3 de IA: evolução assistida — **escopo a confirmar no workshop de IA** `[inferência marcada como pendente]` | Pendente: definir se significa comparação assistida da série de fotos (pose a pose) ou sumarização da evolução textual do prontuário. Nenhuma build desta funcionalidade começa antes dessa definição |
| RF-052 | `[Davi 11.22]` | Prescrição rápida (metade 2, fase 4): assinatura digital ICP-Brasil e receita controlada via Memed | Prescrição de item controlado (GLP-1, sibutramina) segue fluxo de assinatura via Memed; prescrição sem habilitação do profissional para aquele item é recusada (reaproveita RF-005) |
| RF-053 | `[Davi 11.33]` | Portal do paciente completo: ficha e termos pré-consulta, ver evolução (fotos/peso/medidas), ver saldo e próximas sessões, self-booking | Self-booking respeita, no mesmo agendamento, as 4 travas: disponibilidade simultânea de profissional + sala + equipamento (RF-014), intervalo mínimo do protocolo (RF-026), saldo disponível (RF-043), escopo profissional do procedimento oferecido (RF-005) |

### Fase 5 — Cirurgia (marco: abre o perfil de cirurgia plástica; inicia só depois do núcleo validado com clínica real `[Davi 11.18]`)

| ID | Origem | Descrição | Critério de aceite |
|---|---|---|---|
| RF-054 | `[Davi 11.18]` | Contrato de cirurgia com sinal e parcelas | Contrato gera título e parcelas vinculados à cirurgia, distinto do fluxo de venda de procedimento simples |
| RF-055 | `[Davi 11.18]` | Pré-operatório: exames, risco cirúrgico, avaliação de anestesista | Checklist pré-operatório bloqueia agendamento da cirurgia enquanto item obrigatório estiver pendente |
| RF-056 | `[Davi 11.18]` | Agendamento com recursos externos (hospital, anestesista, instrumentador) que não são usuários do sistema | Recurso externo é registrável e reservável no agendamento sem exigir conta de usuário |
| RF-057 | `[Davi 11.18]` | Termo de consentimento cirúrgico próprio, com peso jurídico | Termo cirúrgico usa o mesmo motor de versão de RF-007, com âncora própria de procedimento cirúrgico |
| RF-058 | `[Davi 11.18]` | Pós-operatório com retornos programados, modelado como protocolo | Reaproveita o motor de protocolo (RF-025/RF-026), não um fluxo de consulta avulsa |
| RF-059 | `[Davi 11.18]` | Foto com valor jurídico, não apenas clínico | Metadados de captura (data, dispositivo, hash) preservados com rigor probatório, reaproveitando RF-019 |

### Transversal — todas as fases

| ID | Origem | Descrição | Critério de aceite |
|---|---|---|---|
| RF-060 | `[spec]` | Exportação completa de dados do paciente | Sistema entrega todos os dados do paciente (prontuário, fotos, medidas, financeiro dele) em formato aberto, sem custo, em até 72 horas |

---

## 5. Requisitos não funcionais

### Performance

- RNF-001: Tempo de resposta do servidor para leitura de agenda e prontuário: **p95 ≤ 400ms**, **p99 ≤ 900ms**. `[inferência]`
- RNF-002: Carregamento da tela de agenda (as 4 visões da RF-015 incluídas): **FCP ≤ 1,5s em p75**, conexão 4G simulada. `[inferência]` — a visão de mês com ocupação e a de dia por sala/equipamento agregam mais dado que uma agenda simples; validar se o alvo se sustenta com carga real.
- RNF-003: Upload e processamento de foto clínica (captura ou importação, RF-019): **≤ 3s** do fim do upload até aparecer no prontuário. `[inferência]`
- RNF-004: Transcrição de consulta (RF-050): retorno do rascunho estruturado em **≤ 5 minutos** para áudio de até 30 minutos. `[inferência]`

*Os alvos acima são hipótese de engenharia, não dado de mercado. Precisam de validação com carga real na clínica piloto.*

### Disponibilidade

- RNF-005: Disponibilidade mensal: **≥ 99,5%**. `[inferência]`
- RNF-006: RTO em falha do banco primário: **≤ 1 hora**. `[inferência]`
- RNF-007: RPO: **≤ 15 minutos** via backup contínuo. `[inferência]`
- RNF-008: SLA de suporte publicado (compromisso de posicionamento `[spec]`): primeira resposta em **≤ 4h úteis** para chamado crítico, **≤ 1 dia útil** para não crítico. `[inferência]` — número específico ainda não validado com o dono.

### Segurança

- RNF-009: TLS 1.2+ em trânsito; AES-256 (ou equivalente do provedor) em repouso. `[spec]`
- RNF-010: URLs de mídia assinadas, expirando em **≤ 15 minutos**; nunca URL pública permanente para foto de paciente. `[spec]`
- RNF-011: Sessão expira por inatividade em **≤ 30 minutos**; token de acesso com vida máxima de 1 hora. `[inferência]`
- RNF-012: 100% das tabelas de domínio com teste de isolamento de tenant no CI (RF-001); build não promove sem 100% passando. `[spec]`
- RNF-013: Payload de erro no Sentry nunca contém dado de paciente; só identificadores técnicos. `[spec]`

### LGPD

- RNF-014: Consentimento em dois eixos (RF-007), versionado e auditável; revogação de uma âncora/finalidade específica propaga em **≤ 1 minuto** sem afetar outras âncoras. `[Davi 11.10]`
- RNF-015: Base legal distinta para paciente-lead (legítimo interesse/consentimento simples, só nome/contato/origem) e paciente em tratamento (art. 11, dado sensível de saúde a partir do primeiro atendimento), convivendo na mesma tabela `[Davi 11.23]`.
- RNF-016: Atendimento a requisição de titular em **≤ 15 dias corridos** (art. 19); exportação self-service (RF-060) cobre a maior parte sem intervenção manual. `[inferência de prazo, obrigação legal real]`
- RNF-017: Eliminação de dado clínico respeita a guarda legal de prontuário (CFM: 20 anos); antes disso, é anonimização, não exclusão física. `[spec]`
- RNF-018: DPO nomeado com canal público; DPA anexado ao contrato definindo Hello Doctor como operador e clínica como controladora. `[spec]`
- RNF-019: Runbook de incidente de segurança formalizado, com prazo de comunicação conforme art. 48. `[spec]`

### Acessibilidade

- RNF-020: Portal do paciente (RF-053) atende **WCAG 2.1 nível AA** em contraste, navegação por teclado e rótulo de formulário. `[inferência]`
- RNF-021: Telas internas de alta frequência (agenda multi-recurso, prontuário) suportam navegação por teclado e leitor de tela nos fluxos críticos, sem certificação AA completa exigida no v1. `[inferência]`

### Observabilidade

- RNF-022: 100% dos logs com `clinica_id`, `usuario_id`, `request_id`. `[spec]`
- RNF-023: Alerta acionável para: erro de integração externa **> 5%/15min**; fila de transcrição parada **> 30min**; clínica sem agendamento criado em **7 dias consecutivos**; fila de pendência de registro de aplicação (RF-027) crescendo sem lançamento há **> 48h**. `[inferência sobre o gatilho, princípio herdado do spec]`
- RNF-024: Todo alerta tem runbook de resposta documentado antes de ser implementado. `[spec]`

---

## 6. Métricas de sucesso do produto

### Definição de clínica ativada (revisada pela mudança de marco da fase 1 `[Davi 11.19]`)

A barra antiga ("atende um dia inteiro") não é mais o marco de produto — a fase 1 agora promete que a clínica **troca** de sistema. Proposta de ativação alinhada a isso `[inferência, pendente de validação]`:

Uma clínica é **ativada** quando tiver:

1. Concluído a migração dos 4 conjuntos (pacientes, agenda futura, prontuário/histórico, financeiro em aberto — RF-024),
2. Operado **21 dias corridos consecutivos** sem nenhum agendamento criado no sistema antigo (sinal de que trocou de fato, não que está rodando os dois em paralelo),
3. Registrado ao menos 1 aplicação com lote (RF-027) e 1 recebimento (RF-023) nesse período.

*O número "21 dias" é arbitrado por mim, sem dado — serve como proposta inicial de instrumentação, precisa ser confirmado ou substituído depois da clínica piloto.*

### Ativação

- Taxa de ativação (% de clínicas que atingem os 3 critérios acima em até 30 dias do início da migração). Meta numérica: **a definir**, sem dado histórico.
- Tempo médio até completar a migração dos 4 conjuntos — proxy direto da qualidade do importador (RF-024).
- % de importações que terminam sem intervenção manual do time Hello Doctor (mede se "a clínica importa sozinha" `[Davi 11.32]` está de fato funcionando).

### Retenção

- Churn mensal de clínicas ativas.
- Taxa de aderência à cadência de follow-up de orçamento (RF-039) — proxy de quanto o produto está sendo usado como ferramenta comercial, não só operacional.
- Taxa de sessão dentro do intervalo esperado do protocolo (RF-025/026) — mede se o produto está de fato reduzindo evasão por desalinhamento de intervalo.
- Taxa de não comparecimento (no-show) por clínica ao longo do tempo (RF-046) — indicador líder de saúde da clínica antes do cancelamento.

### Expansão

- Upsell de plano por volume de unidades/profissionais.
- Adoção de módulos de fase avançada por clínica já ativa (ex.: % de clínicas na fase 1-2 que adotam funil/comissão da fase 3).
- Adoção de modelo de venda além do pacote fechado (assinatura, crédito pré-pago — RF-042) por clínica, como sinal de maturidade comercial.
- Net Revenue Retention mensal, quando houver base mínima de 20 clínicas pagantes por 2+ meses.

*Todas as metas numéricas de retenção e expansão continuam dependendo da clínica piloto — maior risco do projeto, mantido do spec original. Nenhum número de meta foi inventado aqui.*

---

## 7. Precificação

Benchmark: MedX Care cobra **R$ 250 a R$ 1.500/mês por clínica**; preço público é diferencial competitivo `[benchmark]`. O workshop não tratou de precificação — a proposta abaixo é integralmente `[inferência]`, ajustada para refletir que a fase 3 comercial ficou mais pesada (`[Davi 11.4]`: quatro modelos de venda de uma vez, incluindo assinatura com dunning).

| Plano | Público-alvo | Faixa de preço proposta | Módulos incluídos (por fase) |
|---|---|---|---|
| **Essencial** | 1 unidade, até 3 profissionais | **R$ 250–390/mês** | Fase 0 + Fase 1 completa (mesa de entrada: agenda multi-recurso, ficha, foto, tabela de preços, prescrição rápida, migração self-service) |
| **Profissional** | 1 unidade, 4–10 profissionais, protocolo multi-sessão | **R$ 490–790/mês** | + Fase 2 (protocolo com editor próprio, mapa de aplicação com lote, estoque, antropometria) |
| **Comercial** | 1–2 unidades, funil ativo, vínculo misto (parceiros/aluguel de sala) | **R$ 990–1.390/mês** | + Fase 3 (funil, 4 modelos de venda, comissão como motor de regras, Zaple, NFS-e) — faixa ajustada para cima em relação à v1 deste PRD porque a fase 3 dobrou de escopo `[Davi 11.4]` |
| **Diferenciado** | Multi-unidade, perfis avançados (emagrecimento, aparelho, cirurgia) | **R$ 1.390–1.500+/mês** | + Fase 4 (simulação visual, IA de consulta, Memed/controlados, portal do paciente) + Fase 5 quando disponível (cirurgia) |

### Justificativa

- Teto ancorado no que o mercado já paga pela MedX Care — não competir abaixo do piso, dado o time de uma pessoa.
- A separação por fase mapeia diretamente o roteiro de construção (seção 4), então cada fase entregue vira alavanca comercial imediata.
- **Ajuste desta versão:** subi o piso do plano Comercial porque a seção 11 revelou que a fase 3 não é "funil simples" — são quatro mecânicas financeiras distintas rodando juntas, incluindo assinatura recorrente com falha de cartão/dunning/suspensão `[Davi 11.4]`. Isso é custo operacional real de suportar, não só de construir.
- Setup e repasse de integrações de terceiro (Memed, gateway, NFS-e) seguem fora das faixas, a modelar por fornecedor escolhido em workshop.

**Decisão do dono do produto necessária:** o workshop não validou nenhuma faixa de preço — são todas `[inferência]`. Precisa de conversa de venda real antes de publicar.

---

## 8. Riscos de produto e mitigação

| Risco | Origem | Gravidade | Mitigação |
|---|---|---|---|
| Não existe clínica piloto com dado real | `[spec]` | Alta | Nenhuma meta da seção 6 é confiável sem uso real; conseguir a piloto é tarefa do Davi em paralelo à fase 0 |
| Agenda multi-recurso (RF-014/015) é significativamente mais cara do que "agenda de pessoa" e está na fase 1, não depois | `[Davi 11.8, 11.20]` | Alta | Tratar como o componente mais caro da fase 1 no planejamento de esforço; não subestimar por parecer "só uma agenda" |
| Fase 3 dobra de tamanho pelos 4 modelos de venda simultâneos | `[Davi 11.4]` | Alta | Escopo assumido conscientemente pelo dono; planejar assinatura recorrente (dunning, suspensão, reativação) como sub-projeto dentro da fase, não como item de linha |
| Modelo de visibilidade de paciente (3 modos) mal modelado na fase 0 é irreversível sem reescrita de acesso a dado | `[Davi 11.5]` | Alta | RF-010 obrigatoriamente na fase 0, não depois; nenhuma exceção de cronograma aqui |
| Importador self-service malfeito é pior do que não ter self-service — é o maior risco do onboarding | `[Davi 11.32]` | Alta | Tratar o importador como mini-produto (RF-024), com preview, validação linha a linha, idempotência e relatório — não como uma tela de upload |
| Perfil de clínica (`perfil_clinica`) mal desenhado na fase 0 trava a extensão para perfis futuros ("outros", ainda não mapeados) | `[Davi 11.16]` | Alta | Modelar como configuração desde o início, nunca enum no código; validar extensibilidade tentando adicionar um perfil hipotético como exercício de design antes de codar |
| Vazamento de dado entre clínicas | `[spec]` | Crítica | Suíte de isolamento no CI + acesso só via servidor + RLS |
| Escopo profissional mal modelado | `[spec]` | Alta | Modelado no catálogo desde a fase 0 |
| Precificação lançada sem validação de mercado | `[inferência]` | Média | Testar as faixas da seção 7 com 3–5 conversas de venda reais antes de publicar |
| Definição de "evolução assistida" (RF-051) não fechada trava planejamento da fase 4 | `[Davi 11.15]` | Média | Não iniciar essa funcionalidade antes do workshop de IA definir o escopo |
| Custo de IA por consulta transcrita | `[spec]` | Média | Medir custo real por minuto antes de precificar, fase 4 |
| Dependência de Memed e gateway de pagamento | `[spec]` | Média | Isolar atrás de interface própria |

---

## 9. O que explicitamente NÃO vamos fazer no v1

- **Odontologia clínica** (odontograma, periograma, plano por dente/face). `[spec]`
- **Faturamento de convênio (TISS).** `[spec]`
- **Telemedicina nativa** — só se e quando um cliente pagar por isso. `[spec]`
- **App nativo iOS/Android** — web responsivo/PWA cobre a captura de foto. `[spec]`
- **Multi-idioma e multi-moeda.** `[spec]`
- **Microsserviços, filas próprias, Kubernetes.** `[spec]`
- **Extração estruturada de valor de exame** (faixa de referência, alerta, gráfico) — exame é anexo por tipo + data no v1; estruturar é funcionalidade futura, não migração de dados, porque o anexo já nasce com esses metadados `[Davi 11.17]`.
- **Cirurgia plástica antes da fase 5**, que só começa depois do núcleo validado com clínica real `[Davi 11.18]`.
- **Migração assistida como serviço.** Só self-service por planilha (RF-024); assistida consumiria o tempo do Davi, que é o gargalo do projeto `[Davi 11.32]`.
- **Controle de estado individual do frasco aberto** (reconstituição, saldo remanescente pós-abertura). O saldo é por lote, agregado; a clínica gerencia frasco aberto no olho, como já faz hoje `[Davi 11.28]`. Revisitar se aparecer exigência sanitária real.
- **Plano individual para profissional autônomo sem CNPJ de clínica.** O tenant é sempre uma clínica `[Davi 11.7]`.
- **Definir meta numérica fixa de ativação/retenção/expansão antes da clínica piloto rodar.** Um número arbitrado sem dado é pior do que nenhum número.

---

## 10. Decisões e workshops pendentes do dono do produto

1. **Workshop de IA** — fechar se "evolução assistida" (RF-051) é comparação de série de fotos ou sumarização textual, antes de qualquer build da fase 4 nisso `[Davi 11.15]`.
2. **Workshop de estoque** — definir a política de prazo limite para registro retroativo de aplicação (RF-027); a seção 11 confirma que existe janela, mas não define o número `[Davi seção 4 do spec]`.
3. **Validar as faixas de preço da seção 7** — nenhuma foi testada em conversa de venda real; a subida do plano Comercial por causa do escopo dobrado da fase 3 é hipótese minha, não confirmada com o dono.
4. **Confirmar o SLA de suporte** (RNF-008) — ainda estimativa, não compromisso publicado.
5. **Priorizar a clínica piloto** — segue sendo o risco nº1 do projeto, e agora tem um teste mais duro: ela precisa de fato **trocar** de sistema, não só "usar por um dia" `[Davi 11.19]`.
6. **Mapear os perfis de clínica "outros"** (além dos 4 já identificados) conforme o produto encontrar mercado — a lista é aberta por definição `[Davi 11.16]`.
7. **Validar a definição de "clínica ativada"** (seção 6, incluindo os 21 dias propostos) — é arbitrada por mim, não veio do workshop nem de dado real.
