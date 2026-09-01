import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const armazem = new AsyncLocalStorage<string>();

/**
 * Abre um novo contexto de request com um id novo, estável para todo o
 * código executado dentro de `fn` (incluindo chamadas assíncronas
 * aninhadas). Quem estabelece o contexto de um request real é quem chama
 * isto no ponto de entrada.
 */
export function comNovoContextoRequest<T>(fn: () => T): T {
  return armazem.run(randomUUID(), fn);
}

/**
 * Id estável por request: dentro do contexto aberto por
 * `comNovoContextoRequest`, toda chamada devolve o mesmo valor. Fora de um
 * contexto — script, seed, chamada avulsa — cada chamada gera um id novo,
 * porque não existe request para ser estável.
 */
export function obterRequestId(): string {
  return armazem.getStore() ?? randomUUID();
}
