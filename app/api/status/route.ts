import "server-only";
import { NextResponse } from "next/server";
import { montarStatus, type EstadoStatus } from "@/lib/observabilidade/status";

export async function GET(): Promise<NextResponse<EstadoStatus>> {
  const estado = await montarStatus();
  return NextResponse.json(estado, { status: 200 });
}
