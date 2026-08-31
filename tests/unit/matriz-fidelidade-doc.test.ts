import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MATRIZ, MODULOS, PAPEIS, type Modulo, type Operacao } from "@/lib/autorizacao/matriz";

/**
 * Confere MATRIZ contra a tabela da seção 4.2 de docs/modulos-e-funcionalidades.md,
 * célula a célula. Existe porque 16 divergências (sobre-concessão e célula
 * ausente/incompleta) passaram por 65 testes verdes na primeira rodada — nenhum
 * deles comparava a matriz com o documento, só a matriz consigo mesma.
 *
 * O documento tem mais módulos e mais papéis "via Portal" do que esta fatia
 * semeia (ver MODULOS em matriz.ts) — este teste ignora linha/coluna fora do
 * escopo, não trata ausência delas como divergência.
 */

const CAMINHO_DOC = join(process.cwd(), "docs", "modulos-e-funcionalidades.md");

const MODULO_POR_NOME: Record<string, Modulo> = {
  Agenda: "agd",
  "Prontuário e ficha configurável": "prt",
  "Mídia clínica": "mid",
  "Protocolo e catálogo": "cat",
  "Financeiro e comissão": "fin",
  Prescrição: "pre",
  "Perfil de clínica": "pfl",
  "Tabela de preços": "tpr",
  "Migração / Importador": "mig",
  "Administração do tenant": "adm",
};

const PAPEL_POR_CABECALHO: Record<string, string> = {
  dona: "dona",
  gestora: "gestora",
  profissional: "profissional",
  recepção: "recepcao",
  financeiro: "financeiro",
  "consultora comercial": "consultora_comercial",
  paciente: "paciente",
};

const LETRA_PARA_OPERACAO: Record<string, Operacao> = {
  V: "ver",
  C: "criar",
  E: "editar",
  X: "excluir",
  A: "aprovar",
};

type Celula = { papel: string; modulo: Modulo; operacoes: Set<Operacao> };

function extrairOperacoesDaCelula(texto: string): Set<Operacao> {
  const operacoes = new Set<Operacao>();

  // "V (via Portal)" (ou "— (via Portal)") não é grant direto no módulo da
  // linha: é o documento apontando que a operação é exercida pelo módulo
  // Portal do paciente (POR), que é o único lugar onde o paciente tem acesso
  // — e POR está fora do escopo desta fatia (ver comentário de MODULOS em
  // matriz.ts). Tratar essa célula como "sem grant aqui" é o que o documento
  // já diz; contar o "V" literal criaria uma exigência de entrada paciente em
  // agd/prt/mid/fin/pre que nenhuma linha do produto usa.
  if (texto.includes("via Portal")) return operacoes;

  for (const token of texto.trim().split(/\s+/)) {
    const operacao = LETRA_PARA_OPERACAO[token];
    if (operacao) operacoes.add(operacao);
  }
  return operacoes;
}

function trechoDaTabela(markdown: string): string {
  const inicio = markdown.indexOf("### 4.2 Matriz por módulo");
  if (inicio === -1) throw new Error("Seção 4.2 não encontrada no documento");
  const fim = markdown.indexOf("**Notas:**", inicio);
  if (fim === -1) throw new Error("Fim da tabela (**Notas:**) não encontrado");
  return markdown.slice(inicio, fim);
}

/** Colunas de papel do cabeçalho da tabela, na ordem do documento (sem a coluna "Módulo"). */
function colunasDePapelDoCabecalho(markdown: string): string[] {
  const linhaCabecalho = trechoDaTabela(markdown)
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("|"));
  if (!linhaCabecalho) throw new Error("Cabeçalho da tabela da seção 4.2 não encontrado");
  return linhaCabecalho
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim())
    .slice(1);
}

function parsearTabela(markdown: string): Celula[] {
  const trecho = trechoDaTabela(markdown);

  const linhas = trecho
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));

  const [cabecalho, separador, ...linhasDeDados] = linhas;
  if (!cabecalho || !separador) throw new Error("Tabela da seção 4.2 malformada");

  const colunas = cabecalho
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  const papeisPorColuna = colunas.slice(1).map((c) => PAPEL_POR_CABECALHO[c] ?? null);

  const celulas: Celula[] = [];
  for (const linha of linhasDeDados) {
    const partes = linha.split("|").slice(1, -1).map((c) => c.trim());
    const nomeModulo = partes[0];
    if (!nomeModulo) continue;
    const modulo = MODULO_POR_NOME[nomeModulo];
    if (!modulo) continue; // módulo fora do escopo desta fatia (ver comentário acima)

    for (let i = 0; i < papeisPorColuna.length; i++) {
      const papel = papeisPorColuna[i];
      if (!papel) continue;
      const textoCelula = partes[i + 1] ?? "";
      celulas.push({ papel, modulo, operacoes: extrairOperacoesDaCelula(textoCelula) });
    }
  }
  return celulas;
}

function chave(papel: string, modulo: Modulo): string {
  return `${papel}:${modulo}`;
}

describe("MATRIZ bate com docs/modulos-e-funcionalidades.md §4.2", () => {
  const markdown = readFileSync(CAMINHO_DOC, "utf8");
  const celulasDoDocumento = parsearTabela(markdown);

  it("o parser encontrou células para todos os módulos do escopo", () => {
    const modulosEncontrados = new Set(celulasDoDocumento.map((c) => c.modulo));
    for (const modulo of MODULOS) expect(modulosEncontrados.has(modulo)).toBe(true);
  });

  it("o parser encontrou todos os papéis do cabeçalho", () => {
    // Simétrico ao teste de módulos acima. Sem isso, uma coluna renomeada no
    // documento, um papel novo, ou um erro de digitação em PAPEL_POR_CABECALHO
    // faz `parsearTabela` devolver `papel = null` pra aquela coluna — e a
    // coluna inteira some do parsing (`if (!papel) continue`) sem que nenhum
    // teste perceba. O "esperado" vem de PAPEIS (lista canônica) e do texto
    // real do cabeçalho lido do arquivo, nunca de PAPEL_POR_CABECALHO — senão
    // o teste compara o mapa de tradução consigo mesmo e não prova nada.
    const colunas = colunasDePapelDoCabecalho(markdown);

    const problemas: string[] = [];
    const papeisReconhecidos = new Set<string>();

    for (const coluna of colunas) {
      const papel = PAPEL_POR_CABECALHO[coluna];
      if (!papel) {
        problemas.push(`coluna do documento não reconhecida: "${coluna}"`);
      } else {
        papeisReconhecidos.add(papel);
      }
    }

    // "paciente" não tem entrada em MATRIZ — todo acesso dele é via módulo
    // Portal (POR), fora do escopo desta fatia (mesma decisão da nota da
    // extração de célula acima). Por isso é descontado do conjunto esperado
    // aqui; o restante dos papéis precisa aparecer reconhecido no cabeçalho.
    const esperados = PAPEIS.map((p) => p.chave).filter((chave) => chave !== "paciente");
    for (const chave of esperados) {
      if (!papeisReconhecidos.has(chave)) {
        problemas.push(`papel esperado não apareceu no cabeçalho do documento: "${chave}"`);
      }
    }

    expect(problemas).toEqual([]);
  });

  it("nenhuma célula do documento diverge de MATRIZ", () => {
    const atual = new Map(MATRIZ.map((e) => [chave(e.papel, e.modulo), new Set(e.operacoes)]));

    const divergencias: string[] = [];
    for (const celula of celulasDoDocumento) {
      const k = chave(celula.papel, celula.modulo);
      const esperado = celula.operacoes;
      const obtido = atual.get(k) ?? new Set<Operacao>();

      const aMais = [...obtido].filter((op) => !esperado.has(op));
      const aMenos = [...esperado].filter((op) => !obtido.has(op));

      if (aMais.length > 0 || aMenos.length > 0) {
        const partes: string[] = [];
        if (aMais.length > 0) partes.push(`a mais: ${aMais.join(", ")}`);
        if (aMenos.length > 0) partes.push(`a menos: ${aMenos.join(", ")}`);
        divergencias.push(`${k} — ${partes.join("; ")}`);
      }
    }

    expect(divergencias).toEqual([]);
  });
});
