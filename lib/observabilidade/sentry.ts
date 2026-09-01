import { removerCamposProibidos } from "./campos-proibidos";

/**
 * RNF-013: o payload de erro que sai para o Sentry nunca contém dado de
 * paciente — só identificadores (`clinica_id`, `usuario_id`, `request_id`)
 * e o que sobrar depois desta sanitização. Varre recursivamente objetos,
 * arrays e `Error` (ver `removerCamposProibidos` em `./campos-proibidos`
 * para o porquê da mensagem do erro nunca sair crua).
 */
export function sanitizarParaSentry(dados: unknown): unknown {
  return removerCamposProibidos(dados);
}
