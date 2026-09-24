/**
 * Fase C.1 — lógica pura de idempotência do salvamento de estudo.
 *
 * Extraída de `study-session.action.ts` (um arquivo "use server") para ficar
 * testável sem depender do runtime do Next — importar qualquer módulo que
 * puxa `next/headers`/o cliente Supabase de servidor trava indefinidamente
 * neste ambiente de testes (mesmo problema documentado e resolvido em
 * `save-study-session.ts`/`sync-worker.ts` na Fase C). `study-session.
 * action.ts` é o ÚNICO lugar que chama isto com dependências reais
 * (Supabase, revalidatePath, Sentry); os testes importam só este arquivo,
 * com um `lookup` falso injetado.
 *
 * Não reimplementa nada do motor de Ciclos nem decide quando ele deve
 * rodar — só decide se uma violação de índice único é uma duplicata
 * idempotente (e, se for, garante que o chamador NUNCA aciona o Ciclo de
 * novo para ela — ver `onReplay` abaixo, item 5 do pedido de Fase C.1).
 */

export const OPERATION_ID_UNIQUE_INDEX = "study_history_client_operation_id_idx"

export interface PostgrestErrorLike {
  code?: string | null
  message?: string | null
}

/**
 * Verdadeiro só quando o erro é EXATAMENTE a violação do índice único
 * parcial de `client_operation_id` — nunca para qualquer outro `23505`
 * (colisão de PK, uma constraint futura, etc.). Esses continuam sendo erro
 * real (item 4 do pedido de Fase C.1: "não transformar qualquer 23505 em
 * sucesso").
 */
export function isOperationIdConflict(
  error: PostgrestErrorLike | null | undefined,
  operationId: string | null,
): boolean {
  if (!error || !operationId) return false
  if (error.code !== "23505") return false
  return typeof error.message === "string" && error.message.includes(OPERATION_ID_UNIQUE_INDEX)
}

export interface IdempotentReplaySuccess {
  success: true
  historyId: string
  session: unknown
  cycleSyncError: null
  idempotentReplay: true
}

export interface IdempotentReplayFailure {
  success: false
  error: string
  code?: string | null | undefined
}

export interface LookupResult {
  data: (Record<string, unknown> & { id: string }) | null
  error: PostgrestErrorLike | null
}

/**
 * Resolve uma violação de `client_operation_id` como sucesso idempotente:
 * busca o registro já gravado pela execução original desta MESMA operação e
 * o devolve como se fosse o resultado de um INSERT bem-sucedido.
 *
 * NUNCA insere de novo. NUNCA aciona `registerStudyToCycle()` — o ciclo já
 * foi atualizado na execução original; `onReplay` (chamado só no caminho de
 * sucesso) serve apenas para revalidação de cache, que é segura de repetir.
 *
 * Se a busca falhar ou não encontrar nada (estado inesperado: a constraint
 * acusou duplicata mas o registro não foi lido — RLS, race muito estreita),
 * devolve erro real em vez de inventar sucesso sem confirmação.
 */
export async function resolveIdempotentReplay(params: {
  // PromiseLike: o query builder do Supabase é "thenable", não uma Promise nativa.
  lookup: () => PromiseLike<LookupResult>
  onReplay?: (() => void) | undefined
  onLookupFailed?: ((lookupError: PostgrestErrorLike | null) => void) | undefined
  originalErrorCode?: string | null | undefined
}): Promise<IdempotentReplaySuccess | IdempotentReplayFailure> {
  const { data: existing, error: lookupError } = await params.lookup()

  if (lookupError || !existing) {
    params.onLookupFailed?.(lookupError)
    return {
      success: false,
      error: "Erro ao salvar sessão: conflito de sincronização não pôde ser resolvido.",
      code: params.originalErrorCode ?? undefined,
    }
  }

  params.onReplay?.()

  return {
    success: true,
    historyId: existing.id,
    session: existing,
    cycleSyncError: null,
    idempotentReplay: true,
  }
}

export interface CycleRegistrationResultLike {
  success: boolean
  error?: string | null | undefined
}

export interface InsertResultLike {
  data: (Record<string, unknown> & { id: string }) | null
  error: PostgrestErrorLike | null
}

export type SaveOrReplayResult =
  | {
      success: true
      historyId: string
      session: unknown
      cycleSyncError: string | null
      idempotentReplay?: true
    }
  | { success: false; error: string; code?: string | null | undefined }

export interface SaveOrReplayParams {
  /** operationId já extraído do payload (ou null, quando o chamador não enviou um). */
  operationId: string | null
  /** Faz o INSERT real em study_history e devolve a linha criada (com join de disciplina). */
  insert: () => PromiseLike<InsertResultLike>
  /** Busca o registro existente por client_operation_id (só chamado numa violação de idempotência). */
  lookupByOperationId: () => PromiseLike<LookupResult>
  /** Espelha `activeMinutesFinal > 0` do chamador — decide se o Ciclo deve ser acionado no caminho de INSERT normal. */
  shouldRegisterCycle: boolean
  /** `registerStudyToCycle()` real — só é chamado no caminho de INSERT normal, NUNCA num replay idempotente (item 5). */
  registerCycle: () => Promise<CycleRegistrationResultLike | null>
  /** Revalidação de cache — chamada tanto no INSERT normal quanto no replay idempotente (idempotente por natureza, seguro repetir). */
  onRevalidate: () => void
  onInsertError?: (error: PostgrestErrorLike) => void
  onLookupFailed?: ((lookupError: PostgrestErrorLike | null) => void) | undefined
}

/**
 * Orquestra o passo "salvar em study_history" de `saveStudySessionAction`
 * (passos 6-7 do arquivo original): faz o INSERT; se colidir especificamente
 * com o índice único de `client_operation_id`, resolve como replay
 * idempotente (sem inserir de novo, sem acionar o Ciclo de novo); se for
 * qualquer outro erro, devolve erro real; se o INSERT for bem-sucedido,
 * aciona o Ciclo quando aplicável e revalida o cache — exatamente o
 * comportamento anterior a esta fase, para chamadas sem `operationId`.
 *
 * Extraído para cá (em vez de ficar inline em `study-session.action.ts`)
 * para ser testável com dependências falsas — este é o núcleo que os testes
 * de Fase C.1 exercitam de verdade, sem precisar do runtime do Next.
 */
export async function saveOrReplayStudyHistory(
  params: SaveOrReplayParams,
): Promise<SaveOrReplayResult> {
  const { data: historyData, error: historyError } = await params.insert()

  if (historyError) {
    if (isOperationIdConflict(historyError, params.operationId)) {
      return resolveIdempotentReplay({
        lookup: params.lookupByOperationId,
        originalErrorCode: historyError.code,
        onReplay: params.onRevalidate,
        onLookupFailed: params.onLookupFailed,
      })
    }

    params.onInsertError?.(historyError)
    return {
      success: false,
      error: "Erro ao salvar sessão: " + (historyError.message || JSON.stringify(historyError)),
      code: historyError.code,
    }
  }

  if (!historyData) {
    return { success: false, error: "Erro ao salvar sessão: nenhum registro retornado." }
  }

  const cycleResult = params.shouldRegisterCycle ? await params.registerCycle() : null

  params.onRevalidate()

  return {
    success: true,
    historyId: historyData.id,
    session: historyData,
    cycleSyncError:
      cycleResult && !cycleResult.success
        ? cycleResult.error || "O estudo foi salvo, mas o ciclo precisa ser reconciliado."
        : null,
  }
}
