const MODULOS_PROIBIDOS = [/^@\/db\//, /^kysely$/, /^pg$/];

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
    const primeiro = codigo.ast.body[0];
    const ehClientComponent =
      primeiro?.type === "ExpressionStatement" &&
      primeiro.expression?.type === "Literal" &&
      primeiro.expression.value === "use client";

    if (!ehClientComponent) return {};

    return {
      ImportDeclaration(node) {
        const fonte = node.source.value;
        if (typeof fonte !== "string") return;
        if (MODULOS_PROIBIDOS.some((p) => p.test(fonte))) {
          context.report({ node, messageId: "proibido", data: { fonte } });
        }
      },
    };
  },
};
