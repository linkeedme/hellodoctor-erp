import type { Generated, ColumnType } from "kysely";

type Criado = ColumnType<Date, Date | undefined, never>;

/** Coluna nula sem default no banco: opcional no insert, sempre presente na leitura (pode ser null). */
type Opcional<T> = ColumnType<T | null, T | null | undefined, T | null>;

export interface TabelaClinica {
  id: Generated<string>;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  ativa: Generated<boolean>;
  criado_em: Criado;
  atualizado_em: Criado;
}

export interface TabelaUnidade {
  id: Generated<string>;
  clinica_id: string;
  nome: string;
  endereco: ColumnType<
    Record<string, unknown>,
    Record<string, unknown> | undefined,
    Record<string, unknown>
  >;
  ativa: Generated<boolean>;
  criado_em: Criado;
}

export type ConselhoProfissional = "CRM" | "CRO" | "CRBM" | "COREN" | "CREFITO";
export type VinculoProfissional = "clt" | "pj_parceiro" | "aluguel_sala";

export interface TabelaProfissional {
  id: Generated<string>;
  clinica_id: string;
  membro_id: string;
  conselho: ConselhoProfissional;
  numero_conselho: string;
  uf: string;
  habilitacoes: Generated<string[]>;
  vinculo: VinculoProfissional;
  criado_em: Criado;
}

export interface TabelaUsuario {
  id: Generated<string>;
  nome: string;
  email: string;
  auth_provider_id: string;
  criado_em: Criado;
}

export interface TabelaMembro {
  id: Generated<string>;
  clinica_id: string;
  usuario_id: string;
  papel_id: string;
  ativo: Generated<boolean>;
  criado_em: Criado;
}

export type ModoVisibilidadePaciente = "isolado" | "aberto" | "restrito";

export interface TabelaPoliticaVisibilidadePaciente {
  clinica_id: string;
  modo: Generated<ModoVisibilidadePaciente>;
  atualizado_em: Criado;
}

export interface TabelaPapel {
  id: Generated<string>;
  chave: string;
  nome: string;
  criado_em: Criado;
}

export type OperacaoPermissao = "ver" | "criar" | "editar" | "excluir" | "aprovar";

export interface TabelaPermissao {
  id: Generated<string>;
  papel_id: string;
  modulo: string;
  operacao: OperacaoPermissao;
}

export interface TabelaProcedimentoConselhoAutorizado {
  procedimento_id: string;
  conselho: ConselhoProfissional;
}

export type FinalidadeConsentimento = "tratamento_clinico" | "uso_interno" | "uso_externo_marketing";
export type AncoraConsentimento = "paciente" | "protocolo_instancia" | "atendimento" | "foto";

export interface TabelaTermo {
  id: Generated<string>;
  clinica_id: string;
  finalidade: FinalidadeConsentimento;
  nome: string;
  criado_em: Criado;
}

export interface TabelaTermoVersao {
  id: Generated<string>;
  termo_id: string;
  texto: string;
  hash_conteudo: string;
  vigente_desde: Criado;
  vigente_ate: Opcional<Date>;
  criado_em: Criado;
}

export interface TabelaConsentimento {
  id: Generated<string>;
  clinica_id: string;
  paciente_id: string;
  finalidade: FinalidadeConsentimento;
  ancora_tipo: AncoraConsentimento;
  ancora_id: string;
  termo_versao_id: string;
  assinado_em: Criado;
  evidencia: ColumnType<
    Record<string, unknown>,
    Record<string, unknown> | undefined,
    Record<string, unknown>
  >;
  revogado_em: Opcional<Date>;
  criado_em: Criado;
}

export interface TabelaEventoAuditoria {
  id: Generated<string>;
  clinica_id: string;
  usuario_id: Opcional<string>;
  acao: string;
  entidade: string;
  entidade_id: Opcional<string>;
  valor_antes: Opcional<Record<string, unknown>>;
  valor_depois: Opcional<Record<string, unknown>>;
  ip: Opcional<string>;
  request_id: Opcional<string>;
  criado_em: Criado;
}

export interface BancoHelloDoctor {
  clinica: TabelaClinica;
  unidade: TabelaUnidade;
  usuario: TabelaUsuario;
  membro: TabelaMembro;
  profissional: TabelaProfissional;
  politica_visibilidade_paciente: TabelaPoliticaVisibilidadePaciente;
  papel: TabelaPapel;
  permissao: TabelaPermissao;
  procedimento_conselho_autorizado: TabelaProcedimentoConselhoAutorizado;
  termo: TabelaTermo;
  termo_versao: TabelaTermoVersao;
  consentimento: TabelaConsentimento;
  evento_auditoria: TabelaEventoAuditoria;
}
