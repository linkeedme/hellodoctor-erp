const MODULOS_PROIBIDOS = [
  /(?:^|\/)db\/[^/]+$/, // @/db/client, ../db/client, ../../db/onboarding
  /^kysely$/,
  /^pg$/,
];

function ehModuloProibido(fonte) {
  return typeof fonte === "string" && MODULOS_PROIBIDOS.some((p) => p.test(fonte));
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
