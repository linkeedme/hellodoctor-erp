import type { Generated, ColumnType } from "kysely";

type Criado = ColumnType<Date, Date | undefined, never>;

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

export interface BancoHelloDoctor {
  clinica: TabelaClinica;
  unidade: TabelaUnidade;
  usuario: TabelaUsuario;
  membro: TabelaMembro;
  profissional: TabelaProfissional;
  papel: TabelaPapel;
  permissao: TabelaPermissao;
}
