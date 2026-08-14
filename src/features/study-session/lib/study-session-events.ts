import type { StudyHistory } from "@/domain/study-history/study-history.types"

/** Sessão real retornada pelo banco (com disciplina embutida), usada para atualizar o Histórico localmente. */
export type SavedStudySession = StudyHistory & {
  disciplines?: {
    id?: string
    name?: string
    area?: string | null
    color_hex?: string | null
  } | null
}

/** Evento global disparado pelo modal após salvar/editar uma sessão com sucesso. */
export const STUDY_SESSION_SAVED_EVENT = "study-session-saved"

export function dispatchStudySessionSaved(session: SavedStudySession) {
  window.dispatchEvent(new CustomEvent(STUDY_SESSION_SAVED_EVENT, { detail: { session } }))
}

export function readStudySessionSaved(event: Event): SavedStudySession | null {
  const detail = (event as CustomEvent<{ session?: SavedStudySession }>).detail
  const session = detail?.session
  return session?.id ? session : null
}
