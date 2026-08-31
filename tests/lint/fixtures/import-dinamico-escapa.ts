"use client";

export async function carregarDbDinamicamente() {
  const { db } = await import("@/db/client");
  return db;
}
