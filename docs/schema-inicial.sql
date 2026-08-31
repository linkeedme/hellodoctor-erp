-- =============================================================================
-- Hello Doctor — Schema inicial (Fase 0 + Fase 1 APENAS)
-- =============================================================================
-- Fonte: docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md
--        docs/PRD.md (RF-001 a RF-024)
--        docs/modulos-e-funcionalidades.md (módulos ADM, PFL, AGD, PRT, MID,
--          CAT (raso), TPR, PRE (metade barata), MIG (não modelado aqui — ver
--          nota no fim), FIN (raso))
--
-- NÃO modela fases 2-5: sem `protocolo_template`, `protocolo_instancia`,
-- `sessao_planejada`, `aplicacao`, `lote`, `produto`, `orcamento`, `venda`,
-- `saldo_sessao`, `comissao`, `titulo`/`parcela`, `assinatura_recorrente`,
-- `carteira_credito`. Onde uma tabela desta fase precisa referenciar algo que
-- só existirá depois (ex.: consentimento ancorado em protocolo_instancia),
-- a referência é uma associação polimórfica sem FK real — ver seção 6.
--
-- Convenção: nomes de tabela/coluna em português, snake_case (ver
-- docs/estrutura-do-projeto.md, seção "Convenção de nomes no banco").
-- Toda tabela de domínio carrega `clinica_id` (Decisão 2 do spec) e tem RLS
-- ativado. Tabelas de referência de plataforma (sem `clinica_id`) estão
-- marcadas e listadas na seção 9 como isentas da suíte de isolamento.
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. Tipos enumerados
-- =============================================================================

create type vinculo_profissional as enum ('clt', 'pj_parceiro', 'aluguel_sala');

create type modo_visibilidade_paciente as enum ('isolado', 'aberto', 'restrito');

create type estagio_paciente as enum ('lead', 'avaliado', 'em_tratamento', 'inativo');

create type finalidade_consentimento as enum (
  'tratamento_clinico', 'uso_interno', 'uso_externo_marketing'
);

-- Âncora polimórfica do consentimento (seção 11.10 do spec). `protocolo_instancia`
-- é valor válido desde já mesmo sem a tabela existir nesta fase — a âncora não
-- tem FK real (ver seção 6). `procedimento` da seção 11.10 é modelado aqui como
-- `atendimento` (a execução concreta de um procedimento): é o único objeto
-- tipado já existente nesta fase que representa "procedimento específico".
-- Reconciliar com o dono no workshop de consentimento se essa leitura estiver
-- errada — está marcada como inferência, não fato.
create type ancora_consentimento as enum (
  'paciente', 'protocolo_instancia', 'atendimento', 'foto'
);

create type tipo_atendimento as enum ('avaliacao', 'procedimento', 'retorno');

create type status_atendimento as enum (
  'agendado', 'em_andamento', 'concluido', 'cancelado'
);

create type status_agendamento as enum (
  'agendado', 'confirmado', 'atendido', 'faltou', 'cancelado'
);

create type conselho_profissional as enum ('CRM', 'CRO', 'CRBM', 'COREN', 'CREFITO');

create type forma_pagamento as enum (
  'dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto'
);

create type origem_foto as enum ('captura_direta', 'importacao');

create type tipo_preco as enum ('padrao', 'promocional');

create type classificacao_medicamento as enum ('simples', 'controlada');

create type operacao_permissao as enum ('ver', 'criar', 'editar', 'excluir', 'aprovar');

-- =============================================================================
-- 2. Tenancy
-- =============================================================================

create table clinica (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text not null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint clinica_cnpj_formato check (cnpj ~ '^\d{14}$'),
  constraint clinica_cnpj_unico unique (cnpj)
);
comment on table clinica is 'O tenant. RF-012: sempre tem CNPJ — não existe plano individual para profissional autônomo (11.7).';

create table unidade (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  nome text not null,
  endereco jsonb not null default '{}'::jsonb,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

-- =============================================================================
-- 3. Perfil de clínica (PFL — fase 0)
-- =============================================================================
-- perfil_referencia é o catálogo ABERTO de perfis de operação (11.16): novo
-- perfil = INSERT nesta tabela + nas tabelas de conteúdo semente abaixo, nunca
-- um deploy de código. `perfil_clinica` é a composição efetiva de UMA clínica,
-- montada a partir de um ou mais perfis de referência no onboarding e editável
-- depois (PFL-08).

create table perfil_referencia (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
comment on table perfil_referencia is 'Catálogo aberto de perfis de operação (harmonização e injetáveis, emagrecimento, estética com aparelho, cirurgia — fase 5 inativa, outros). Lista extensível sem deploy (RF-009).';

-- Conteúdo semente por perfil de referência, copiado para as tabelas
-- tenant-scoped (ficha_template, procedimento, termo) no onboarding da
-- clínica. Ficam fora do escopo tenant de propósito: são o catálogo que a
-- plataforma mantém, não dado de uma clínica.
create table perfil_referencia_ficha_template (
  id uuid primary key default gen_random_uuid(),
  perfil_referencia_id uuid not null references perfil_referencia (id),
  chave_especialidade text not null,
  nome text not null,
  json_schema jsonb not null,
  criado_em timestamptz not null default now()
);

create table perfil_referencia_procedimento (
  id uuid primary key default gen_random_uuid(),
  perfil_referencia_id uuid not null references perfil_referencia (id),
  nome text not null,
  duracao_minutos integer not null,
  conselhos_autorizados conselho_profissional[] not null,
  recursos_exigidos jsonb not null default '{}'::jsonb,
  requer_prescricao_medica boolean not null default false,
  criado_em timestamptz not null default now()
);

create table perfil_referencia_termo (
  id uuid primary key default gen_random_uuid(),
  perfil_referencia_id uuid not null references perfil_referencia (id),
  finalidade finalidade_consentimento not null,
  nome text not null,
  texto_padrao text not null,
  criado_em timestamptz not null default now()
);

-- A composição efetiva de uma clínica (uma linha por clínica).
create table perfil_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null unique references clinica (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table perfil_clinica_referencia (
  perfil_clinica_id uuid not null references perfil_clinica (id),
  perfil_referencia_id uuid not null references perfil_referencia (id),
  primary key (perfil_clinica_id, perfil_referencia_id)
);
comment on table perfil_clinica_referencia is 'De quais perfis de referência a composição da clínica bebeu — rastreabilidade, não fonte de verdade em runtime (a fonte de verdade é o que foi copiado/ativado).';

create table perfil_clinica_modulo (
  perfil_clinica_id uuid not null references perfil_clinica (id),
  modulo text not null,
  ativo boolean not null default true,
  primary key (perfil_clinica_id, modulo),
  constraint perfil_clinica_modulo_codigo_valido check (
    modulo in ('AGD','PRT','MID','CAT','MAP','ANT','FUN','FIN','PRE','POR','IAC','TPR','MIG','ADM','PFL','CIR')
  )
);
comment on table perfil_clinica_modulo is 'Quais módulos ficam ativos para a clínica — dado, nunca enum/if no código (RF-009).';

create table perfil_clinica_papel (
  perfil_clinica_id uuid not null references perfil_clinica (id),
  papel_id uuid not null, -- FK adicionada após a criação de `papel`, ver seção 4
  ativo boolean not null default true,
  primary key (perfil_clinica_id, papel_id)
);

-- =============================================================================
-- 4. Identidade, RBAC, escopo profissional
-- =============================================================================

create table usuario (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  auth_provider_id text not null unique,
  criado_em timestamptz not null default now()
);
create unique index usuario_email_unico on usuario (lower(email));

-- Catálogo global e fechado de papéis do produto (seção 4.2 do catálogo de
-- módulos). Não é por clínica no v1 — "papéis sugeridos pelo perfil" (PFL-07)
-- é modelado como ativar/desativar um subconjunto deste catálogo fixo via
-- `perfil_clinica_papel`, não como criar papel novo por clínica. Se isso
-- precisar mudar, é decisão de fase 2+, não retrabalho de fase 0.
create table papel (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  criado_em timestamptz not null default now()
);

alter table perfil_clinica_papel
  add constraint perfil_clinica_papel_papel_fk foreign key (papel_id) references papel (id);

create table perfil_referencia_papel (
  perfil_referencia_id uuid not null references perfil_referencia (id),
  papel_id uuid not null references papel (id),
  primary key (perfil_referencia_id, papel_id)
);

create table permissao (
  id uuid primary key default gen_random_uuid(),
  papel_id uuid not null references papel (id),
  modulo text not null,
  operacao operacao_permissao not null,
  constraint permissao_unica unique (papel_id, modulo, operacao)
);
comment on table permissao is 'Grant (papel, módulo, operação). Matriz de dados semeada a partir da seção 4.2 de docs/modulos-e-funcionalidades.md — ver docs/estrutura-do-projeto.md para o script de seed.';

create table membro (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  usuario_id uuid not null references usuario (id),
  papel_id uuid not null references papel (id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint membro_usuario_clinica_unico unique (clinica_id, usuario_id)
);
comment on table membro is 'usuário × clínica, com papel (RF-004). Um usuário pode pertencer a mais de uma clínica.';

create table profissional (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  membro_id uuid not null unique references membro (id),
  conselho conselho_profissional not null,
  numero_conselho text not null,
  uf char(2) not null,
  habilitacoes text[] not null default '{}',
  vinculo vinculo_profissional not null,
  criado_em timestamptz not null default now()
);
comment on table profissional is 'RF-011: vinculo obrigatório (CLT/PJ parceiro/aluguel de sala) — dirige comissão (fase 3), visibilidade de paciente e propriedade de lote (fase 2).';

-- =============================================================================
-- 5. Política de visibilidade de paciente (ADM — fase 0, irreversível depois)
-- =============================================================================

create table politica_visibilidade_paciente (
  clinica_id uuid primary key references clinica (id),
  modo modo_visibilidade_paciente not null default 'aberto',
  atualizado_em timestamptz not null default now()
);
comment on table politica_visibilidade_paciente is 'RF-010 / 11.5. Um modo por clínica. RLS de paciente/prontuário/agenda consulta esta tabela via app.paciente_visivel().';

-- =============================================================================
-- 6. Paciente e consentimento
-- =============================================================================

create table paciente (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  nome text not null,
  cpf text,
  contato jsonb not null default '{}'::jsonb,
  endereco jsonb not null default '{}'::jsonb,
  responsavel_legal jsonb,
  estagio estagio_paciente not null default 'lead',
  origem_captacao text,
  profissional_responsavel_id uuid references profissional (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index paciente_cpf_unico_por_clinica
  on paciente (clinica_id, cpf) where cpf is not null;
comment on table paciente is 'RF-013/RF-023 (11.23): lead e paciente são a mesma entidade. profissional_responsavel_id resolve "de quem é este paciente" nos modos isolado/restrito.';

-- Grant explícito de visibilidade quando o modo é 'isolado' ou 'restrito' e o
-- profissional responsável autoriza outro profissional a ver o paciente.
create table paciente_acesso_autorizado (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  paciente_id uuid not null references paciente (id),
  profissional_id uuid not null references profissional (id),
  autorizado_por uuid not null references usuario (id),
  criado_em timestamptz not null default now(),
  constraint paciente_acesso_unico unique (paciente_id, profissional_id)
);

create table termo (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  finalidade finalidade_consentimento not null,
  nome text not null,
  criado_em timestamptz not null default now()
);

create table termo_versao (
  id uuid primary key default gen_random_uuid(),
  termo_id uuid not null references termo (id),
  texto text not null,
  hash_conteudo text not null,
  vigente_desde timestamptz not null default now(),
  vigente_ate timestamptz,
  criado_em timestamptz not null default now()
);

create table consentimento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  paciente_id uuid not null references paciente (id),
  finalidade finalidade_consentimento not null,
  ancora_tipo ancora_consentimento not null,
  ancora_id uuid not null,
  termo_versao_id uuid not null references termo_versao (id),
  assinado_em timestamptz not null default now(),
  evidencia jsonb not null default '{}'::jsonb,
  revogado_em timestamptz,
  criado_em timestamptz not null default now()
);
comment on table consentimento is 'RF-007/11.10: interseção de finalidade × âncora polimórfica × versão do termo. ancora_id NÃO tem FK de banco (associação polimórfica — validada em app) porque protocolo_instancia (fase 2) ainda não existe.';
create index consentimento_ancora_idx on consentimento (ancora_tipo, ancora_id);

-- =============================================================================
-- 7. Clínico: atendimento, ficha, evolução, exame, medida, foto, pose
-- =============================================================================

create table atendimento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  unidade_id uuid not null references unidade (id),
  paciente_id uuid not null references paciente (id),
  profissional_id uuid not null references profissional (id),
  tipo tipo_atendimento not null,
  status status_atendimento not null default 'agendado',
  agendamento_id uuid, -- FK adicionada após a criação de `agendamento`, ver seção 8
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  criado_em timestamptz not null default now()
);
comment on table atendimento is 'RF-016: a unidade base. sessao_planejada_id NÃO existe nesta fase — é coluna nullable adicionada em migração própria da fase 2, quando protocolo_instancia/sessao_planejada nascerem. Até lá, todo atendimento é avulso por definição de schema, não por regra de aplicação.';

create table ficha_template (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  chave_especialidade text not null,
  nome text not null,
  criado_em timestamptz not null default now()
);

create table ficha_template_versao (
  id uuid primary key default gen_random_uuid(),
  ficha_template_id uuid not null references ficha_template (id),
  versao integer not null,
  json_schema jsonb not null,
  vigente_desde timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  constraint ficha_template_versao_unica unique (ficha_template_id, versao)
);
comment on table ficha_template_versao is 'RF-017. Validação do JSON Schema em si roda no servidor (Zod/Ajv) antes de gravar `ficha.dados` — o CHECK de banco só garante que dados é um objeto (defesa em profundidade, não substitui a validação de schema).';

create table ficha (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  atendimento_id uuid not null unique references atendimento (id),
  ficha_template_versao_id uuid not null references ficha_template_versao (id),
  dados jsonb not null,
  preenchido_por uuid not null references usuario (id),
  preenchido_em timestamptz not null default now(),
  constraint ficha_dados_e_objeto check (jsonb_typeof(dados) = 'object')
);
comment on table ficha is 'Pende da sessão (atendimento) específica, nunca do paciente em geral — regra dura do spec sobre rastreabilidade sanitária.';

create table evolucao (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  atendimento_id uuid not null references atendimento (id),
  texto text not null,
  registrado_por uuid not null references usuario (id),
  criado_em timestamptz not null default now()
);

create table exame_anexo (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  paciente_id uuid not null references paciente (id),
  atendimento_id uuid references atendimento (id),
  tipo_exame text not null,
  data_coleta date not null,
  arquivo_url text not null,
  criado_em timestamptz not null default now()
);
comment on table exame_anexo is 'RF-020/11.17: anexo vinculado a tipo+data, sem valor estruturado no v1. Nasce assim de propósito para não exigir migração quando estruturar depois.';

create table medida (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  paciente_id uuid not null references paciente (id),
  atendimento_id uuid references atendimento (id),
  tipo text not null,
  valor numeric not null,
  unidade text not null,
  medido_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
comment on table medida is 'RF-034 (fase 2 aprofunda, mas a tabela nasce na fase 1 porque ANT-01 é dependência natural do atendimento). Série temporal: uma linha por medição.';

create table pose (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  nome text not null,
  regiao text not null,
  guia_enquadramento jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
comment on table pose is 'Seed padrão (frontal, perfil direito, perfil esquerdo, oblíquo) copiado por clínica no onboarding — poses são universais o bastante para não precisar do mecanismo perfil_referencia_*.';

create table foto (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  paciente_id uuid not null references paciente (id),
  atendimento_id uuid not null references atendimento (id),
  pose_id uuid not null references pose (id),
  arquivo_url text not null,
  origem origem_foto not null,
  capturado_em timestamptz not null default now(),
  metadados_captura jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
comment on table foto is 'RF-019/11.12: capturada ou importada, sempre pareada a paciente+pose. Vinculada ao atendimento, nunca ao paciente em geral.';

-- =============================================================================
-- 8. Catálogo raso e agenda de 3 recursos
-- =============================================================================

create table procedimento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  nome text not null,
  duracao_minutos integer not null,
  requer_prescricao_medica boolean not null default false,
  recursos_exigidos jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
comment on table procedimento is 'CAT-01, cadastro raso da fase 1 — sem insumos_previstos nem preco (preco vive em `preco`, TPR). Insumos previstos e vínculo com protocolo são fase 2.';

create table procedimento_conselho_autorizado (
  procedimento_id uuid not null references procedimento (id),
  conselho conselho_profissional not null,
  primary key (procedimento_id, conselho)
);
comment on table procedimento_conselho_autorizado is 'RF-005: escopo profissional é regra de dado no catálogo, checada por trigger em agendamento (verificar_escopo_profissional) e reforçada no servidor.';

create table sala (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  unidade_id uuid not null references unidade (id),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table equipamento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  unidade_id uuid not null references unidade (id),
  nome text not null,
  tipo text not null,
  criado_em timestamptz not null default now()
);

create table horario_trabalho (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  profissional_id uuid not null references profissional (id),
  unidade_id uuid not null references unidade (id),
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  criado_em timestamptz not null default now(),
  constraint horario_trabalho_intervalo_valido check (hora_fim > hora_inicio)
);

create table bloqueio (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  profissional_id uuid references profissional (id),
  sala_id uuid references sala (id),
  equipamento_id uuid references equipamento (id),
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text,
  criado_em timestamptz not null default now(),
  constraint bloqueio_tem_recurso check (
    profissional_id is not null or sala_id is not null or equipamento_id is not null
  ),
  constraint bloqueio_intervalo_valido check (fim > inicio)
);

create table agendamento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  unidade_id uuid not null references unidade (id),
  paciente_id uuid not null references paciente (id),
  profissional_id uuid not null references profissional (id),
  sala_id uuid references sala (id),
  procedimento_id uuid not null references procedimento (id),
  inicio timestamptz not null,
  fim timestamptz not null,
  status status_agendamento not null default 'agendado',
  criado_por uuid not null references usuario (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint agendamento_intervalo_valido check (fim > inicio)
);
comment on table agendamento is 'RF-014/11.8: reserva profissional + sala + equipamento(s) simultaneamente. Equipamento fica em agendamento_equipamento (M:N — "equipamento(s)" no plural).';

alter table atendimento
  add constraint atendimento_agendamento_fk foreign key (agendamento_id) references agendamento (id);

create table agendamento_equipamento (
  agendamento_id uuid not null references agendamento (id),
  equipamento_id uuid not null references equipamento (id),
  primary key (agendamento_id, equipamento_id)
);

-- Detecção de conflito sobre os três recursos (RF-014/AGD-02) roda no
-- servidor via query de sobreposição de intervalo antes do INSERT (uma
-- constraint de exclusão via btree_gist é a opção natural de banco, mas
-- exige a extensão btree_gist nem sempre disponível no provedor gerenciado
-- — decisão de usar checagem no servidor, com teste de concorrência
-- cobrindo a corrida, fica registrada em docs/estrutura-do-projeto.md).

-- =============================================================================
-- 9. Tabela de preços (TPR — política de 4 eixos)
-- =============================================================================

create table preco (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  procedimento_id uuid not null references procedimento (id),
  profissional_id uuid references profissional (id), -- null = preço padrão da clínica
  unidade_id uuid references unidade (id), -- null = vale para todas as unidades
  valor numeric not null check (valor >= 0),
  tipo tipo_preco not null default 'padrao',
  vigente_desde timestamptz not null default now(),
  vigente_ate timestamptz,
  criado_em timestamptz not null default now(),
  constraint preco_vigencia_valida check (vigente_ate is null or vigente_ate > vigente_desde)
);
comment on table preco is 'RF-021/11.21: vigência por linha. O preço aplicado é congelado em `agendamento`/`atendimento` no momento do uso (a fase 3 formaliza isso em `orcamento`; na fase 1, o congelamento acontece no recebimento — ver `recebimento.valor`).';

create table regra_desconto (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  papel_id uuid not null references papel (id),
  percentual_maximo numeric not null check (percentual_maximo between 0 and 100),
  criado_em timestamptz not null default now(),
  constraint regra_desconto_unica unique (clinica_id, papel_id)
);
comment on table regra_desconto is 'RF-021: limite de desconto por papel (recepção até X%, gestora até Y%, dona sem limite). "Sem limite" é a ausência de linha para o papel.';

-- =============================================================================
-- 10. Prescrição — metade barata (fase 1)
-- =============================================================================

create table medicamento (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  principio_ativo text,
  classificacao classificacao_medicamento not null,
  apresentacao text,
  criado_em timestamptz not null default now()
);
comment on table medicamento is 'PRE-01: base global da plataforma (sem clinica_id — catálogo de referência, não dado de clínica). Fonte de importação a decidir no workshop de prescrição.';

create table medicamento_favorito (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  medicamento_id uuid not null references medicamento (id),
  criado_em timestamptz not null default now(),
  constraint medicamento_favorito_unico unique (clinica_id, medicamento_id)
);

create table modelo_posologia (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  medicamento_id uuid not null references medicamento (id),
  texto_padrao text not null,
  criado_em timestamptz not null default now()
);

create table prescricao (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  atendimento_id uuid not null references atendimento (id),
  profissional_id uuid not null references profissional (id),
  pdf_url text,
  criado_em timestamptz not null default now()
);

create table prescricao_item (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  prescricao_id uuid not null references prescricao (id),
  medicamento_id uuid not null references medicamento (id),
  posologia text not null,
  quantidade text,
  criado_em timestamptz not null default now()
);
comment on table prescricao_item is 'posologia é copiada de modelo_posologia e editável no ato sem alterar o modelo original (RF-022) — não há FK para modelo_posologia aqui, de propósito.';

-- =============================================================================
-- 11. Financeiro raso — recebimento simples (fase 1)
-- =============================================================================

create table recebimento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  atendimento_id uuid not null references atendimento (id),
  valor numeric not null check (valor > 0),
  forma_pagamento forma_pagamento not null,
  recebido_por uuid not null references usuario (id),
  recebido_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
comment on table recebimento is 'RF-023, versão mínima da fase 1: baixa direta sobre o atendimento avulso. titulo/parcela/segregação venda×recebimento (FIN-04) só existem na fase 3, quando `venda` nasce — decisão consciente de não antecipar o motor financeiro completo.';

-- =============================================================================
-- 12. Auditoria imutável (ADM — fase 0)
-- =============================================================================

create table evento_auditoria (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinica (id),
  usuario_id uuid references usuario (id),
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  valor_antes jsonb,
  valor_depois jsonb,
  ip inet,
  request_id uuid,
  criado_em timestamptz not null default now()
);
comment on table evento_auditoria is 'RF-006: append-only. Toda leitura de ficha/evolução/foto gera evento com acao=''leitura'' (11.6/RNF regra de LGPD art. 37). UPDATE/DELETE bloqueados por trigger, não por convenção.';

create or replace function bloquear_alteracao_auditoria() returns trigger as $$
begin
  raise exception 'evento_auditoria é append-only: % não é permitido', tg_op;
end;
$$ language plpgsql;

create trigger trg_evento_auditoria_bloqueia_update
  before update on evento_auditoria
  for each row execute function bloquear_alteracao_auditoria();

create trigger trg_evento_auditoria_bloqueia_delete
  before delete on evento_auditoria
  for each row execute function bloquear_alteracao_auditoria();

-- =============================================================================
-- 13. Escopo profissional — trigger de defesa em profundidade
-- =============================================================================
-- RF-005 é responsabilidade primária do servidor (Server Action recusa antes
-- de tocar o banco). Este trigger é a segunda barreira, igual à filosofia da
-- Decisão 2 do spec para RLS: existe para o dia em que alguém errar no
-- servidor.

create or replace function verificar_escopo_profissional() returns trigger as $$
declare
  v_conselho conselho_profissional;
begin
  select conselho into v_conselho from profissional where id = new.profissional_id;

  if not exists (
    select 1 from procedimento_conselho_autorizado
    where procedimento_id = new.procedimento_id and conselho = v_conselho
  ) then
    raise exception 'Profissional (conselho %) fora do escopo autorizado para o procedimento %',
      v_conselho, new.procedimento_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_agendamento_verifica_escopo
  before insert or update of profissional_id, procedimento_id on agendamento
  for each row execute function verificar_escopo_profissional();

-- =============================================================================
-- 14. Row Level Security
-- =============================================================================
-- Contrato de sessão: todo Server Action/Route Handler abre a conexão dentro
-- de uma transação e roda, antes de qualquer query de domínio:
--   SET LOCAL app.clinica_id = '<clinica_id do claim/membro ativo>';
--   SET LOCAL app.usuario_id = '<usuario_id do claim>';
-- Sem essas duas variáveis de sessão setadas, toda policy abaixo nega acesso
-- (current_setting(..., true) retorna NULL, e NULL = qualquer coisa é NULL,
-- nunca true). Ver docs/estrutura-do-projeto.md para o helper de conexão.

create or replace function app_clinica_id() returns uuid as $$
  select nullif(current_setting('app.clinica_id', true), '')::uuid;
$$ language sql stable;

create or replace function app_usuario_id() returns uuid as $$
  select nullif(current_setting('app.usuario_id', true), '')::uuid;
$$ language sql stable;

-- Resolve visibilidade de paciente conforme a política da clínica (11.5).
-- p_escopo = 'clinico'          -> ficha, evolução, foto, medida, prescrição
-- p_escopo = 'agenda_financeiro' -> agendamento, recebimento
-- Esta função NÃO substitui o RBAC (permissao) — RBAC é checado no servidor
-- antes da query rodar. Esta função resolve só o eixo de isolamento
-- intra-tenant entre profissionais, que é o problema novo da seção 11.5.
create or replace function app_paciente_visivel(p_paciente_id uuid, p_escopo text default 'clinico')
returns boolean as $$
declare
  v_modo modo_visibilidade_paciente;
  v_responsavel_id uuid;
  v_profissional_id uuid;
begin
  select modo into v_modo
  from politica_visibilidade_paciente
  where clinica_id = app_clinica_id();

  if v_modo is null or v_modo = 'aberto' then
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
$$ language plpgsql stable security definer;

-- clinica é o próprio limite de tenant — RLS nela restringe cada clínica a
-- enxergar só a própria linha. INSERT de tenant novo (onboarding) roda numa
-- conexão de serviço com BYPASSRLS, nunca na conexão de request comum — ver
-- docs/estrutura-do-projeto.md, "Conexão de banco: role de request × role de
-- onboarding".
alter table clinica enable row level security;
create policy clinica_isolamento_tenant on clinica for select using (id = app_clinica_id());
create policy clinica_isolamento_tenant_upd on clinica for update
  using (id = app_clinica_id()) with check (id = app_clinica_id());

-- --- Tabelas com política simples (isolamento por clinica_id apenas) -------

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'unidade', 'perfil_clinica', 'membro', 'profissional',
    'politica_visibilidade_paciente', 'paciente_acesso_autorizado',
    'termo', 'consentimento',
    'ficha_template', 'exame_anexo',
    'procedimento', 'sala', 'equipamento', 'horario_trabalho', 'bloqueio',
    'preco', 'regra_desconto',
    'medicamento_favorito', 'modelo_posologia', 'prescricao', 'prescricao_item',
    'evento_auditoria'
  ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_isolamento_tenant on %I for all using (clinica_id = app_clinica_id()) with check (clinica_id = app_clinica_id())',
      t, t
    );
  end loop;
end $$;

-- termo_versao, ficha_template_versao, agendamento_equipamento e
-- procedimento_conselho_autorizado não carregam clinica_id (dependem do pai
-- via FK); RLS neles é uma policy de EXISTS contra o pai.

alter table termo_versao enable row level security;
create policy termo_versao_isolamento_tenant on termo_versao for all
  using (exists (select 1 from termo t where t.id = termo_versao.termo_id and t.clinica_id = app_clinica_id()))
  with check (exists (select 1 from termo t where t.id = termo_versao.termo_id and t.clinica_id = app_clinica_id()));

alter table ficha_template_versao enable row level security;
create policy ficha_template_versao_isolamento_tenant on ficha_template_versao for all
  using (exists (select 1 from ficha_template f where f.id = ficha_template_versao.ficha_template_id and f.clinica_id = app_clinica_id()))
  with check (exists (select 1 from ficha_template f where f.id = ficha_template_versao.ficha_template_id and f.clinica_id = app_clinica_id()));

alter table procedimento_conselho_autorizado enable row level security;
create policy procedimento_conselho_autorizado_isolamento_tenant on procedimento_conselho_autorizado for all
  using (exists (select 1 from procedimento p where p.id = procedimento_conselho_autorizado.procedimento_id and p.clinica_id = app_clinica_id()))
  with check (exists (select 1 from procedimento p where p.id = procedimento_conselho_autorizado.procedimento_id and p.clinica_id = app_clinica_id()));

alter table agendamento_equipamento enable row level security;
create policy agendamento_equipamento_isolamento_tenant on agendamento_equipamento for all
  using (exists (select 1 from agendamento a where a.id = agendamento_equipamento.agendamento_id and a.clinica_id = app_clinica_id()))
  with check (exists (select 1 from agendamento a where a.id = agendamento_equipamento.agendamento_id and a.clinica_id = app_clinica_id()));

alter table perfil_clinica_modulo enable row level security;
create policy perfil_clinica_modulo_isolamento_tenant on perfil_clinica_modulo for all
  using (exists (select 1 from perfil_clinica pc where pc.id = perfil_clinica_modulo.perfil_clinica_id and pc.clinica_id = app_clinica_id()))
  with check (exists (select 1 from perfil_clinica pc where pc.id = perfil_clinica_modulo.perfil_clinica_id and pc.clinica_id = app_clinica_id()));

alter table perfil_clinica_papel enable row level security;
create policy perfil_clinica_papel_isolamento_tenant on perfil_clinica_papel for all
  using (exists (select 1 from perfil_clinica pc where pc.id = perfil_clinica_papel.perfil_clinica_id and pc.clinica_id = app_clinica_id()))
  with check (exists (select 1 from perfil_clinica pc where pc.id = perfil_clinica_papel.perfil_clinica_id and pc.clinica_id = app_clinica_id()));

alter table perfil_clinica_referencia enable row level security;
create policy perfil_clinica_referencia_isolamento_tenant on perfil_clinica_referencia for all
  using (exists (select 1 from perfil_clinica pc where pc.id = perfil_clinica_referencia.perfil_clinica_id and pc.clinica_id = app_clinica_id()))
  with check (exists (select 1 from perfil_clinica pc where pc.id = perfil_clinica_referencia.perfil_clinica_id and pc.clinica_id = app_clinica_id()));

-- --- Tabelas com política dupla (clinica_id + visibilidade de paciente) ----

alter table paciente enable row level security;
create policy paciente_isolamento_tenant on paciente for all
  using (clinica_id = app_clinica_id() and app_paciente_visivel(id, 'clinico'))
  with check (clinica_id = app_clinica_id());

alter table atendimento enable row level security;
create policy atendimento_isolamento_tenant on atendimento for all
  using (clinica_id = app_clinica_id() and app_paciente_visivel(paciente_id, 'clinico'))
  with check (clinica_id = app_clinica_id());

alter table ficha enable row level security;
create policy ficha_isolamento_tenant on ficha for all
  using (clinica_id = app_clinica_id() and app_paciente_visivel(
    (select paciente_id from atendimento where atendimento.id = ficha.atendimento_id), 'clinico'
  ))
  with check (clinica_id = app_clinica_id());

alter table evolucao enable row level security;
create policy evolucao_isolamento_tenant on evolucao for all
  using (clinica_id = app_clinica_id() and app_paciente_visivel(
    (select paciente_id from atendimento where atendimento.id = evolucao.atendimento_id), 'clinico'
  ))
  with check (clinica_id = app_clinica_id());

alter table medida enable row level security;
create policy medida_isolamento_tenant on medida for all
  using (clinica_id = app_clinica_id() and app_paciente_visivel(paciente_id, 'clinico'))
  with check (clinica_id = app_clinica_id());

alter table foto enable row level security;
create policy foto_isolamento_tenant on foto for all
  using (clinica_id = app_clinica_id() and app_paciente_visivel(paciente_id, 'clinico'))
  with check (clinica_id = app_clinica_id());

alter table pose enable row level security;
create policy pose_isolamento_tenant on pose for all
  using (clinica_id = app_clinica_id())
  with check (clinica_id = app_clinica_id());

alter table agendamento enable row level security;
create policy agendamento_isolamento_tenant on agendamento for all
  using (clinica_id = app_clinica_id() and app_paciente_visivel(paciente_id, 'agenda_financeiro'))
  with check (clinica_id = app_clinica_id());

alter table recebimento enable row level security;
create policy recebimento_isolamento_tenant on recebimento for all
  using (clinica_id = app_clinica_id() and app_paciente_visivel(
    (select paciente_id from atendimento where atendimento.id = recebimento.atendimento_id), 'agenda_financeiro'
  ))
  with check (clinica_id = app_clinica_id());

-- =============================================================================
-- 15. Tabelas globais de plataforma — sem clinica_id, sem RLS de tenant
-- =============================================================================
-- Isentas da suíte de isolamento por não serem dado de clínica. Esta lista é
-- a fonte de verdade que o script de CI (ver docs/estrutura-do-projeto.md,
-- "Suíte de isolamento de tenant") usa para decidir se uma tabela nova
-- precisa de teste de isolamento ou está legitimamente aqui:
--
--   perfil_referencia, perfil_referencia_ficha_template,
--   perfil_referencia_procedimento, perfil_referencia_termo,
--   perfil_referencia_papel, papel, permissao, medicamento, usuario
--
-- `usuario` é a única tabela de identidade sem clinica_id (uma pessoa pode
-- pertencer a mais de uma clínica — 11.1/spec seção 4); o vínculo com o
-- tenant vive em `membro`, que tem RLS normal.

-- =============================================================================
-- Fim do schema inicial (fases 0-1).
--
-- NÃO incluídas de propósito, mesmo sendo mencionadas em requisitos da fase 1:
-- - Tabelas de suporte ao Migração/Importador (`importacao_lote`,
--   `importacao_erro`): são infraestrutura de uma funcionalidade de produto
--   (MIG), não núcleo de domínio clínico — nascem na tarefa própria de MIG no
--   plano de construção, não neste schema.
-- - `sessao_planejada_id` em `atendimento`: chega via migração da fase 2,
--   junto com `protocolo_template`/`protocolo_instancia`.
-- =============================================================================
