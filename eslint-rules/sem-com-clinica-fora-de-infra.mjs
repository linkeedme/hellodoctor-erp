import path from "node:path";

const RAIZES_PERMITIDAS = ["db", "scripts", "tests"];

/**
 * `comClinica` (db/client.ts) recebe `{clinicaId, usuarioId}` como dois
 * textos soltos — nada no compilador impede um call-site de montar esse par
 * a partir de formData, query string, ou de duas sessões diferentes.
 * `comClinicaDaSessao` existe para fechar essa lacuna; esta regra impede que
 * alguém contorne o helper chamando `comClinica` direto fora de onde isso é
 * legítimo (migração, seed, script, teste).
 *
 * `tests/lint/fixtures` é a exceção dentro de `tests/`: os arquivos ali
 * simulam código de produção para exercitar esta própria regra, não são
 * teste de verdade — se contassem como `tests/`, nenhuma fixture violadora
 * seria capaz de disparar o erro.
 */
export function ehArquivoDeInfra(nomeArquivo) {
  const relativo = path.relative(process.cwd(), nomeArquivo).split(path.sep).join("/");
  if (relativo.startsWith("tests/lint/fixtures/")) return false;
  return RAIZES_PERMITIDAS.some(
    (raiz) => relativo === raiz || relativo.startsWith(`${raiz}/`),
  );
}

function ehFonteDoClient(fonte) {
  if (typeof fonte !== "string") return false;
  if (!/^(?:@\/|\.{1,2}\/)/.test(fonte)) return false;
  return /(?:^|\/)db\/client$/.test(fonte);
}

function importaComClinicaNomeado(especificadores) {
  return (especificadores ?? []).some((s) => {
    if (s.type === "ImportSpecifier") return s.imported?.name === "comClinica";
    if (s.type === "ExportSpecifier") return s.local?.name === "comClinica";
    return false;
  });
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Proíbe importar comClinica fora de db/, scripts/ e tests/ — use comClinicaDaSessao",
    },
    messages: {
      proibido:
        "'comClinica' é reservado para db/, scripts/ e tests/. Numa Server Action, use comClinicaDaSessao (db/com-sessao.ts) — ela monta {clinicaId, usuarioId} a partir da sessão autenticada, sem depender de dado vindo do chamador.",
    },
    schema: [],
  },
  create(context) {
    const nomeArquivo = context.filename ?? context.getFilename();
    if (ehArquivoDeInfra(nomeArquivo)) return {};

    return {
      ImportDeclaration(node) {
        if (ehFonteDoClient(node.source.value) && importaComClinicaNomeado(node.specifiers)) {
          context.report({ node, messageId: "proibido" });
        }
      },
      ImportExpression(node) {
        if (node.source.type === "Literal" && ehFonteDoClient(node.source.value)) {
          context.report({ node, messageId: "proibido" });
        }
      },
      ExportNamedDeclaration(node) {
        if (
          node.source &&
          ehFonteDoClient(node.source.value) &&
          importaComClinicaNomeado(node.specifiers)
        ) {
          context.report({ node, messageId: "proibido" });
        }
      },
      ExportAllDeclaration(node) {
        if (node.source && ehFonteDoClient(node.source.value)) {
          context.report({ node, messageId: "proibido" });
        }
      },
    };
  },
};
