import type { StudyHistory } from "@/domain/study-history/study-history.types"

/** Sessão real retornada pelo banco (com disciplina embutida), usada para atualizar o Histórico localmente. */
export type SavedStudySession = StudyHistory & {
  disciplines?: {
    id?: string
    name?: string
    area?: string | null
    color_hex?: string | null
  } | null
  /** Presente só em sessões que ainda não existem no servidor (Fase C, offline). */
  _offlinePending?: true
  _operationId?: string
}

/** Evento global disparado pelo modal após salvar/editar uma sessão com sucesso NO SERVIDOR. */
export const STUDY_SESSION_SAVED_EVENT = "study-session-saved"

/**
 * Fase F.2 — `serverRefresh: true` avisa que QUEM DISPAROU o evento também vai
 * chamar `router.refresh()` logo em seguida (modal de registro e cronômetro,
 * online). Nesse caso, a página atual vai ser re-renderizada no servidor com
 * dados novos, e os widgets que já recebem esses dados do servidor (via
 * InitialServerDataProvider) não precisam buscá-los de novo por Server Action
 * — antes os mesmos dados eram carregados duas vezes a cada estudo salvo.
 *
 * Retrocompatível: sem a opção o evento é idêntico ao de sempre
 * (`detail: { session }`) — é o caso da ponte de sincronização offline, que
 * NÃO chama router.refresh(), e em que os widgets continuam se atualizando
 * sozinhos. Nenhum consumidor antigo precisa mudar.
 */
export function dispatchStudySessionSaved(session: SavedStudySession, options: { serverRefresh?: boolean } = {}) {
  const detail = options.serverRefresh ? { session, serverRefresh: true as const } : { session }
  window.dispatchEvent(new CustomEvent(STUDY_SESSION_SAVED_EVENT, { detail }))
}

/** true quando o emissor vai chamar router.refresh() (ver dispatchStudySessionSaved). */
export function isServerRefreshPending(event: Event): boolean {
  const detail = (event as CustomEvent<{ serverRefresh?: boolean } | null | undefined>).detail
  return detail?.serverRefresh === true
}

/**
 * Decide se um widget precisa buscar os próprios dados ao receber
 * STUDY_SESSION_SAVED_EVENT.
 *
 * - `serverBacked`: o dado do widget vem da página no servidor (chave presente
 *   no InitialServerDataProvider) — portanto um router.refresh() o atualiza.
 * - Só dispensa a busca quando as DUAS condições valem: o dado é abastecido
 *   pelo servidor E o emissor avisou que vai chamar router.refresh(). Em
 *   qualquer outro caso (sync offline, eventos sem detalhe, widget fora do
 *   Dashboard) o widget atualiza sozinho, como sempre.
 */
export function shouldWidgetRefreshOnSaved(event: Event, serverBacked: boolean): boolean {
  return !(serverBacked && isServerRefreshPending(event))
}

export function readStudySessionSaved(event: Event): SavedStudySession | null {
  const detail = (event as CustomEvent<{ session?: SavedStudySession }>).detail
  const session = detail?.session
  return session?.id ? session : null
}

/**
 * Fase C (offline-first) — item 6/13: eventos ADITIVOS, separados de
 * STUDY_SESSION_SAVED_EVENT de propósito. Um estudo enfileirado offline
 * ainda NÃO foi salvo no servidor — disparar o evento de "salvo" para ele
 * faria Dashboard/Planejamento/Ciclo tentarem recarregar dados do servidor
 * sem necessidade (e sem sucesso, estando offline). Por enquanto só o
 * Histórico (item 6 do pedido) reage a estes dois eventos; os demais
 * widgets continuam ouvindo só STUDY_SESSION_SAVED_EVENT, disparado pelo
 * sync worker quando a operação realmente é confirmada pelo servidor.
 */
export const STUDY_SESSION_QUEUED_EVENT = "study-session-queued"

export function dispatchStudySessionQueued(session: SavedStudySession & { _offlinePending: true; _operationId: string }) {
  window.dispatchEvent(new CustomEvent(STUDY_SESSION_QUEUED_EVENT, { detail: { session } }))
}

export function readStudySessionQueued(event: Event): SavedStudySession | null {
  const detail = (event as CustomEvent<{ session?: SavedStudySession }>).detail
  const session = detail?.session
  return session?.id ? session : null
}

/** Disparado quando uma operação enfileirada é finalmente sincronizada (com sucesso OU descartada) — permite remover o placeholder local sem duplicar. */
export const STUDY_SESSION_OFFLINE_RESOLVED_EVENT = "study-session-offline-resolved"

export function dispatchStudySessionOfflineResolved(operationId: string) {
  window.dispatchEvent(
    new CustomEvent(STUDY_SESSION_OFFLINE_RESOLVED_EVENT, { detail: { operationId } }),
  )
}

export function readStudySessionOfflineResolved(event: Event): string | null {
  const detail = (event as CustomEvent<{ operationId?: string }>).detail
  return detail?.operationId ?? null
}
