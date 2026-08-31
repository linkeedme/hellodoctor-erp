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

export async function obterSessao(): Promise<SessaoAtiva | null> {
  const supabase = await clienteSupabaseServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const usuario = await resolverUsuarioPorAuthId(data.user.id);
  if (!usuario) return null;

  const disponiveis = await resolverClinicasDoUsuario(usuario.id);
  if (disponiveis.length === 0) return null;

  const armazem = await cookies();
  const pedida = armazem.get(COOKIE_CLINICA)?.value;
  const primeiraDisponivel = disponiveis[0];
  if (!primeiraDisponivel) return null;
  const escolhida = disponiveis.find((c) => c.id === pedida) ?? primeiraDisponivel;

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

export async function definirClinicaAtiva(clinicaId: string): Promise<void> {
  const sessao = await exigirSessao();
  if (!sessao.clinicasDisponiveis.some((c) => c.id === clinicaId)) {
    throw new Error("Clínica não disponível para este usuário");
  }
  const armazem = await cookies();
  armazem.set(COOKIE_CLINICA, clinicaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
