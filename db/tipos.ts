import type { Generated, ColumnType } from "kysely";

type Criado = ColumnType<Date, Date | undefined, never>;

export interface TabelaClinica {
  id: Generated<string>;
  razao_social: string;
  cnpj: string;
  ativa: Generated<boolean>;
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

export interface BancoHelloDoctor {
  clinica: TabelaClinica;
  usuario: TabelaUsuario;
  membro: TabelaMembro;
  papel: TabelaPapel;
}
