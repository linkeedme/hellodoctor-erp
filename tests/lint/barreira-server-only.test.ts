import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { lintarArquivo as lintarFixture } from "./lintar-arquivo";

// A regra de lint local/sem-banco-no-cliente é sintática por arquivo: ela
// enxerga apenas o especificador do import, não o grafo de módulos. Um
// barrel transitivo (componente client -> módulo intermediário sem "db" no
// nome -> db/client) escapa dela por desenho. Quem fecha essa lacuna é o
// pacote "server-only": o bundler do Next recusa o build se db/client.ts
// entrar em qualquer grafo do cliente, não importa quantos módulos no meio.
//
// Fora do bundler do Next (aqui, execução direta em Node/Vitest) não existe
// a condição de export "react-server" que o Next injeta só no grafo do
// servidor. Sem essa condição, o pacote "server-only" lança incondicionalmente
// — em qualquer importador, client ou server. Isso NÃO reproduz o build do
// Next (não temos como rodá-lo aqui dentro de um teste de unidade), mas prova
// o que de fato é observável nesta suíte: o guard existe, está na primeira
// linha do arquivo, e dispara de verdade ao ser alcançado por qualquer
// caminho de import — inclusive o barrel que a regra de lint não vê.
describe("barreira server-only (ADENDO da task 2 — fecha o barrel transitivo)", () => {
  it('db/client.ts tem "import \\"server-only\\";" como primeira linha', async () => {
    const conteudo = await readFile("db/client.ts", "utf8");
    expect(conteudo.split("\n")[0]).toBe('import "server-only";');
  });

  it('db/onboarding.ts tem "import \\"server-only\\";" como primeira linha', async () => {
    const conteudo = await readFile("db/onboarding.ts", "utf8");
    expect(conteudo.split("\n")[0]).toBe('import "server-only";');
  });

  it("confirma a lacuna: a regra de lint NÃO acusa o barrel transitivo", async () => {
    const { saiuComErro } = await lintarFixture(
      "tests/lint/fixtures/server-only/componente-cliente-consome-barrel.tsx",
    );
    expect(saiuComErro).toBe(false);
  });

  it("importar a cadeia (componente client -> módulo intermediário -> db/client) dispara o guard do server-only", async () => {
    await expect(
      import("./fixtures/server-only/componente-cliente-consome-barrel"),
    ).rejects.toThrow(/Client Component/);
  });
});
