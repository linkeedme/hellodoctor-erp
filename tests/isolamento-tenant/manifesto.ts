/**
 * Manifesto de isolamento de tenant (RNF-012).
 *
 * Toda tabela do schema `public` precisa estar em uma destas duas listas.
 * `tests/isolamento-tenant/cobertura.test.ts` lê `information_schema`/
 * `pg_catalog` do banco recém-migrado e falha, nomeando a tabela, se ela não
 * estiver em nenhuma das duas — e falha de novo se uma tabela da lista de
 * domínio não tiver RLS habilitado com ao menos uma policy. Era convenção em
 * `docs/estrutura-do-projeto.md`; aqui vira mecanismo.
 *
 * Fonte: db/migrations/0001_fase0_fase1_baseline.sql, seção 15.
 */

/** Tabelas de domínio — carregam `clinica_id`, exigem RLS + policy de isolamento. */
export const TABELAS_DOMINIO = [
  "agendamento",
  "agendamento_equipamento",
  "atendimento",
  "bloqueio",
  "clinica",
  "consentimento",
  "equipamento",
  "evento_auditoria",
  "evolucao",
  "exame_anexo",
  "ficha",
  "ficha_template",
  "ficha_template_versao",
  "foto",
  "horario_trabalho",
  "medicamento_favorito",
  "medida",
  "membro",
  "modelo_posologia",
  "paciente",
  "paciente_acesso_autorizado",
  "perfil_clinica",
  "perfil_clinica_modulo",
  "perfil_clinica_papel",
  "perfil_clinica_referencia",
  "politica_visibilidade_paciente",
  "pose",
  "preco",
  "prescricao",
  "prescricao_item",
  "procedimento",
  "procedimento_conselho_autorizado",
  "profissional",
  "recebimento",
  "regra_desconto",
  "sala",
  "termo",
  "termo_versao",
  "unidade",
] as const;

/**
 * Allowlist de tabelas de plataforma — sem `clinica_id`, isentas da suíte de
 * isolamento por não serem dado de clínica (as 9 da seção 15 do schema mais
 * `migracao_aplicada`, que nasce em scripts/db-migrate.ts e é infraestrutura
 * de migração, não dado de tenant nenhum).
 */
export const TABELAS_PLATAFORMA = [
  "medicamento",
  "migracao_aplicada",
  "papel",
  "perfil_referencia",
  "perfil_referencia_ficha_template",
  "perfil_referencia_papel",
  "perfil_referencia_procedimento",
  "perfil_referencia_termo",
  "permissao",
  "usuario",
] as const;
