"use client";

// O especificador abaixo ("./modulo-intermediario") não contém "db" nem é
// kysely/pg — a regra local/sem-banco-no-cliente é sintática por arquivo e
// não enxerga que modulo-intermediario.ts, por sua vez, importa db/client.
// É exatamente o barrel transitivo que o ADENDO descreve. A defesa aqui não
// é a regra de lint, é o "server-only" dentro de db/client.ts.
export { bancoReexportado } from "./modulo-intermediario";
