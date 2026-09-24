import { connectionState } from "./connection-state"
import { classifySaveStudySessionResult } from "./classify-save-result"
import { classifySyncError } from "./sync-error-classifier"
import { generateOperationId } from "./operation-id"
import { buildPendingStudySession, type PendingStudySession } from "./pending-study-session"
import { syncQueue } from "./sync-queue"

/**
 * Fase C — item 1: ponto único de interceptação entre o app e
 * `saveStudySessionAction`. Tanto o cronômetro (via `StudyProvider.
 * finalizeAndSaveSession`) quanto o lançamento manual (via
 * `study-register-modal.tsx`) passam por AQUI — nenhum dos dois chama
 * `saveStudySessionAction` diretamente mais. A action em si nunca é
 * duplicada nem reimplementada (item 1: "não duplicar a lógica de
 * salvamento").
 */
export interface SaveStudySessionResult {
  success: boolean
  error?: string | null
  code?: string | null
  historyId?: string | null
  /** Presente SÓ quando o registro é real, confirmado pelo servidor (nunca no caminho offline). */
  session?: unknown
  cycleSyncError?: string | null
  /** Presente quando a operação foi enfileirada em vez de salva direto no servidor (item 2-4). */
  pending?: true
  operationId?: string
  /** Snapshot local para a UI mostrar imediatamente (item 6) — só existe quando `pending` é true. */
  pendingSession?: PendingStudySession
  /** Fase C.1: presente e true quando o resultado veio de uma resposta idempotente do servidor (mesmo operationId já processado antes). */
  idempotentReplay?: true
}

type SaveFn = (payload: Record<string, unknown>) => Promise<SaveStudySessionResult>
type GetUserIdFn = () => Promise<string | null>

interface SaveStudySessionDeps {
  saveFn: SaveFn
  getUserId: GetUserIdFn
}

async function enqueueOffline(
  payload: Record<string, unknown>,
  userId: string,
  operationId: string,
): Promise<SaveStudySessionResult> {
  // Fase C.1: o payload gravado na fila carrega o MESMO operationId que foi
  // (ou seria) enviado ao servidor como client_operation_id — é o que torna
  // um retry, disparado pelo sync worker a partir desta fila, idempotente em
  // relação a uma tentativa anterior cuja resposta se perdeu (item 9).
  const storedPayload = { ...payload, operationId }
  const storedOperationId = await syncQueue.enqueue({
    userId,
    type: "STUDY_SESSION_CREATE",
    entity: "study_history",
    payload: storedPayload,
    operationId,
  })
  const pendingSession = buildPendingStudySession(storedPayload, storedOperationId, userId)
  return {
    success: true,
    pending: true,
    operationId: storedOperationId,
    pendingSession,
    historyId: null,
  }
}

/**
 * Fábrica testável: recebe as dependências (a própria action e o resolvedor
 * de userId) em vez de importá-las globalmente, para que os testes possam
 * injetar dublês sem precisar simular `next/headers`/Supabase/Sentry (que
 * `saveStudySessionAction` usa internamente e que não rodam fora do Next).
 * `saveStudySessionWithOfflineSupport` (abaixo) é só esta fábrica aplicada
 * às dependências reais — o comportamento em produção é idêntico.
 */
export function createSaveStudySessionWithOfflineSupport({
  saveFn,
  getUserId,
}: SaveStudySessionDeps): SaveFn {
  return async function saveStudySessionWithOfflineSupport(
    payload: Record<string, unknown>,
  ): Promise<SaveStudySessionResult> {
    const userId = await getUserId()

    if (!userId) {
      // Sem sessão local nenhuma — não há "de quem" é o IndexedDB, e não
      // criamos login offline (item 10, regra explícita do pedido).
      return { success: false, error: "Usuário não autenticado. Faça login novamente." }
    }

    // Fase C.1 (item 9 — "lost response"): o operationId é gerado UMA VEZ,
    // antes de qualquer tentativa, e reaproveitado em toda tentativa
    // subsequente da MESMA operação — inclusive na primeira tentativa
    // online. Isso é o que permite ao servidor reconhecer um retry (via
    // fila) como a mesma operação de uma tentativa online cuja resposta se
    // perdeu por erro de transporte, mesmo que o cliente nunca tenha
    // recebido a confirmação da primeira tentativa.
    const operationId = generateOperationId()

    if (connectionState.get() === "OFFLINE") {
      // Item 2: "OFFLINE: não tentar Server Action."
      return enqueueOffline(payload, userId, operationId)
    }

    try {
      const res = await saveFn({ ...payload, operationId })

      if (res.success) {
        return res
      }

      // A action respondeu (não foi erro de rede) mas recusou o salvamento.
      const classification = classifySaveStudySessionResult(res)
      if (classification.retryable) {
        // Item 10: sessão local válida mas token expirado (ou qualquer erro
        // desconhecido) -> não perder a operação, enfileirar para nova
        // tentativa em vez de descartar o estudo do usuário.
        return enqueueOffline(payload, userId, operationId)
      }

      // Erro de negócio genuíno (ex.: disciplina inexistente) — mostrar ao
      // usuário como sempre, enfileirar aqui só esconderia um problema real.
      return res
    } catch (err) {
      // Item 2: "Se ONLINE mas a chamada falhar por erro de rede -> salvar
      // na sync queue. Não perder a sessão." `classifySyncError` só é usada
      // aqui para registrar o motivo — o resultado prático é sempre
      // enfileirar, porque uma EXCEÇÃO ao chamar a Server Action (em vez de
      // uma resposta normal) só acontece por falha de rede/transporte.
      //
      // Fase C.1: esta é exatamente a janela do cenário "lost response" —
      // o servidor pode já ter processado e gravado o study_history com
      // este `operationId` como client_operation_id, mas o cliente nunca
      // recebeu a resposta. Como o retry (via fila) reenvia o MESMO
      // operationId, o servidor reconhece a duplicata (unique index) e
      // devolve o registro já existente em vez de criar um segundo.
      void classifySyncError(err)
      return enqueueOffline(payload, userId, operationId)
    }
  }
}
