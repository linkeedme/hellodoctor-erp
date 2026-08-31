import { describe, it, expect, vi } from "vitest";

// lib/auth/sessao.ts começa com `import "server-only"` e importa
// next/headers e next/navigation, que só resolvem dentro do bundler do
// Next. Mockamos "server-only" como no-op para poder carregar o módulo
// aqui — mesmo padrão de tests/rls-smoke/com-clinica.test.ts e
// tests/rls-smoke/sessao.test.ts. As duas funções testadas aqui
// (validarClinicaDisponivel, escolherClinicaAtiva) são puras: não tocam
// cookies, banco nem rede — por isso este teste não precisa de guard de
// variável de ambiente nem do banco de pé.
vi.mock("server-only", () => ({}));

const { validarClinicaDisponivel, escolherClinicaAtiva } = await import("@/lib/auth/sessao");

const CLINICA_A = { id: "11111111-1111-1111-1111-111111111111", razaoSocial: "Clínica A" };
const CLINICA_B = { id: "22222222-2222-2222-2222-222222222222", razaoSocial: "Clínica B" };
const CLINICA_ALHEIA = {
  id: "99999999-9999-9999-9999-999999999999",
  razaoSocial: "Clínica de outro usuário",
};

describe("validarClinicaDisponivel (RF-003 — regra pura, sem I/O)", () => {
  it("não lança quando a clínica está na lista de disponíveis", () => {
    expect(() => validarClinicaDisponivel(CLINICA_A.id, [CLINICA_A, CLINICA_B])).not.toThrow();
  });

  it("lança quando a clínica não está na lista", () => {
    expect(() => validarClinicaDisponivel(CLINICA_B.id, [CLINICA_A])).toThrow(
      /não disponível/,
    );
  });

  it("lança quando a lista de disponíveis está vazia", () => {
    expect(() => validarClinicaDisponivel(CLINICA_A.id, [])).toThrow(/não disponível/);
  });

  it("lança para clínica que existe no sistema mas não é do usuário (cenário de ataque real)", () => {
    // CLINICA_ALHEIA é um id de clínica real e válido, só que de outro
    // tenant — não um id inventado. É exatamente o cookie forjado que a
    // função existe para barrar.
    expect(() =>
      validarClinicaDisponivel(CLINICA_ALHEIA.id, [CLINICA_A, CLINICA_B]),
    ).toThrow(/não disponível/);
  });
});

describe("escolherClinicaAtiva (degrada para a primeira legítima, nunca para a pedida)", () => {
  it("cookie com id válido devolve essa clínica", () => {
    expect(escolherClinicaAtiva(CLINICA_B.id, [CLINICA_A, CLINICA_B])).toEqual(CLINICA_B);
  });

  it("cookie undefined devolve a primeira disponível", () => {
    expect(escolherClinicaAtiva(undefined, [CLINICA_A, CLINICA_B])).toEqual(CLINICA_A);
  });

  it("cookie com id que não está na lista (adulterado) devolve a primeira, nunca a pedida", () => {
    const resultado = escolherClinicaAtiva(CLINICA_ALHEIA.id, [CLINICA_A, CLINICA_B]);
    expect(resultado).toEqual(CLINICA_A);
    expect(resultado?.id).not.toBe(CLINICA_ALHEIA.id);
  });

  it("lista vazia devolve null", () => {
    expect(escolherClinicaAtiva(CLINICA_A.id, [])).toBeNull();
  });
});
