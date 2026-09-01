import "server-only";
import { obterRequestId } from "@/lib/contexto-request";
import { obterSessao } from "@/lib/auth/sessao";
import { sanitizarParaSentry } from "./sentry";

type DadosLog = Record<string, unknown>;
type Nivel = "info" | "erro";

/**
 * `obterSessao()` pressupõe um request Next.js de pé (chama `cookies()` por
 * baixo). Em job, migração ou seed não existe esse request — `cookies()`
 * lança. Um logger que quebra o chamador por falta de contexto é pior do
 * que um log incompleto, então qualquer falha aqui vira "sem sessão", nunca
 * uma exceção que sobe.
 */
async function contextoDeSessao(): Promise<{ clinicaId?: string; usuarioId?: string }> {
  try {
    const sessao = await obterSessao();
    if (!sessao) return {};
    return { clinicaId: sessao.clinicaId, usuarioId: sessao.usuarioId };
  } catch {
    return {};
  }
}

async function escrever(nivel: Nivel, mensagem: string, dados: unknown, erro: unknown): Promise<void> {
  const { clinicaId, usuarioId } = await contextoDeSessao();

  const linha: Record<string, unknown> = {
    nivel,
    mensagem,
    request_id: obterRequestId(),
  };
  if (clinicaId !== undefined) linha.clinica_id = clinicaId;
  if (usuarioId !== undefined) linha.usuario_id = usuarioId;
  if (erro !== undefined) linha.erro = sanitizarParaSentry(erro);
  if (dados !== undefined) linha.dados = sanitizarParaSentry(dados);

  const linhaSerializada = JSON.stringify(linha);
  if (nivel === "erro") {
    console.error(linhaSerializada);
  } else {
    console.info(linhaSerializada);
  }
}

/**
 * `log.info`/`log.erro` — todo registro carrega `request_id` sempre, e
 * `clinica_id`/`usuario_id` quando há sessão ativa (RNF-021). `dados` (e o
 * `erro`, quando informado) passam por `sanitizarParaSentry` antes de
 * chegar ao `console`: campo de paciente não sai daqui, nem aninhado.
 */
export const log = {
  info: (mensagem: string, dados?: DadosLog): Promise<void> => escrever("info", mensagem, dados, undefined),
  erro: (mensagem: string, erro?: unknown, dados?: DadosLog): Promise<void> =>
    escrever("erro", mensagem, dados, erro),
};
