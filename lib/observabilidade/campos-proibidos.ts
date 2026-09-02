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

/**
 * Campos de paciente que nunca saem para log ou Sentry, em qualquer
 * profundidade. Fonte: `docs/schema-inicial.sql`.
 *
 * - `nome`, `cpf`, `contato` — identificação direta (`paciente`).
 * - `dados` — corpo livre de `ficha` (jsonb).
 * - `texto` — corpo livre de `evolucao`.
 * - `endereco` — `paciente.endereco` (jsonb). Também existe em
 *   `unidade.endereco` (endereço da clínica, não é dado de paciente) — mas
 *   o sanitizador não conhece a tabela de origem de um payload solto, só o
 *   nome da chave. Redigir o endereço de uma unidade por engano é um
 *   custo aceitável; deixar vazar o de um paciente não é. Erra para o
 *   lado seguro, mesmo padrão já usado para referência circular.
 * - `responsavel_legal` — `paciente.responsavel_legal` (jsonb),
 *   frequentemente dado de um menor de idade.
 * - `evidencia` — `consentimento.evidencia` (jsonb), pode carregar
 *   assinatura e IP do titular.
 * - `posologia` — `prescricao_item.posologia`, instrução de dosagem
 *   (dado de saúde).
 * - `medida`, `medidas` — ver nota abaixo sobre `medida.valor` vs.
 *   `recebimento.valor`: bloqueamos o contêiner, não o campo genérico.
 *
 * **Por que `"valor"` NÃO está nesta lista, mesmo `medida.valor` sendo
 * dado de saúde (medida corporal):** `valor` também é `recebimento.valor`
 * (dinheiro) e `preco.valor` (tabela de preço) — nenhum dos dois é dado de
 * paciente. Bloquear a chave genérica `"valor"` redigiria todo log
 * financeiro da aplicação para proteger um caso específico; é uma
 * comparação ruim demais para valer a pena (o sanitizador casa por nome de
 * chave, sem saber de qual tabela aquele objeto veio). A defesa aqui é
 * bloquear o contêiner (`"medida"`/`"medidas"`) inteiro — cobre o call site
 * idiomático desta base, que loga a entidade pelo nome do domínio (ex.:
 * `log.erro("falha ao registrar medida", erro, { medida })`, no mesmo
 * espírito de `registrarEvento`, que já nomeia a entidade em português).
 * O que isso NÃO cobre: um call site que decompõe a medida e loga
 * `{ valor: 72, unidade: "cm" }` solto, sem a chave `medida` por perto —
 * nesse caso o sanitizador não tem como distinguir de um valor financeiro
 * pelo nome sozinho. Isso é uma convenção de chamada (nomear a entidade
 * clínica pelo nome do domínio ao logar), não um mecanismo garantido pelo
 * compilador — registrado aqui para quem escrever esse call site depois.
 */
export const CAMPOS_PROIBIDOS_PACIENTE = [
  "nome",
  "cpf",
  "contato",
  "dados",
  "texto",
  "endereco",
  "responsavel_legal",
  "evidencia",
  "posologia",
  "medida",
  "medidas",
] as const;

const conjuntoCamposProibidos = new Set<string>(CAMPOS_PROIBIDOS_PACIENTE);

const VALOR_REMOVIDO = "[removido]";
const VALOR_CIRCULAR = "[circular]";
const VALOR_PROFUNDO_DEMAIS = "[profundo demais]";

/**
 * Limite de recursão. `ficha.dados`/`evolucao.texto` são `jsonb` de entrada
 * do cliente — nada impede um payload artificialmente aninhado a dezenas
 * de milhares de níveis, e recursão sem limite estoura a pilha
 * (`RangeError`) antes de qualquer coisa ser sanitizada. 20 níveis é bem
 * mais do que qualquer estrutura de domínio legítima desta base precisa.
 */
const PROFUNDIDADE_MAXIMA = 20;

/**
 * Remove campos proibidos de qualquer estrutura: objeto aninhado em
 * qualquer profundidade (até `PROFUNDIDADE_MAXIMA`), array de objetos, e o
 * `Error` (cuja mensagem pode carregar texto livre com dado de paciente —
 * ver `sanitizarErro`).
 *
 * A comparação de chave é case-insensitive (`Nome`, `CPF` também caem).
 * Referências circulares são cortadas com `[circular]` em vez de estourar
 * a pilha — `vistos` marca só a cadeia de ancestrais ainda em processamento
 * (removido ao final de cada nó via `vistos.delete`), não every objeto já
 * visto; sem isso, `{a: x, b: x}` com o mesmo objeto em duas chaves
 * (sem ciclo nenhum) marcaria a segunda ocorrência como `[circular]` por
 * engano.
 */
export function removerCamposProibidos(
  valor: unknown,
  vistos: WeakSet<object> = new WeakSet(),
  profundidade = 0,
): unknown {
  if (profundidade > PROFUNDIDADE_MAXIMA) return VALOR_PROFUNDO_DEMAIS;

  if (valor instanceof Error) {
    return sanitizarErro(valor, vistos, profundidade);
  }

  if (Array.isArray(valor)) {
    if (vistos.has(valor)) return VALOR_CIRCULAR;
    vistos.add(valor);
    const resultado = valor.map((item) => removerCamposProibidos(item, vistos, profundidade + 1));
    vistos.delete(valor);
    return resultado;
  }

  if (valor !== null && typeof valor === "object") {
    if (vistos.has(valor)) return VALOR_CIRCULAR;
    vistos.add(valor);
    const resultado: Record<string, unknown> = {};
    for (const [chave, valorCampo] of Object.entries(valor as Record<string, unknown>)) {
      resultado[chave] = conjuntoCamposProibidos.has(chave.toLowerCase())
        ? VALOR_REMOVIDO
        : removerCamposProibidos(valorCampo, vistos, profundidade + 1);
    }
    vistos.delete(valor);
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
 * (só caminhos de arquivo/linha, sem argumentos) e, se existir, o que
 * sobrar das propriedades próprias do erro — sanitizado pelo MESMO caminho
 * de código do branch de objeto genérico (chave contra a lista, depois
 * recursão), não uma segunda cópia da decisão que poderia divergir dela.
 *
 * Isso importa nesta base porque `PermissaoNegada` (lib/autorizacao/
 * verificar.ts) já usa parameter properties (`readonly papel/modulo/
 * operacao`), que viram propriedades próprias enumeráveis do erro — e
 * qualquer `ErroPacienteDuplicado`/`ErroConsentimentoAusente` que siga o
 * mesmo idioma pode carregar `nome`/`cpf` do jeito mais direto possível:
 * como propriedade do próprio objeto de erro, não só dentro da mensagem.
 */
function sanitizarErro(erro: Error, vistos: WeakSet<object>, profundidade: number): unknown {
  if (vistos.has(erro)) return VALOR_CIRCULAR;
  vistos.add(erro);

  const linhasStack = erro.stack?.split("\n") ?? [];
  const stackSemMensagem = linhasStack.length > 1 ? linhasStack.slice(1).join("\n") : undefined;

  const resultado: Record<string, unknown> = { tipoErro: erro.name };
  if (stackSemMensagem !== undefined) resultado.stack = stackSemMensagem;

  // `message` e `stack` não aparecem aqui: no V8 são propriedades próprias
  // não enumeráveis, `Object.keys` nunca as retorna.
  const propriedadesProprias: Record<string, unknown> = {};
  for (const chave of Object.keys(erro)) {
    propriedadesProprias[chave] = (erro as unknown as Record<string, unknown>)[chave];
  }
  if (Object.keys(propriedadesProprias).length > 0) {
    // Objeto novo (não é `erro`), por isso não colide com o `vistos.add(erro)`
    // acima — reaproveita o branch de objeto genérico de
    // `removerCamposProibidos`, que já faz chave-antes-de-recursão.
    resultado.extra = removerCamposProibidos(propriedadesProprias, vistos, profundidade + 1);
  }

  vistos.delete(erro);
  return resultado;
}
