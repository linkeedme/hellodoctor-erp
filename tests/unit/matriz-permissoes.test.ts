import { describe, it, expect } from "vitest";
import { MATRIZ, MODULOS, OPERACOES, PAPEIS, podeNaMatriz } from "@/lib/autorizacao/matriz";

describe("matriz de permissões", () => {
  it("não tem entrada duplicada de papel + módulo", () => {
    const chaves = MATRIZ.map((e) => `${e.papel}:${e.modulo}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("só referencia papéis declarados", () => {
    const validos = new Set<string>(PAPEIS.map((p) => p.chave));
    for (const e of MATRIZ) expect(validos.has(e.papel)).toBe(true);
  });

  it("só referencia módulos e operações declarados", () => {
    for (const e of MATRIZ) {
      expect(MODULOS).toContain(e.modulo);
      for (const op of e.operacoes) expect(OPERACOES).toContain(op);
    }
  });

  it("dona pode excluir em adm; recepção não", () => {
    expect(podeNaMatriz("dona", "adm", "excluir")).toBe(true);
    expect(podeNaMatriz("recepcao", "adm", "excluir")).toBe(false);
  });

  it("papel sem entrada no módulo não tem nenhuma operação", () => {
    expect(podeNaMatriz("paciente", "fin", "ver")).toBe(false);
    expect(podeNaMatriz("profissional", "adm", "ver")).toBe(false);
  });

  it("papel desconhecido nunca pode", () => {
    expect(podeNaMatriz("invasor", "adm", "ver")).toBe(false);
  });
});
