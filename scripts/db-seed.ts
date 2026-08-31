import { semearPapeisEPermissoes } from "@/db/seed/papeis-permissoes";

const resultado = await semearPapeisEPermissoes();
console.log(`✓ papéis: ${resultado.papeis}`);
console.log(`✓ permissões: ${resultado.permissoes}`);
console.log(`✓ removidas (fora da matriz): ${resultado.removidas}`);
