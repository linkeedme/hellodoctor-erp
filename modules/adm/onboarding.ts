import "server-only";
import { comServico } from "@/db/onboarding";
import { exigirUsuarioAutenticado } from "@/lib/auth/sessao";
import { registrarEvento } from "@/lib/auditoria/registrar";
import { EsquemaOnboarding } from "./schema";

export class CnpjDuplicado extends Error {
  constructor(readonly cnpj: string) {
    super(`CNPJ já cadastrado: ${cnpj}`);
    this.name = "CnpjDuplicado";
  }
}

function ehViolacaoDeCnpjUnico(erro: unknown): boolean {
  if (typeof erro !== "object" || erro === null) return false;
  const { code, constraint } = erro as { code?: unknown; constraint?: unknown };
  return code === "23505" && constraint === "clinica_cnpj_unico";
}

/**
 * Criação de tenant novo. Único lugar desta fatia que usa `comServico`
 * (conexão com BYPASSRLS): não existe `clinica_id` para passar a
 * `comClinicaDaSessao` antes da clínica existir — é este próprio INSERT que
 * cria o valor que o RLS de todas as outras tabelas vai exigir depois.
 *
 * Cria a clínica, a unidade principal e o primeiro membro (papel "dona"),
 * numa única transação: ou o tenant nasce completo, ou não nasce.
 *
 * O `usuarioId` do primeiro membro vem de `exigirUsuarioAutenticado()`, nunca
 * do payload: aceitar um `usuarioId` cru do chamador permitiria criar uma
 * clínica e amarrar o papel de "dona" à identidade de qualquer pessoa cujo
 * `usuario.id` fosse conhecido ou adivinhado — a mesma classe de falha que
 * `comClinicaDaSessao` fecha no eixo do tenant, aqui no eixo da identidade.
 */
export async function criarClinica(entrada: unknown) {
  const dados = EsquemaOnboarding.parse(entrada);
  const usuario = await exigirUsuarioAutenticado();

  return comServico((db) =>
    db.transaction().execute(async (trx) => {
      let clinica;
      try {
        clinica = await trx
          .insertInto("clinica")
          .values({
            razao_social: dados.clinica.razaoSocial,
            nome_fantasia: dados.clinica.nomeFantasia ?? null,
            cnpj: dados.clinica.cnpj,
          })
          .returning(["id", "razao_social", "cnpj"])
          .executeTakeFirstOrThrow();
      } catch (erro) {
        if (ehViolacaoDeCnpjUnico(erro)) throw new CnpjDuplicado(dados.clinica.cnpj);
        throw erro;
      }

      // Não existe sessão nem clinica_id antes deste ponto — o evento usa o
      // par recém-criado (id da clínica, usuário autenticado) como contexto,
      // não uma SessaoAtiva. A ação registrada é a criação do tenant.
      await registrarEvento(
        trx,
        { clinicaId: clinica.id, usuarioId: usuario.id },
        {
          acao: "criacao",
          entidade: "clinica",
          entidadeId: clinica.id,
          valorDepois: { razaoSocial: clinica.razao_social, cnpj: clinica.cnpj },
        },
      );

      const unidade = await trx
        .insertInto("unidade")
        .values({ clinica_id: clinica.id, nome: dados.nomeUnidadePrincipal })
        .returning(["id", "nome"])
        .executeTakeFirstOrThrow();

      const papelDona = await trx
        .selectFrom("papel")
        .select("id")
        .where("chave", "=", "dona")
        .executeTakeFirst();
      if (!papelDona) {
        throw new Error("Papel 'dona' não semeado — rode o seed de papéis e permissões antes do onboarding");
      }

      const membro = await trx
        .insertInto("membro")
        .values({ clinica_id: clinica.id, usuario_id: usuario.id, papel_id: papelDona.id })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      // app_paciente_visivel() nega por omissão (falha fechada): sem esta
      // linha, a clínica recém-criada não enxergaria paciente nenhum.
      await trx
        .insertInto("politica_visibilidade_paciente")
        .values({ clinica_id: clinica.id, modo: "aberto" })
        .execute();

      return { clinica, unidade, membro };
    }),
  );
}
