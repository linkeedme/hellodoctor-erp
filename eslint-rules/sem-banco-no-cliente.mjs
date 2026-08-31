export function ehModuloProibido(fonte) {
  if (typeof fonte !== "string") return false;
  if (fonte === "kysely" || fonte === "pg") return true;
  // só caminhos do próprio projeto: alias @/ ou relativo ./ ../
  if (!/^(?:@\/|\.{1,2}\/)/.test(fonte)) return false;
  // qualquer profundidade sob um diretório db/
  return /(?:^|\/)db(?:\/|$)/.test(fonte);
}

function reportarSeProibido(context, node, fonte) {
  if (ehModuloProibido(fonte)) {
    context.report({ node, messageId: "proibido", data: { fonte } });
  }
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Proíbe importar cliente de banco em componente client (RF-002: acesso a dado só pelo servidor)",
    },
    messages: {
      proibido:
        "Acesso a dado só pelo servidor (RF-002). '{{fonte}}' não pode ser importado em arquivo com \"use client\". Mova a leitura para uma Server Action em modules/<modulo>/actions.ts.",
    },
    schema: [],
  },
  create(context) {
    const codigo = context.sourceCode ?? context.getSourceCode();
    const prologo = [];
    for (const declaracao of codigo.ast.body) {
      if (
        declaracao.type === "ExpressionStatement" &&
        declaracao.expression?.type === "Literal" &&
        typeof declaracao.expression.value === "string"
      ) {
        prologo.push(declaracao.expression.value);
      } else {
        break;
      }
    }
    const ehClientComponent = prologo.includes("use client");

    if (!ehClientComponent) return {};

    return {
      ImportDeclaration(node) {
        reportarSeProibido(context, node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") {
          reportarSeProibido(context, node, node.source.value);
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          reportarSeProibido(context, node, node.source.value);
        }
      },
      ExportAllDeclaration(node) {
        if (node.source) {
          reportarSeProibido(context, node, node.source.value);
        }
      },
    };
  },
};
