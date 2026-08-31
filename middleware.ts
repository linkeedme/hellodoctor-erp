import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar definidas",
    );
  }

  const resposta = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value, options } of lista) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login).*)"],
};
