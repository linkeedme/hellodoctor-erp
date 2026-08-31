import type { ReactNode } from "react";
import { exigirSessao } from "@/lib/auth/sessao";

export default async function LayoutAutenticado({ children }: { children: ReactNode }) {
  const sessao = await exigirSessao();
  return <div data-clinica={sessao.clinicaId}>{children}</div>;
}
