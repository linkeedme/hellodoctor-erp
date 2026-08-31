import "server-only";
import { exigirSessao, type SessaoAtiva } from "@/lib/auth/sessao";
import { podeNaMatriz, type Modulo, type Operacao } from "./matriz";

export class PermissaoNegada extends Error {
  constructor(
    readonly papel: string,
    readonly modulo: Modulo,
    readonly operacao: Operacao,
  ) {
    super(`Papel '${papel}' não pode '${operacao}' no módulo '${modulo}'`);
    this.name = "PermissaoNegada";
  }
}

/**
 * Verifica a permissão ANTES de qualquer query — RF-004: a ação sem permissão
 * é recusada no servidor antes de tocar o banco, não apenas escondida na UI.
 *
 * A fonte da verdade é a matriz em código, não a tabela: a tabela existe para
 * consulta e auditoria, e é semeada a partir da mesma matriz. Assim uma linha
 * apagada por engano no banco não concede acesso.
 */
export async function exigirPermissao(
  modulo: Modulo,
  operacao: Operacao,
): Promise<SessaoAtiva> {
  const sessao = await exigirSessao();
  if (!podeNaMatriz(sessao.papelChave, modulo, operacao)) {
    throw new PermissaoNegada(sessao.papelChave, modulo, operacao);
  }
  return sessao;
}
