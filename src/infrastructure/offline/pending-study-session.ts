import { buildIsoFromSaoPauloDateTime } from "@/lib/sao-paulo"
import {
  studyMinutesFromMinutesInput,
  studyMinutesFromMs,
} from "@/domain/study-session/study-duration"
import type { StudyHistory } from "@/domain/study-history/study-history.types"

/**
 * Sessão de estudo "pendente de sincronização" — construída inteiramente no
 * cliente, a partir do MESMO payload que seria enviado a `saveStudySessionAction`
 * (Fase C, item 3: "não criar um novo formato incompatível com a action").
 *
 * Nunca é o registro oficial: é só o suficiente para o Histórico mostrar o
 * estudo imediatamente, sem depender do Supabase (item 6 do pedido). Quando a
 * sincronização terminar com sucesso, o registro real (vindo do servidor)
 * substitui este.
 */
export type PendingStudySession = StudyHistory & {
  disciplines?: {
    id?: string
    name?: string
    area?: string | null
    color_hex?: string | null
  } | null
  /** Marca que este item ainda não existe no servidor — só existe no IndexedDB local. */
  _offlinePending: true
  /** operationId da fila (sync_queue) que vai gerar o registro real quando sincronizar. */
  _operationId: string
}

/**
 * G2.3 — instante em que a sessão efetivamente terminou (Encerrar
 * pressionado). A tela de avaliação mantém o timer pausado; sem isso, o
 * tempo parado na avaliação inflava `paused` (foco% salvo menor que o
 * exibido). Válido só quando é um passado próximo e posterior ao início.
 */
function resolveEndTimeMs(payload: Record<string, unknown>, startTime: number): number {
  const now = Date.now()
  const raw = Number(payload["evaluationStartedAt"] ?? payload["evaluation_started_at"] ?? NaN)
  if (Number.isFinite(raw) && raw > startTime && raw <= now) return raw
  return now
}

function resolveMinutes(payload: Record<string, unknown>): {
  activeMinutes: number
  pausedMinutes: number
} {
  if (payload["is_manual_mode"]) {
    return {
      activeMinutes: studyMinutesFromMinutesInput(payload["activeMinutes"]),
      pausedMinutes: studyMinutesFromMinutesInput(payload["pausedMinutes"]),
    }
  }

  if (payload["sessionStartTime"]) {
    const startTime = Number(payload["sessionStartTime"])
    const now = resolveEndTimeMs(payload, startTime)
    let totalPausedMs = Number(payload["sessionTotalPausedMs"] || 0)
    const lastPauseStartTime = Number(payload["sessionLastPauseStartTime"])
    if (lastPauseStartTime > 0) {
      totalPausedMs += Math.max(0, now - lastPauseStartTime)
    }
    const totalElapsedMs = now - startTime
    const activeMs = Math.max(0, totalElapsedMs - totalPausedMs)
    return {
      activeMinutes: studyMinutesFromMs(activeMs),
      pausedMinutes: studyMinutesFromMs(totalPausedMs),
    }
  }

  // Fallback: snapshot já trazia os minutos calculados (activeSeconds/60).
  return {
    activeMinutes: studyMinutesFromMinutesInput(payload["activeMinutes"]),
    pausedMinutes: studyMinutesFromMinutesInput(payload["pausedMinutes"]),
  }
}

function resolveTimestamps(
  payload: Record<string, unknown>,
  activeMinutes: number,
): { startedAt: string; finishedAt: string } {
  if (!payload["is_manual_mode"] && payload["sessionStartTime"]) {
    const startTime = Number(payload["sessionStartTime"])
    return {
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date(resolveEndTimeMs(payload, startTime)).toISOString(),
    }
  }

  if (payload["study_date"]) {
    const startedAt = buildIsoFromSaoPauloDateTime(
      String(payload["study_date"]),
      payload["study_time"] ? String(payload["study_time"]) : null,
    )
    const durationMs = activeMinutes * 60 * 1000
    return {
      startedAt,
      finishedAt: new Date(new Date(startedAt).getTime() + durationMs).toISOString(),
    }
  }

  const now = new Date().toISOString()
  const durationMs = activeMinutes * 60 * 1000
  return {
    startedAt: now,
    finishedAt: new Date(new Date(now).getTime() + durationMs).toISOString(),
  }
}

/** Mesmo mapeamento de `saveStudySessionAction` (item 3: reaproveitar, não reinventar). */
const STUDY_SOURCE_MAP: Record<string, string> = {
  TEORIA: "FREE",
  QUESTOES: "QUESTOES",
  REVISAO: "REVIEW",
  AUDIO: "FREE",
  VIDEOAULA: "VIDEO",
  SIMULADO: "SIMULADO",
  OUTRO: "FREE",
  RESUMO: "FREE",
  MAPA_MENTAL: "FREE",
  FLASHCARDS: "FREE",
  LEITURA: "FREE",
  LEI_SECA: "FREE",
  JURISPRUDENCIA: "FREE",
  INFORMATIVOS: "FREE",
  DOUTRINA: "FREE",
  MONITORIA: "FREE",
  ESTUDO_IA: "FREE",
  DISCUSSAO: "FREE",
}

function resolveStudySource(payload: Record<string, unknown>): StudyHistory["study_source"] {
  const explicit = payload["study_source"] ? String(payload["study_source"]) : null
  const allowed = ["PLAN", "FREE", "REVIEW", "SIMULADO", "QUESTOES", "VIDEO", "PDF"]
  if (explicit && allowed.includes(explicit)) return explicit as StudyHistory["study_source"]
  return (STUDY_SOURCE_MAP[String(payload["studyType"])] || "FREE") as StudyHistory["study_source"]
}

/**
 * Constrói o objeto "pendente" para exibição imediata no Histórico (item 6)
 * enquanto a operação real espera na fila (item 3, 4, 5).
 */
export function buildPendingStudySession(
  payload: Record<string, unknown>,
  operationId: string,
  userId: string,
): PendingStudySession {
  const { activeMinutes, pausedMinutes } = resolveMinutes(payload)
  const { startedAt, finishedAt } = resolveTimestamps(payload, activeMinutes)
  const disciplineId = payload["discipline_id"] ? String(payload["discipline_id"]) : ""
  const disciplineName = payload["discipline_name"] ? String(payload["discipline_name"]) : null
  const interrupted = Boolean(payload["interrupted"])

  return {
    id: `pending:${operationId}`,
    user_id: userId,
    discipline_id: disciplineId,
    study_plan_item_id: payload["study_plan_item_id"] ? String(payload["study_plan_item_id"]) : null,
    study_source: resolveStudySource(payload),
    study_type: (payload["studyType"] as StudyHistory["study_type"]) ?? null,
    technique: (payload["technique"] as StudyHistory["technique"]) ?? null,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_minutes: activeMinutes,
    active_minutes: activeMinutes,
    paused_minutes: pausedMinutes,
    planned_minutes:
      payload["planned_minutes"] !== undefined && payload["planned_minutes"] !== null
        ? Math.max(0, Math.round(Number(payload["planned_minutes"])))
        : null,
    completed: !interrupted,
    interrupted,
    energy_level: (payload["energy_level"] as number) ?? null,
    difficulty: null,
    focus_score: null,
    mood: null,
    notes: (payload["notes"] as string) ?? null,
    metadata: {
      pages_read: payload["pages_read"] || 0,
      questions_answered: payload["questions_answered"] || 0,
      questions_correct: payload["questions_correct"] || 0,
      flashcards_reviewed: payload["flashcards_reviewed"] || 0,
      flashcards_correct: payload["flashcards_correct"] || 0,
      focus_percentage: payload["focusPercentage"] ?? null,
      is_manual_mode: Boolean(payload["is_manual_mode"]),
    },
    origin_source: null,
    origin_source_name: null,
    origin_imported_at: null,
    import_batch_id: null,
    created_at: new Date().toISOString(),
    disciplines: {
      id: disciplineId,
      name: disciplineName || "Estudo",
      area: null,
      color_hex: null,
    },
    _offlinePending: true,
    _operationId: operationId,
  }
}
