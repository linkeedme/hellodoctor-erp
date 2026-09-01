import path from "node:path";

const RAIZES_PERMITIDAS = ["db", "scripts", "tests"];

/**
 * Duas conexões de banco são privilegiadas de propósito e não devem ser
 * chamadas direto fora de infra:
 *
 * - `comClinica` (db/client.ts) recebe `{clinicaId, usuarioId}` como dois
 *   textos soltos — nada no compilador impede um call-site de montar esse
 *   par a partir de formData, query string, ou de duas sessões diferentes.
 *   `comClinicaDaSessao` existe para fechar essa lacuna.
 * - `comServico` (db/onboarding.ts) é a conexão com BYPASSRLS: não filtra
 *   por tenant nenhum, nem monta app.clinica_id. Ler `clinica`/`paciente`/
 *   qualquer tabela por ela devolve as linhas de TODOS os tenants. É mais
 *   perigosa que `comClinica` — que ao menos passa pelo RLS.
 *
 * Esta regra impede que alguém contorne os dois fora de onde isso é
 * legítimo (migração, seed, script, teste, e — só para `comServico` — a
 * criação de tenant em modules/adm/onboarding.ts, ver ALVOS abaixo).
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

function caminhoRelativo(nomeArquivo) {
  return path.relative(process.cwd(), nomeArquivo).split(path.sep).join("/");
}

function ehFonteDoModulo(fonte, modulo) {
  if (typeof fonte !== "string") return false;
  if (!/^(?:@\/|\.{1,2}\/)/.test(fonte)) return false;
  return new RegExp(`(?:^|/)${modulo}$`).test(fonte);
}

function importaSimboloNomeado(especificadores, simbolo) {
  return (especificadores ?? []).some((s) => {
    if (s.type === "ImportSpecifier") return s.imported?.name === simbolo;
    if (s.type === "ExportSpecifier") return s.local?.name === simbolo;
    return false;
  });
}

// `import * as x from "..."` não tem especificador nomeado — não tem como
// inspecionar se `x.<simbolo>` é de fato usado sem seguir o grafo de uso.
// Mais conservador (e correto, no espírito do resto da regra): barrar o
// namespace inteiro fora de infra, porque importar `db/client` ou
// `db/onboarding` por completo ali não tem uso legítimo.
function importaNamespace(especificadores) {
  return (especificadores ?? []).some((s) => s.type === "ImportNamespaceSpecifier");
}

const ALVOS = [
  {
    simbolo: "comClinica",
    modulo: "db/client",
    // Nenhuma exceção fora de db/scripts/tests: todo call-site legítimo de
    // comClinica mora num desses três.
    permitidosAlemDeInfra: [],
    messageId: "comClinicaProibido",
  },
  {
    simbolo: "comServico",
    modulo: "db/onboarding",
    // Dois casos legítimos fora de infra, e só esses dois: código que roda
    // ANTES de existir um tenant resolvido, logo não tem clinica_id nenhum
    // para comClinicaDaSessao setar.
    //   - modules/adm/onboarding.ts: cria o tenant (ver comentário lá).
    //   - lib/auth/consultas.ts: resolve identidade/clínicas disponíveis/
    //     papel ANTES da sessão existir — é o que obterSessao() chama para
    //     montá-la. Cada query lá filtra manualmente por usuario_id/
    //     clinica_id (RLS não filtra nada nesta conexão).
    // Caminho explícito na lista, não eslint-disable solto no arquivo: abrir
    // outra exceção exige editar esta lista conscientemente, e ela fica
    // visível pra quem revisar a regra — um eslint-disable se perderia no
    // meio do código de quem o escreveu.
    permitidosAlemDeInfra: ["modules/adm/onboarding.ts", "lib/auth/consultas.ts"],
    messageId: "comServicoProibido",
  },
];

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Proíbe importar comClinica/comServico fora de db/, scripts/ e tests/ — use comClinicaDaSessao",
    },
    messages: {
      comClinicaProibido:
        "'comClinica' é reservado para db/, scripts/ e tests/. Numa Server Action, use comClinicaDaSessao (db/com-sessao.ts) — ela monta {clinicaId, usuarioId} a partir da sessão autenticada, sem depender de dado vindo do chamador.",
      comServicoProibido:
        "'comServico' ignora o RLS por completo (conexão BYPASSRLS) — é reservado para criação de tenant, migração e seed. Numa Server Action de domínio, use comClinicaDaSessao (db/com-sessao.ts).",
    },
    schema: [],
  },
  create(context) {
    const nomeArquivo = context.filename ?? context.getFilename();
    const relativoDoArquivo = caminhoRelativo(nomeArquivo);
    const infraBase = ehArquivoDeInfra(nomeArquivo);

    const alvosAtivos = ALVOS.filter(
      (alvo) => !infraBase && !alvo.permitidosAlemDeInfra.includes(relativoDoArquivo),
    );
    if (alvosAtivos.length === 0) return {};

    return {
      ImportDeclaration(node) {
        for (const alvo of alvosAtivos) {
          if (!ehFonteDoModulo(node.source.value, alvo.modulo)) continue;
          if (
            importaSimboloNomeado(node.specifiers, alvo.simbolo) ||
            importaNamespace(node.specifiers)
          ) {
            context.report({ node, messageId: alvo.messageId });
          }
        }
      },
      ImportExpression(node) {
        if (node.source.type !== "Literal") return;
        for (const alvo of alvosAtivos) {
          if (ehFonteDoModulo(node.source.value, alvo.modulo)) {
            context.report({ node, messageId: alvo.messageId });
          }
        }
      },
      ExportNamedDeclaration(node) {
        if (!node.source) return;
        for (const alvo of alvosAtivos) {
          if (!ehFonteDoModulo(node.source.value, alvo.modulo)) continue;
          if (importaSimboloNomeado(node.specifiers, alvo.simbolo)) {
            context.report({ node, messageId: alvo.messageId });
          }
        }
      },
      ExportAllDeclaration(node) {
        if (!node.source) return;
        for (const alvo of alvosAtivos) {
          if (ehFonteDoModulo(node.source.value, alvo.modulo)) {
            context.report({ node, messageId: alvo.messageId });
          }
        }
      },
    };
  },
};
