import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function clienteSupabaseServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar definidas",
    );
  }

  const armazem = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => armazem.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) {
            armazem.set(name, value, options);
          }
        } catch {
          // chamado de Server Component: o middleware cuida do refresh
        }
      },
    },
  });
}
