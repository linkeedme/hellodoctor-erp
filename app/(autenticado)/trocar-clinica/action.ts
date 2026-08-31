"use server";

import { revalidatePath } from "next/cache";
import { definirClinicaAtiva } from "@/lib/auth/sessao";

export async function trocarClinica(clinicaId: string): Promise<void> {
  await definirClinicaAtiva(clinicaId);
  revalidatePath("/", "layout");
}
