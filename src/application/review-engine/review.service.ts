// ============================================================================
// Serviço de Revisões (Fase I.1) — orquestra domínio + repositório.
//
// Regras desta camada:
//   • o agendamento vem SEMPRE do ReviewScheduler (porta de domínio); nenhuma
//     fórmula, peso ou intervalo fixo aparece aqui;
//   • nada é inventado: sem itens, a fila é vazia e a retenção é null;
//   • a mesma resposta reenviada não é aplicada duas vezes (client_operation_id)
//     e duas abas não sobrescrevem o estado em silêncio (controle otimista).
// ============================================================================

import { revalidatePath } from "next/cache"

import { invalidateStatisticsCenterCache } from "@/application/study-analytics/statistics-center.action"
import { registerStudyToCycle } from "@/application/study-cycle/cycle-study-registration.service"
import { HISTORY_PATHS } from "@/application/study-history/study-history.constants"
import {
  REVIEW_GRADE_LABEL,
  type ReviewCard,
  type ReviewGrade,
  type ReviewItem,
  type ReviewItemView,
  type ReviewSessionReport,
  type ReviewSessionState,
  type ReviewSourceType,
  type ReviewsOverview,
} from "@/domain/reviews/models"
import { DEFAULT_DESIRED_RETENTION, type ReviewScheduler } from "@/domain/reviews/review-scheduler"
import { reviewSessionMinutes, reviewSessionSeconds } from "@/domain/reviews/session-duration"
import { reviewScheduler } from "@/infrastructure/reviews/fsrs-scheduler"
import {
  endOfDayInSaoPauloMs,
  getDayInSaoPaulo,
  startOfDayInSaoPauloMs,
  todayKeyInSaoPaulo,
} from "@/lib/sao-paulo"

import { formatDueDistance, retentionFromGrades, reviewBucketOf } from "./review-queue"
import * as repo from "./review.repository"

export type Supabase = repo.Supabase

/** Janela usada para a retenção medida (mesma do restante do app). */
const RETENTION_WINDOW_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000

interface DayWindow {
  todayKey: string
  dayStartIso: string
  dayEndIso: string
}

/** Limites do dia no fuso de São Paulo (o vencimento é tratado em dias). */
function dayWindow(nowIso: string): DayWindow {
  const todayKey = getDayInSaoPaulo(nowIso) || todayKeyInSaoPaulo()
  return {
    todayKey,
    dayStartIso: new Date(startOfDayInSaoPauloMs(todayKey)).toISOString(),
    dayEndIso: new Date(endOfDayInSaoPauloMs(todayKey)).toISOString(),
  }
}

function toView(
  item: ReviewItem,
  names: repo.ResolvedNames,
): ReviewItemView {
  const resolved = names.titleBySource.get(item.sourceId)
  return {
    id: item.id,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    // Sem nome resolvido o conteúdo de origem não existe mais; dizemos isso, em
    // vez de inventar um título.
    title: resolved?.title ?? "Conteúdo removido do edital",
    parentTitle: resolved?.parentTitle ?? null,
    disciplineId: item.disciplineId,
    disciplineName: names.disciplineNames.get(item.disciplineId) ?? "Disciplina",
    state: item.memory.state,
    dueAt: item.memory.dueAt,
    lastReviewAt: item.memory.lastReviewAt,
    reps: item.memory.reps,
    lapses: item.memory.lapses,
    stability: item.memory.stability,
    suspendedAt: item.suspendedAt,
    archivedAt: item.archivedAt,
  }
}

async function toViews(supabase: Supabase, items: ReviewItem[]): Promise<ReviewItemView[]> {
  if (items.length === 0) return []
  const names = await repo.resolveNames(supabase, items)
  return items.map((item) => toView(item, names))
}

// ─── Visão geral da página ───────────────────────────────────────────────────

export async function getReviewsOverview(
  supabase: Supabase,
  userId: string,
  nowIso: string,
): Promise<ReviewsOverview> {
  const { dayStartIso, dayEndIso } = dayWindow(nowIso)
  const sinceIso = new Date(new Date(nowIso).getTime() - RETENTION_WINDOW_DAYS * DAY_MS).toISOString()

  const [counts, overdue, today, newItems, upcoming, suspended, archived, grades, activeSession] =
    await Promise.all([
      repo.countBuckets(supabase, userId, dayStartIso, dayEndIso),
      repo.listDueGroup(supabase, userId, "OVERDUE", dayStartIso, dayEndIso, repo.LIST_LIMIT),
      repo.listDueGroup(supabase, userId, "TODAY", dayStartIso, dayEndIso, repo.LIST_LIMIT),
      repo.listDueGroup(supabase, userId, "NEW", dayStartIso, dayEndIso, repo.LIST_LIMIT),
      repo.listUpcoming(supabase, userId, dayEndIso, 20),
      repo.listFlagged(supabase, userId, "suspended_at", 20),
      repo.listFlagged(supabase, userId, "archived_at", 20),
      repo.recentGrades(supabase, userId, sinceIso),
      repo.findActiveSession(supabase, userId),
    ])

  // Fase I.5 (achado A2): `null` de qualquer uma dessas leituras quer dizer que a
  // consulta NÃO respondeu. Nesse caso a visão geral inteira entra em estado de
  // erro (`counts: null`) em vez de montar uma página de zeros: cinco números
  // certos e um zero inventado enganam mais do que dizer "não foi possível ler".
  const readFailed =
    counts === null ||
    overdue === null ||
    today === null ||
    newItems === null ||
    upcoming === null ||
    suspended === null ||
    archived === null ||
    grades === null

  if (readFailed) {
    return {
      counts: null,
      due: [],
      upcoming: [],
      suspended: [],
      archived: [],
      nextDueAt: null,
      retention: { rate: null, answered: 0 },
      hasActiveSession: activeSession !== null,
    }
  }

  // A ordem da fila é dada pela concatenação dos grupos (atrasadas → hoje →
  // novas), cada um já ordenado por vencimento e id no banco.
  const due = [...overdue, ...today, ...newItems].slice(0, repo.LIST_LIMIT)
  const [dueViews, upcomingViews, suspendedViews, archivedViews] = await Promise.all([
    toViews(supabase, due),
    toViews(supabase, upcoming),
    toViews(supabase, suspended),
    toViews(supabase, archived),
  ])

  // Só faz sentido anunciar a próxima revisão quando não há fila para agora.
  // Falha nessa leitura também é erro de carregamento, não "sem próxima".
  let nextDueAt: string | null = null
  if (due.length === 0) {
    const next = await repo.nextDueAfter(supabase, userId, dayEndIso)
    if (next === null) {
      return {
        counts: null,
        due: [],
        upcoming: [],
        suspended: [],
        archived: [],
        nextDueAt: null,
        retention: { rate: null, answered: 0 },
        hasActiveSession: activeSession !== null,
      }
    }
    nextDueAt = next.dueAt
  }

  return {
    counts,
    due: dueViews,
    upcoming: upcomingViews,
    suspended: suspendedViews,
    archived: archivedViews,
    nextDueAt,
    retention: retentionFromGrades(grades),
    hasActiveSession: activeSession !== null,
  }
}

// ─── Adicionar conteúdo do edital à revisão ──────────────────────────────────

export interface AddToReviewResult {
  item: ReviewItemView | null
  alreadyExisted: boolean
  error: string | null
}

/**
 * Cria o item de revisão de um tópico/subtópico do edital. Nasce NOVO, vencendo
 * agora, sem intervalo inventado. Idempotente: clicar duas vezes devolve o
 * mesmo item (unicidade por user + origem).
 */
export async function addEditalContentToReview(
  supabase: Supabase,
  userId: string,
  sourceType: ReviewSourceType,
  sourceId: string,
  nowIso: string,
  scheduler: ReviewScheduler = reviewScheduler,
): Promise<AddToReviewResult> {
  const source = await repo.resolveEditalSource(supabase, sourceType, sourceId)
  if (!source) {
    return { item: null, alreadyExisted: false, error: "Conteúdo não encontrado no edital." }
  }

  const existing = await repo.findItemBySource(supabase, userId, sourceType, sourceId)
  if (existing) {
    const views = await toViews(supabase, [existing])
    return { item: views[0] ?? null, alreadyExisted: true, error: null }
  }

  const inserted = await repo.insertItem(supabase, {
    userId,
    disciplineId: source.disciplineId,
    sourceType,
    sourceId,
    memory: scheduler.newMemory(nowIso),
    nowIso,
  })

  if (inserted.duplicate) {
    // Corrida entre dois cliques: o item existe, então devolvemos ele.
    const again = await repo.findItemBySource(supabase, userId, sourceType, sourceId)
    const views = again ? await toViews(supabase, [again]) : []
    return { item: views[0] ?? null, alreadyExisted: true, error: null }
  }
  if (inserted.error || !inserted.item) {
    return { item: null, alreadyExisted: false, error: inserted.error ?? "Erro ao adicionar à revisão." }
  }

  const views = await toViews(supabase, [inserted.item])
  return { item: views[0] ?? null, alreadyExisted: false, error: null }
}

// ─── Sessão de revisão ───────────────────────────────────────────────────────

async function buildCard(
  supabase: Supabase,
  item: ReviewItem,
  nowIso: string,
  todayKey: string,
  scheduler: ReviewScheduler,
): Promise<ReviewCard> {
  const [view] = await toViews(supabase, [item])
  const forecast = scheduler.forecast(item.memory, nowIso, DEFAULT_DESIRED_RETENTION)
  return {
    itemId: item.id,
    sourceType: item.sourceType,
    title: view?.title ?? "Conteúdo removido do edital",
    parentTitle: view?.parentTitle ?? null,
    disciplineName: view?.disciplineName ?? "Disciplina",
    state: item.memory.state,
    bucket: reviewBucketOf(item.memory.dueAt, item.memory.reps, todayKey),
    dueAt: item.memory.dueAt,
    reps: item.memory.reps,
    lapses: item.memory.lapses,
    previews: forecast.map((entry) => ({
      grade: entry.grade,
      label: REVIEW_GRADE_LABEL[entry.grade],
      preview: formatDueDistance(entry.dueAt, nowIso),
    })),
  }
}

/** Quantos itens ainda há para revisar. `null` quando a contagem não pôde ser lida. */
async function remainingDue(
  supabase: Supabase,
  userId: string,
  window: DayWindow,
): Promise<number | null> {
  const counts = await repo.countBuckets(supabase, userId, window.dayStartIso, window.dayEndIso)
  if (counts === null) return null
  return counts.overdue + counts.today + counts.newItems
}

export interface SessionResult {
  data: ReviewSessionState | null
  error: string | null
}

/**
 * Abre a sessão (ou retoma a que estava aberta) e devolve o primeiro item da
 * fila. `itemId` permite revisar um item específico antes do vencimento
 * (revisão antecipada) — quem calcula o efeito disso é o agendador.
 */
export async function startReviewSession(
  supabase: Supabase,
  userId: string,
  options: { itemId?: string | null } = {},
  nowIso: string = new Date().toISOString(),
  scheduler: ReviewScheduler = reviewScheduler,
): Promise<SessionResult> {
  const window = dayWindow(nowIso)

  let session = await repo.findActiveSession(supabase, userId)
  if (!session) {
    const created = await repo.createSession(supabase, userId, nowIso)
    if (created.duplicate) session = await repo.findActiveSession(supabase, userId)
    else if (created.error) return { data: null, error: created.error }
    else session = created.session
  }
  if (!session) return { data: null, error: "Não foi possível abrir a sessão de revisão." }

  let item: ReviewItem | null
  if (options.itemId) {
    item = await repo.findItemById(supabase, userId, options.itemId)
    if (!item) return { data: null, error: "Item de revisão não encontrado." }
  } else {
    const next = await repo.nextDueItem(supabase, userId, window.dayStartIso, window.dayEndIso)
    // Fase I.5 (A2): falha na leitura da fila é erro, não "nada para revisar".
    if (next === null) return { data: null, error: "Não foi possível carregar a fila de revisão." }
    item = next.item
  }

  if (item && (item.suspendedAt || item.archivedAt)) {
    return { data: null, error: "Este item está suspenso ou arquivado." }
  }

  return {
    data: {
      sessionId: session.id,
      itemsAnswered: session.itemsAnswered,
      remaining: await remainingDue(supabase, userId, window),
      card: item ? await buildCard(supabase, item, nowIso, window.todayKey, scheduler) : null,
    },
    error: null,
  }
}

export async function getActiveReviewSession(
  supabase: Supabase,
  userId: string,
  nowIso: string = new Date().toISOString(),
  scheduler: ReviewScheduler = reviewScheduler,
): Promise<SessionResult> {
  const session = await repo.findActiveSession(supabase, userId)
  if (!session) return { data: null, error: null }

  const window = dayWindow(nowIso)
  const next = await repo.nextDueItem(supabase, userId, window.dayStartIso, window.dayEndIso)
  if (next === null) return { data: null, error: "Não foi possível carregar a fila de revisão." }
  const item = next.item
  return {
    data: {
      sessionId: session.id,
      itemsAnswered: session.itemsAnswered,
      remaining: await remainingDue(supabase, userId, window),
      card: item ? await buildCard(supabase, item, nowIso, window.todayKey, scheduler) : null,
    },
    error: null,
  }
}

export interface AnswerInput {
  sessionId: string
  itemId: string
  grade: ReviewGrade
  durationSeconds: number
  /** Id gerado pelo cliente: reenviar a mesma resposta não gera outro evento. */
  clientOperationId: string
}

export interface AnswerOutcome {
  /** A operação já havia sido registrada antes (retry). */
  duplicate: boolean
  /** Outra resposta chegou primeiro para este item; o cliente deve recarregar. */
  conflict: boolean
  session: ReviewSessionState | null
  error: string | null
}

/**
 * Registra a resposta: agenda (FSRS) → grava o item (controle otimista) →
 * grava o evento (idempotente) → atualiza o contador da sessão.
 */
export async function answerReviewCard(
  supabase: Supabase,
  userId: string,
  input: AnswerInput,
  nowIso: string = new Date().toISOString(),
  scheduler: ReviewScheduler = reviewScheduler,
): Promise<AnswerOutcome> {
  const window = dayWindow(nowIso)
  const session = await repo.findSessionById(supabase, userId, input.sessionId)
  if (!session || session.status !== "ACTIVE") {
    return { duplicate: false, conflict: false, session: null, error: "Sessão de revisão não está aberta." }
  }

  // 1. Idempotência: a mesma operação nunca é aplicada duas vezes.
  const already = await repo.findEventByOperation(supabase, userId, input.clientOperationId)
  if (already) {
    return {
      duplicate: true,
      conflict: false,
      session: await sessionState(supabase, userId, input.sessionId, window, nowIso, scheduler),
      error: null,
    }
  }

  const item = await repo.findItemById(supabase, userId, input.itemId)
  if (!item) return { duplicate: false, conflict: false, session: null, error: "Item de revisão não encontrado." }
  if (item.suspendedAt || item.archivedAt) {
    return { duplicate: false, conflict: false, session: null, error: "Este item está suspenso ou arquivado." }
  }

  // 2. Agendamento real (biblioteca FSRS atrás da porta de domínio).
  const { memory, event } = scheduler.schedule({
    memory: item.memory,
    grade: input.grade,
    now: nowIso,
    desiredRetention: DEFAULT_DESIRED_RETENTION,
  })

  // 3. Controle otimista: só grava se o item ainda estiver no estado que lemos.
  const applied = await repo.applyMemory(supabase, userId, item.id, item.memory.reps, memory, nowIso)
  if (!applied) {
    return {
      duplicate: false,
      conflict: true,
      session: await sessionState(supabase, userId, input.sessionId, window, nowIso, scheduler),
      error: null,
    }
  }

  // 4. Evento imutável. Se outra requisição gravou a mesma operação no meio,
  // o índice único acusa e tratamos como repetição (sem segundo evento).
  const inserted = await repo.insertEvent(supabase, {
    userId,
    itemId: item.id,
    sessionId: input.sessionId,
    event,
    durationSeconds: input.durationSeconds,
    clientOperationId: input.clientOperationId,
  })
  if (inserted.error) return { duplicate: false, conflict: false, session: null, error: inserted.error }

  // 5. Contador da sessão = quantos eventos ela tem (sempre o número real).
  //
  // Fase I.5 (A3/M4): se a contagem não puder ser lida, NÃO gravamos nada. Antes,
  // erro virava 0 e esse 0 era persistido em `review_sessions.items_answered` —
  // a resposta do aluno ficava registrada no histórico e a sessão dizia "0
  // respondidas". Mantendo o valor anterior, a próxima resposta corrige o número
  // (ele é sempre recontado a partir dos eventos).
  const answered = await repo.countSessionAnswers(supabase, userId, input.sessionId)
  if (answered !== null) {
    await repo.setSessionAnswered(supabase, userId, input.sessionId, answered)
  }

  return {
    duplicate: inserted.duplicate,
    conflict: false,
    session: await sessionState(supabase, userId, input.sessionId, window, nowIso, scheduler),
    error: null,
  }
}

async function sessionState(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  window: DayWindow,
  nowIso: string,
  scheduler: ReviewScheduler,
): Promise<ReviewSessionState> {
  const [session, next, remaining] = await Promise.all([
    repo.findSessionById(supabase, userId, sessionId),
    repo.nextDueItem(supabase, userId, window.dayStartIso, window.dayEndIso),
    remainingDue(supabase, userId, window),
  ])
  // `next === null` = a fila não pôde ser lida: o cliente recebe card nulo com
  // `remaining` também nulo, para não anunciar "0 na fila" por erro.
  const item = next?.item ?? null
  return {
    sessionId,
    itemsAnswered: session?.itemsAnswered ?? null,
    remaining: next === null ? null : remaining,
    card: item ? await buildCard(supabase, item, nowIso, window.todayKey, scheduler) : null,
  }
}

/**
 * Conclui a sessão: marca COMPLETED e grava o tempo real como estudo
 * (study_history, study_type REVISAO / study_source REVIEW), reconciliando o
 * ciclo pelo mecanismo central único (decisão D4).
 *
 * A trava de idempotência é o próprio UPDATE condicional (compare-and-swap):
 * duas chamadas quase simultâneas para a mesma sessão — o botão "encerrar" numa
 * aba e o encerramento automático na outra — não podem inserir duas linhas em
 * study_history, duplicando o tempo de estudo no Histórico/Estatísticas/Ciclo.
 */
export interface FinalizeSessionResult {
  cycleSyncError: string | null
  /** `true` quando ESTA chamada encerrou a sessão (a segunda chamada devolve `false`). */
  completed?: boolean
  /**
   * Erro controlado: a sessão continua ACTIVE e pode ser encerrada de novo.
   * Nunca é usado para "sessão já encerrada" — isso é caminho normal.
   */
  error?: string | null
}

export async function finalizeSession(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  nowIso: string = new Date().toISOString(),
): Promise<FinalizeSessionResult> {
  const session = await repo.findSessionById(supabase, userId, sessionId)
  if (!session || session.status !== "ACTIVE") return { cycleSyncError: null }

  // ── Fase I.5 (achado A3): TUDO o que precisa ser lido é lido ANTES de encerrar.
  //
  // O fluxo antigo marcava a sessão COMPLETED e só então lia as respostas. Se a
  // leitura falhasse, ela devolvia `[]`, o estudo não era gravado e a sessão já
  // não estava ACTIVE — a segunda tentativa caía na trava de idempotência e o
  // tempo real de revisão era perdido em silêncio. Agora, falha de leitura
  // devolve erro controlado com a sessão intacta: o aluno tenta de novo e nada
  // se perde.
  const answers = await repo.listSessionAnswers(supabase, userId, sessionId)
  if (answers === null) {
    return {
      cycleSyncError: null,
      completed: false,
      error: "Não foi possível ler as respostas desta sessão. Ela continua aberta — tente encerrar novamente.",
    }
  }

  let disciplineIds: string[] = []
  if (answers.length > 0) {
    const read = await repo.disciplinesOfItems(
      supabase,
      userId,
      [...new Set(answers.map((a) => a.reviewItemId))],
    )
    if (read === null) {
      return {
        cycleSyncError: null,
        completed: false,
        error: "Não foi possível identificar a disciplina desta sessão. Ela continua aberta — tente encerrar novamente.",
      }
    }
    disciplineIds = read
  }

  // ── Só agora a sessão é encerrada. O compare-and-swap continua sendo a trava
  // de idempotência: duas chamadas quase simultâneas não gravam dois estudos.
  const { data: claimedSession } = await supabase
    .from("review_sessions")
    .update({ status: "COMPLETED", finished_at: nowIso })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .select("id")
    .maybeSingle()

  if (!claimedSession) return { cycleSyncError: null }

  let cycleSyncError: string | null = null

  if (answers.length > 0) {
    const countByDiscipline = new Map<string, number>()
    disciplineIds.forEach((id) => countByDiscipline.set(id, (countByDiscipline.get(id) ?? 0) + 1))
    // Disciplina do estudo = a mais revisada na sessão (empate: id menor, para
    // ser determinístico). Nunca uma disciplina inventada.
    const mainDiscipline = [...countByDiscipline.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
    )[0]?.[0]

    if (mainDiscipline) {
      const startedAt = session.startedAt
      // Fase I.6 (M8): uma regra só de duração, em domain/reviews/session-duration.
      const totalSeconds = reviewSessionSeconds(startedAt, nowIso)
      const durationMinutes = reviewSessionMinutes(totalSeconds)

      const { error: historyError } = await supabase.from("study_history").insert({
        user_id: userId,
        discipline_id: mainDiscipline,
        study_source: "REVIEW",
        study_type: "REVISAO",
        technique: null,
        active_minutes: durationMinutes,
        paused_minutes: 0,
        duration_minutes: durationMinutes,
        completed: true,
        interrupted: false,
        started_at: startedAt,
        finished_at: nowIso,
        notes: `Sessão de revisão — ${answers.length} ${answers.length === 1 ? "item" : "itens"}`,
        metadata: {
          duration_seconds: totalSeconds,
          review_session_id: sessionId,
          reviews_completed: answers.length,
        },
      })

      if (!historyError) {
        // Todo estudo real passa pelo mecanismo central do ciclo — revisão não
        // é exceção (decisão D4). A falha é reportada, nunca engolida.
        const cycleResult = await registerStudyToCycle()
        for (const path of HISTORY_PATHS) revalidatePath(path)
        await invalidateStatisticsCenterCache(userId)
        if (!cycleResult.success) {
          cycleSyncError = cycleResult.error || "Estudo salvo, mas o ciclo não foi atualizado."
          console.error("[Revisões] Sessão salva, mas o ciclo não foi atualizado:", cycleResult.error)
        }
      } else {
        console.error("[Revisões] Erro ao gravar o estudo da sessão de revisão:", historyError)
      }
    }
  }

  return { cycleSyncError, completed: true }
}

/** Resumo real da sessão encerrada (nada é estimado). */
export async function finishReviewSession(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  nowIso: string = new Date().toISOString(),
): Promise<{ data: ReviewSessionReport | null; error: string | null }> {
  const before = await repo.findSessionById(supabase, userId, sessionId)
  if (!before) return { data: null, error: "Sessão de revisão não encontrada." }

  // Fase I.5 (A3): erro de leitura não vira "sessão sem respostas". Sem as
  // respostas não há relatório nem encerramento — a sessão fica aberta e o aluno
  // pode tentar de novo, com o estudo preservado.
  const answers = await repo.listSessionAnswers(supabase, userId, sessionId)
  if (answers === null) {
    return {
      data: null,
      error: "Não foi possível ler as respostas desta sessão. Ela continua aberta — tente encerrar novamente.",
    }
  }

  const finalize = await finalizeSession(supabase, userId, sessionId, nowIso)
  if (finalize.error) return { data: null, error: finalize.error }
  const cycleSyncError = finalize.cycleSyncError

  // Fase I.6 (M8): o MESMO cálculo da gravação — o aluno vê o que foi gravado.
  const durationMinutes = reviewSessionMinutes(reviewSessionSeconds(before.startedAt, nowIso))
  const window = dayWindow(nowIso)

  return {
    data: {
      itemsAnswered: answers.length,
      remembered: answers.filter((a) => a.grade >= 2).length,
      forgot: answers.filter((a) => a.grade === 1).length,
      durationMinutes,
      nextDueAt: (await repo.nextDueAfter(supabase, userId, window.dayEndIso))?.dueAt ?? null,
      studyRegistered: answers.length > 0,
      cycleSyncError,
    },
    error: null,
  }
}

export async function discardReviewSession(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  nowIso: string = new Date().toISOString(),
): Promise<{ discarded: boolean }> {
  return { discarded: await repo.discardSession(supabase, userId, sessionId, nowIso) }
}

// ─── Suspender / arquivar (o histórico nunca é apagado) ──────────────────────

export type ReviewItemFlagAction = "SUSPEND" | "UNSUSPEND" | "ARCHIVE" | "RESTORE"

export async function setReviewItemFlag(
  supabase: Supabase,
  userId: string,
  itemId: string,
  action: ReviewItemFlagAction,
  nowIso: string = new Date().toISOString(),
): Promise<{ ok: boolean; error: string | null }> {
  const field: "suspended_at" | "archived_at" =
    action === "SUSPEND" || action === "UNSUSPEND" ? "suspended_at" : "archived_at"
  const value = action === "SUSPEND" || action === "ARCHIVE" ? nowIso : null
  const ok = await repo.setItemFlag(supabase, userId, itemId, field, value, nowIso)
  return { ok, error: ok ? null : "Item de revisão não encontrado." }
}

// ─── Catálogo para adicionar conteúdo ────────────────────────────────────────

export interface ReviewCatalogTopic {
  id: string
  name: string
  inReview: boolean
  subtopics: { id: string; name: string; inReview: boolean }[]
}

export interface ReviewCatalog {
  disciplines: repo.CatalogDiscipline[]
  disciplineId: string | null
  topics: ReviewCatalogTopic[]
  /**
   * Fase I.6: `true` quando a leitura do catálogo FALHOU. A UI mostra erro em vez
   * de "Nenhuma disciplina cadastrada" — erro não é ausência de disciplina.
   */
  loadError: boolean
}

export async function getReviewCatalog(
  supabase: Supabase,
  userId: string,
  disciplineId: string | null,
): Promise<ReviewCatalog> {
  const failed: ReviewCatalog = {
    disciplines: [],
    disciplineId: null,
    topics: [],
    loadError: true,
  }

  const disciplines = await repo.listUserDisciplines(supabase, userId)
  if (disciplines === null) return failed

  const selected = disciplineId ?? disciplines[0]?.id ?? null
  if (!selected) return { disciplines, disciplineId: null, topics: [], loadError: false }

  const tree = await repo.listTopicTree(supabase, selected)
  if (tree === null) return failed
  const existing = await repo.listExistingSourceIds(supabase, userId, selected)

  return {
    disciplines,
    disciplineId: selected,
    loadError: false,
    topics: tree.map((topic) => ({
      id: topic.id,
      name: topic.name,
      inReview: existing.has(topic.id),
      subtopics: topic.subtopics.map((sub) => ({
        id: sub.id,
        name: sub.name,
        inReview: existing.has(sub.id),
      })),
    })),
  }
}
