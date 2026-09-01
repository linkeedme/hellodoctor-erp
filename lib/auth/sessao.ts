import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clienteSupabaseServidor } from "./supabase-servidor";
import {
  resolverUsuarioPorAuthId,
  resolverClinicasDoUsuario,
  resolverPapel,
  type ClinicaDisponivel,
} from "./consultas";

const COOKIE_CLINICA = "hd_clinica_ativa";

export type SessaoAtiva = {
  usuarioId: string;
  clinicaId: string;
  papelChave: string;
  clinicasDisponiveis: ClinicaDisponivel[];
};

export type UsuarioAutenticado = { id: string; nome: string; email: string };

async function resolverUsuarioAutenticado(): Promise<UsuarioAutenticado | null> {
  const supabase = await clienteSupabaseServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return resolverUsuarioPorAuthId(data.user.id);
}

/**
 * Um usuário só pode ativar clínica onde é membro. Sem esta validação, um
 * cookie forjado apontaria o set_config do RLS para outro tenant, com
 * permissão total — o vazamento perfeito, porque o banco obedeceria.
 */
export function validarClinicaDisponivel(
  clinicaId: string,
  disponiveis: ClinicaDisponivel[],
): void {
  if (!disponiveis.some((c) => c.id === clinicaId)) {
    throw new Error("Clínica não disponível para este usuário");
  }
}

/**
 * Resolve qual clínica fica ativa a partir do que veio no cookie.
 * Cookie ausente, desconhecido ou adulterado degrada para a primeira
 * clínica legítima — nunca para a clínica pedida.
 */
export function escolherClinicaAtiva(
  valorDoCookie: string | undefined,
  disponiveis: ClinicaDisponivel[],
): ClinicaDisponivel | null {
  if (disponiveis.length === 0) return null;
  const pedida = disponiveis.find((c) => c.id === valorDoCookie);
  return pedida ?? disponiveis[0] ?? null;
}

export async function obterSessao(): Promise<SessaoAtiva | null> {
  const usuario = await resolverUsuarioAutenticado();
  if (!usuario) return null;

  const disponiveis = await resolverClinicasDoUsuario(usuario.id);

  const armazem = await cookies();
  const pedida = armazem.get(COOKIE_CLINICA)?.value;
  const escolhida = escolherClinicaAtiva(pedida, disponiveis);
  if (!escolhida) return null;

  const papel = await resolverPapel(usuario.id, escolhida.id);
  if (!papel) return null;

  return {
    usuarioId: usuario.id,
    clinicaId: escolhida.id,
    papelChave: papel.chave,
    clinicasDisponiveis: disponiveis,
  };
}

export async function exigirSessao(): Promise<SessaoAtiva> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  return sessao;
}

/**
 * Identidade do chamador no provedor de auth, sem exigir clínica ativa.
 * `exigirSessao()` não serve para onboarding: ela busca `clinicasDisponiveis`
 * e falha se estiver vazia, mas quem está criando a primeira clínica ainda
 * não é membro de nenhuma. Isto existe para que `criarClinica` (Task 3)
 * resolva o `usuarioId` do usuário autenticado — nunca de um campo do
 * payload, que o chamador poderia adulterar para criar clínica em nome de
 * outra pessoa.
 */
export async function exigirUsuarioAutenticado(): Promise<UsuarioAutenticado> {
  const usuario = await resolverUsuarioAutenticado();
  if (!usuario) redirect("/login");
  return usuario;
}

export async function definirClinicaAtiva(clinicaId: string): Promise<void> {
  const sessao = await exigirSessao();
  validarClinicaDisponivel(clinicaId, sessao.clinicasDisponiveis);

  const armazem = await cookies();
  armazem.set(COOKIE_CLINICA, clinicaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
