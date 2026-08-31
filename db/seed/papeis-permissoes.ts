import { comServico } from "@/db/onboarding";
import { MATRIZ, PAPEIS } from "@/lib/autorizacao/matriz";

type EntradaMatriz = (typeof MATRIZ)[number];

/**
 * Semeia `papel` e `permissao` a partir da matriz em código (parâmetro
 * `matriz`, padrão `MATRIZ` real). Aceitar a matriz como parâmetro — em vez
 * de importar `MATRIZ` direto no corpo — é o que permite o teste de
 * reconciliação simular "uma permissão saiu da matriz" sem mexer no arquivo
 * de origem: passa uma cópia menor.
 *
 * Reconcilia ao final: qualquer linha de `permissao` de um papel conhecido
 * que não esteja no conjunto derivado de `matriz` é removida. Sem isso, um
 * aperto de acesso (permissão retirada da matriz) deixaria a linha antiga
 * pra sempre no banco — e a tabela de auditoria mostraria um grant que não
 * existe mais.
 */
export async function semearPapeisEPermissoes(
  matriz: readonly EntradaMatriz[] = MATRIZ,
): Promise<{ papeis: number; permissoes: number; removidas: number }> {
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
    const validos = new Set<string>();
    for (const entrada of matriz) {
      const papelId = porChave.get(entrada.papel);
      if (!papelId) throw new Error(`papel não semeado: ${entrada.papel}`);
      for (const operacao of entrada.operacoes) {
        await db
          .insertInto("permissao")
          .values({ papel_id: papelId, modulo: entrada.modulo, operacao })
          .onConflict((oc) => oc.columns(["papel_id", "modulo", "operacao"]).doNothing())
          .execute();
        permissoes++;
        validos.add(`${papelId}:${entrada.modulo}:${operacao}`);
      }
    }

    const idsDosPapeis = [...porChave.values()];
    const existentes = await db
      .selectFrom("permissao")
      .select(["id", "papel_id", "modulo", "operacao"])
      .where("papel_id", "in", idsDosPapeis)
      .execute();

    const paraRemover = existentes
      .filter((r) => !validos.has(`${r.papel_id}:${r.modulo}:${r.operacao}`))
      .map((r) => r.id);

    let removidas = 0;
    if (paraRemover.length > 0) {
      await db.deleteFrom("permissao").where("id", "in", paraRemover).execute();
      removidas = paraRemover.length;
    }

    return { papeis: PAPEIS.length, permissoes, removidas };
  });
}
