// Simula o "lib/algo.ts" descrito no ADENDO da task 2: um módulo de servidor,
// sem "use client", que importa db/client e reexporta algo cujo especificador
// de import não bate com nenhum padrão que a regra sem-banco-no-cliente
// reconhece (não é @/db/*, caminho relativo pra db/*, kysely nem pg).
export { db as bancoReexportado } from "../../../../db/client";
