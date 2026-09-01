import { ESLint } from "eslint";

// API do Node em vez de spawnar `npx eslint` por chamada: o cold-start de um
// processo novo (npx + resolução de node_modules + parse do flat config) é
// caro, e virou contenção real quando várias suítes de tests/lint/ passaram
// a rodar isso em paralelo — timeouts intermitentes por CPU, não por bug.
// Uma instância de ESLint por arquivo de teste, reutilizada entre chamadas,
// resolve o mesmo eslint.config.mjs que a CLI resolveria.
let instancia: ESLint | undefined;

function obterInstancia(): ESLint {
  instancia ??= new ESLint();
  return instancia;
}

export async function lintarArquivo(
  caminho: string,
): Promise<{ saiuComErro: boolean; saida: string }> {
  const resultados = await obterInstancia().lintFiles([caminho]);
  const mensagens = resultados.flatMap((r) => r.messages);
  const saiuComErro = resultados.some((r) => r.errorCount > 0);
  const saida = mensagens.map((m) => `${m.ruleId ?? ""}: ${m.message}`).join("\n");
  return { saiuComErro, saida };
}
