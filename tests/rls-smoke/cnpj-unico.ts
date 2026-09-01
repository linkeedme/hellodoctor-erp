/**
 * cnpj gerado a partir de timestamp + contador, único por processo de teste.
 * Usado por suítes que chamam `criarClinica()` de verdade: desde que
 * `criarClinica` audita (Task 1 da Fatia 4), a clínica criada nunca mais
 * pode ser apagada — `evento_auditoria` é append-only e referencia
 * `clinica` sem cascade. Um cnpj fixo reutilizado numa segunda execução
 * bateria em "CNPJ já cadastrado" por causa da clínica órfã da rodada
 * anterior; este helper evita a colisão sem precisar apagar nada.
 */
let contador = 0;

export function cnpjUnico(): string {
  contador += 1;
  return `${Date.now()}`.slice(-10).padStart(10, "0") + String(contador).padStart(4, "0");
}
