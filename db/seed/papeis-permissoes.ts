import { comServico } from "@/db/onboarding";
import { MATRIZ, PAPEIS } from "@/lib/autorizacao/matriz";

export async function semearPapeisEPermissoes(): Promise<{ papeis: number; permissoes: number }> {
  return comServico(async (db) => {
    for (const p of PAPEIS) {
      await db
        .insertInto("papel")
        .values({ chave: p.chave, nome: p.nome })
        .onConflict((oc) => oc.column("chave").doUpdateSet({ nome: p.nome }))
        .execute();
    }

    const papeis = await db.selectFrom("papel").select(["id", "chave"]).execute();
    const porChave = new Map(papeis.map((p) => [p.chave, p.id]));

    let permissoes = 0;
    for (const entrada of MATRIZ) {
      const papelId = porChave.get(entrada.papel);
      if (!papelId) throw new Error(`papel não semeado: ${entrada.papel}`);
      for (const operacao of entrada.operacoes) {
        await db
          .insertInto("permissao")
          .values({ papel_id: papelId, modulo: entrada.modulo, operacao })
          .onConflict((oc) => oc.columns(["papel_id", "modulo", "operacao"]).doNothing())
          .execute();
        permissoes++;
      }
    }
    return { papeis: PAPEIS.length, permissoes };
  });
}
