/**
 * Motor de sanitização recursiva compartilhado por `logger.ts` e
 * `sentry.ts` (RNF-013, RNF-021). Existe como módulo próprio, fora dos dois
 * arquivos previstos no brief, porque as duas regras dependem exatamente da
 * mesma lista de campos proibidos e da mesma varredura recursiva — manter
 * duas cópias criaria a chance real de uma divergir da outra e vazar dado
 * de paciente por um caminho enquanto o outro está protegido.
 *
 * Não toca sessão nem banco — é transformação pura de dados, por isso não
 * carrega `import "server-only"`.
 */

/** Campos de paciente que nunca saem para log ou Sentry, em qualquer profundidade. */
export const CAMPOS_PROIBIDOS_PACIENTE = ["nome", "cpf", "contato", "dados", "texto"] as const;

const conjuntoCamposProibidos = new Set<string>(CAMPOS_PROIBIDOS_PACIENTE);

const VALOR_REMOVIDO = "[removido]";
const VALOR_CIRCULAR = "[circular]";

/**
 * Remove campos proibidos de qualquer estrutura: objeto aninhado em
 * qualquer profundidade, array de objetos, e o `Error` (cuja mensagem pode
 * carregar texto livre com dado de paciente — ver `sanitizarErro`).
 *
 * A comparação de chave é case-insensitive (`Nome`, `CPF` também caem).
 * Referências circulares são cortadas com `[circular]` em vez de estourar
 * a pilha.
 */
export function removerCamposProibidos(valor: unknown, vistos: WeakSet<object> = new WeakSet()): unknown {
  if (valor instanceof Error) {
    return sanitizarErro(valor, vistos);
  }

  if (Array.isArray(valor)) {
    if (vistos.has(valor)) return VALOR_CIRCULAR;
    vistos.add(valor);
    return valor.map((item) => removerCamposProibidos(item, vistos));
  }

  if (valor !== null && typeof valor === "object") {
    if (vistos.has(valor)) return VALOR_CIRCULAR;
    vistos.add(valor);
    const resultado: Record<string, unknown> = {};
    for (const [chave, valorCampo] of Object.entries(valor as Record<string, unknown>)) {
      resultado[chave] = conjuntoCamposProibidos.has(chave.toLowerCase())
        ? VALOR_REMOVIDO
        : removerCamposProibidos(valorCampo, vistos);
    }
    return resultado;
  }

  return valor;
}

/**
 * `Error.prototype.stack` no V8 começa com `"NomeDoErro: mensagem"` — a
 * própria mensagem que estamos tentando não vazar. Sanitizar texto livre
 * por regex não é confiável (não existe forma de garantir que "Maria
 * Silva, CPF 123..." seja reconhecido em toda formatação possível), então
 * a mensagem crua nunca sai daqui: nem em `message`, nem embutida na
 * primeira linha do stack. O que sai é o nome do erro, o restante do stack
 * (só caminhos de arquivo/linha, sem argumentos) e, se existir, um código
 * de erro curto e estruturado (`code`/`codigo`) — esses são identificadores
 * de baixa cardinalidade, não texto livre.
 */
function sanitizarErro(erro: Error, vistos: WeakSet<object>): unknown {
  if (vistos.has(erro)) return VALOR_CIRCULAR;
  vistos.add(erro);

  const linhasStack = erro.stack?.split("\n") ?? [];
  const stackSemMensagem = linhasStack.length > 1 ? linhasStack.slice(1).join("\n") : undefined;

  const resultado: Record<string, unknown> = { tipoErro: erro.name };
  if (stackSemMensagem !== undefined) resultado.stack = stackSemMensagem;

  const propriedadesExtras: Record<string, unknown> = {};
  for (const chave of Object.keys(erro)) {
    if (chave === "message" || chave === "stack") continue;
    propriedadesExtras[chave] = removerCamposProibidos(
      (erro as unknown as Record<string, unknown>)[chave],
      vistos,
    );
  }
  if (Object.keys(propriedadesExtras).length > 0) {
    resultado.extra = propriedadesExtras;
  }

  return resultado;
}
