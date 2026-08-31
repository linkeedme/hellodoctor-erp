"use server";

import { redirect } from "next/navigation";
import { clienteSupabaseServidor } from "@/lib/auth/supabase-servidor";

export async function entrarComEmail(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const senha = String(formData.get("senha") ?? "");

  const supabase = await clienteSupabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) redirect("/login?erro=credenciais");
  redirect("/");
}
