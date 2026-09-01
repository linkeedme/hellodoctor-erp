import { describe, it, expect, vi } from "vitest";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL precisa estar definida. Rode `npm run db:efemero` e exporte a variável. Esta " +
      "suíte NÃO pula: um health check que some sozinho do teste é pior do que um que falha.",
  );
}

// app/api/status/route.ts importa "server-only" e db/client.ts, que também
// começa com "server-only" — mockamos como no-op para poder carregar o
// módulo aqui, mesmo padrão de tests/rls-smoke/com-sessao.test.ts.
vi.mock("server-only", () => ({}));

const { GET } = await import("@/app/api/status/route");
const { montarStatus } = await import("@/lib/observabilidade/status");
type EstadoStatus = Awaited<ReturnType<typeof montarStatus>>;

describe("GET /api/status — banco de pé", () => {
  it("devolve 200 com o banco saudável (select 1 de verdade, não suposição)", async () => {
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as EstadoStatus;
    expect(corpo.status).toBe("saudavel");
    expect(corpo.dependencias.banco).toBe("saudavel");
  });
});

describe("montarStatus — banco fora (RNF: health check por dependência)", () => {
  /**
   * Não derrubamos o container compartilhado (quebraria toda a suíte
   * rodando em paralelo). Em vez disso, injetamos um verificador que
   * tenta uma conexão real contra uma porta que não existe — a mesma
   * classe de falha de um Postgres fora do ar, sem afetar o container real.
   */
  it("retorna estado degradado em vez de estourar, quando o banco está inacessível", async () => {
    const clientePortaInvalida = new pg.Client({
      host: "localhost",
      port: 1,
      connectionTimeoutMillis: 300,
    });
    const verificadorQuebrado = async (): Promise<void> => {
      await clientePortaInvalida.connect();
    };

    const estado = await montarStatus(verificadorQuebrado);
    expect(estado.status).toBe("degradado");
    expect(estado.dependencias.banco).toBe("degradado");
  });

  it("um verificador que lança qualquer erro também degrada, sem propagar a exceção", async () => {
    const verificadorQueLanca = async (): Promise<void> => {
      throw new Error("dependência indisponível");
    };
    await expect(montarStatus(verificadorQueLanca)).resolves.toEqual({
      status: "degradado",
      dependencias: { banco: "degradado" },
    });
  });
});
