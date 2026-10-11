import {
  DROP_PP,
  GROWTH_PP,
  HIGH_GROWTH_PP,
  LOW_STUDY_MINUTES_PER_WEEK,
  MIN_SIMULADOS_FOR_EVOLUTION,
} from "@/application/simulados/study-performance"
import { formatDurationRaw } from "@/application/study-analytics/engine/stats-engine"
import type {
  ContextQuality,
  ContextQualityLevel,
  MentorInsight,
  MentorPeriod,
  MentorRecommendationCandidate,
  StudentMentorContext,
} from "@/domain/mentor/student-mentor-context"

/**
 * G2.15 — insights e recomendações CANDIDATAS (puro, determinístico).
 *
 * Cada item carrega a evidência numérica que o sustenta. As frases só
 * descrevem números já calculados: nada de causa ("porque"), nada de
 * diagnóstico, nada de ação executada. Os limites abaixo estão documentados
 * em docs/mentor-ai-context.md; os de estudo × desempenho são os MESMOS da
 * G2.11 (importados, não copiados).
 */

/** Revisões vencidas a partir das quais a recomendação vira alta prioridade. */
export const MENTOR_HIGH_OVERDUE_REVIEWS = 5
/** Dias sem estudo a partir dos quais o insight "sem estudo recente" aparece. */
export const MENTOR_NO_RECENT_STUDY_DAYS = 7
/** contextQuality — limites objetivos. */
export const QUALITY_HIGH_SESSIONS_28D = 8
export const QUALITY_MEDIUM_SESSIONS_28D = 3
export const QUALITY_SOLID_HISTORY_SESSIONS = 20
export const QUALITY_HIGH_SIMULADOS = 2

type ContextWithoutDerived = Omit<StudentMentorContext, "contextQuality" | "insights" | "recommendations">
type ContextForInsights = Omit<StudentMentorContext, "insights" | "recommendations">

function pct(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")}%`
}

function pp(v: number): string {
  const abs = Math.abs(v)
  const txt = Number.isInteger(abs) ? String(abs) : abs.toFixed(1).replace(".", ",")
  let sign = ""
  if (v > 0) sign = "+"
  else if (v < 0) sign = "−"
  return `${sign}${txt} p.p.`
}

function brDate(key: string | null): string {
  if (!key) return "—"
  const [y, m, d] = key.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

function period(key: string, ctx: { todayKey: string }, days?: number): MentorPeriod {
  if (!days) return { key, startDate: null, endDate: ctx.todayKey }
  const end = new Date(`${ctx.todayKey}T12:00:00Z`)
  const start = new Date(end.getTime() - (days - 1) * 86_400_000)
  return { key, startDate: start.toISOString().slice(0, 10), endDate: ctx.todayKey }
}

export function computeContextQuality(ctx: ContextWithoutDerived): ContextQuality {
  const signals = {
    totalSessions: ctx.study.totalSessions ?? 0,
    sessionsLast28: ctx.study.last28?.sessions ?? 0,
    simulados: ctx.simulations.count ?? 0,
    activeReviewItems: ctx.reviews.activeItems ?? 0,
    hasCycle: ctx.cycle.status === "OK",
    hasPlan: ctx.planning.status === "OK",
    hasGoal: ctx.goals.weeklyStudy !== null || ctx.goals.weeklyQuestions !== null || ctx.goals.weeklyDays !== null,
  }
  const reasons: string[] = []
  let level: ContextQualityLevel
  const anything =
    signals.totalSessions > 0 || signals.simulados > 0 || signals.activeReviewItems > 0 || signals.hasCycle || signals.hasPlan || signals.hasGoal
  if (!anything) {
    level = "EMPTY"
    reasons.push("Nenhum estudo, simulado, revisão, ciclo, plano ou meta registrados.")
  } else if (
    signals.sessionsLast28 >= QUALITY_HIGH_SESSIONS_28D &&
    signals.simulados >= QUALITY_HIGH_SIMULADOS &&
    signals.totalSessions >= QUALITY_SOLID_HISTORY_SESSIONS
  ) {
    level = "HIGH"
    reasons.push("Estudo recente, histórico consolidado e pelo menos 2 simulados.")
  } else if (
    (signals.sessionsLast28 >= QUALITY_MEDIUM_SESSIONS_28D && (signals.simulados >= 1 || signals.totalSessions >= QUALITY_SOLID_HISTORY_SESSIONS)) ||
    signals.simulados >= QUALITY_HIGH_SIMULADOS
  ) {
    level = "MEDIUM"
    if (signals.simulados < QUALITY_HIGH_SIMULADOS) reasons.push("Menos de 2 simulados: sem evolução de desempenho.")
    if (signals.sessionsLast28 < QUALITY_HIGH_SESSIONS_28D) reasons.push("Poucas sessões nas últimas 4 semanas.")
  } else {
    level = "LOW"
    if (signals.sessionsLast28 < QUALITY_MEDIUM_SESSIONS_28D) reasons.push("Menos de 3 sessões de estudo nas últimas 4 semanas.")
    if (signals.simulados === 0) reasons.push("Nenhum simulado registrado.")
  }
  return { level, signals, reasons }
}

export function buildMentorInsights(ctx: ContextForInsights): MentorInsight[] {
  const out: MentorInsight[] = []
  const add = (i: Omit<MentorInsight, "id">) => out.push({ id: `${i.type}:${i.disciplineId ?? "all"}`, ...i })

  if (ctx.contextQuality.level === "EMPTY") {
    add({
      type: "INSUFFICIENT_DATA",
      priority: "MEDIUM",
      disciplineId: null,
      disciplineName: null,
      period: period("all_time", ctx),
      evidence: { level: "EMPTY" },
      message: "Dados insuficientes para avaliar sua evolução.",
    })
    return out
  }

  const st = ctx.study
  if (st.status === "OK" && st.last7) {
    add({
      type: "STUDY_LAST_7_DAYS",
      priority: "LOW",
      disciplineId: null,
      disciplineName: null,
      period: period("last_7_days", ctx, 7),
      evidence: { minutes: st.last7.minutes, sessions: st.last7.sessions, studiedDays: st.last7.studiedDays },
      message: `Você estudou ${formatDurationRaw(st.last7.minutes)} nos últimos 7 dias (${st.last7.sessions} sessões em ${st.last7.studiedDays} dias).`,
    })
    if (st.previous7 && st.previous7.minutes > 0) {
      const delta = st.last7.minutes - st.previous7.minutes
      add({
        type: "STUDY_TREND_WEEK",
        priority: "LOW",
        disciplineId: null,
        disciplineName: null,
        period: period("last_14_days", ctx, 14),
        evidence: { last7Minutes: st.last7.minutes, previous7Minutes: st.previous7.minutes, deltaMinutes: delta },
        message: `Nos últimos 7 dias foram ${formatDurationRaw(st.last7.minutes)}, contra ${formatDurationRaw(st.previous7.minutes)} nos 7 dias anteriores.`,
      })
    }
    if (st.daysSinceLastStudy !== null && st.daysSinceLastStudy >= MENTOR_NO_RECENT_STUDY_DAYS) {
      add({
        type: "NO_RECENT_STUDY",
        priority: "MEDIUM",
        disciplineId: null,
        disciplineName: null,
        period: period("all_time", ctx),
        evidence: { lastStudyDate: st.lastStudyDate, daysSinceLastStudy: st.daysSinceLastStudy },
        message: `Seu último estudo registrado foi em ${brDate(st.lastStudyDate)} (há ${st.daysSinceLastStudy} dias).`,
      })
    }
  }

  const sim = ctx.simulations
  if (sim.status === "OK" && sim.lastAccuracy !== null) {
    add({
      type: "LAST_SIMULADO",
      priority: "LOW",
      disciplineId: null,
      disciplineName: null,
      period: period("all_time", ctx),
      evidence: { lastAccuracy: sim.lastAccuracy, lastDate: sim.lastDate, simulados: sim.count },
      message: `Seu último simulado foi ${pct(sim.lastAccuracy)} (${brDate(sim.lastDate)}).`,
    })
  }
  if (sim.status === "OK" && (sim.count ?? 0) >= MIN_SIMULADOS_FOR_EVOLUTION && sim.firstToLastPp !== null && sim.firstAccuracy !== null && sim.lastAccuracy !== null) {
    add({
      type: "SIMULADO_EVOLUTION",
      priority: "LOW",
      disciplineId: null,
      disciplineName: null,
      period: period("all_time", ctx),
      evidence: { first: sim.firstAccuracy, last: sim.lastAccuracy, change: sim.firstToLastPp, simulados: sim.count, trend: sim.trend },
      message: `Do primeiro ao último simulado: ${pp(sim.firstToLastPp)} (de ${pct(sim.firstAccuracy)} para ${pct(sim.lastAccuracy)}, ${sim.count} simulados).`,
    })
  }
  const attention = sim.status === "OK" ? sim.bottleneck : null
  if (attention && attention.accuracy !== null) {
    const b = { ...attention, accuracy: attention.accuracy }
    add({
      type: "DISCIPLINE_ATTENTION",
      priority: b.lowData ? "LOW" : "MEDIUM",
      disciplineId: b.disciplineId,
      disciplineName: b.name,
      period: period("all_time", ctx),
      evidence: { accuracy: b.accuracy, reasons: b.reasons, simulados: b.simuladosCount, lowData: b.lowData, overallAccuracy: sim.averageAccuracy },
      message: `${b.name} apresenta média de ${pct(b.accuracy)} nos simulados${b.lowData ? " (ainda com um único simulado)" : ""}.`,
    })
  }
  if (st.status === "OK" && sim.status === "NO_DATA") {
    add({
      type: "INSUFFICIENT_DATA",
      priority: "LOW",
      disciplineId: null,
      disciplineName: null,
      period: period("all_time", ctx),
      evidence: { simulados: 0 },
      message: "Sem simulados registrados: ainda não há como avaliar a evolução do seu desempenho.",
    })
  }

  for (const d of ctx.disciplines) {
    if (d.simuladosCount < MIN_SIMULADOS_FOR_EVOLUTION || d.simuladoEvolutionPp === null || d.simuladoFirst === null || d.simuladoLast === null) continue
    const evidence = {
      first: d.simuladoFirst,
      last: d.simuladoLast,
      change: d.simuladoEvolutionPp,
      simulations: d.simuladosCount,
      studyMinutesLast28: d.studyMinutesLast28,
      studyMinutesTotal: d.studyMinutesTotal,
    }
    if (d.simuladoEvolutionPp <= -DROP_PP) {
      add({
        type: "DECLINING_DISCIPLINE",
        priority: "MEDIUM",
        disciplineId: d.disciplineId,
        disciplineName: d.name,
        period: period("all_time", ctx),
        evidence,
        message: `${d.name} foi de ${pct(d.simuladoFirst)} para ${pct(d.simuladoLast)} (${pp(d.simuladoEvolutionPp)}) entre o primeiro e o último simulado.`,
      })
    } else if (d.simuladoEvolutionPp >= GROWTH_PP) {
      add({
        type: "IMPROVING_DISCIPLINE",
        priority: "LOW",
        disciplineId: d.disciplineId,
        disciplineName: d.name,
        period: period("all_time", ctx),
        evidence,
        message: `${d.name} foi de ${pct(d.simuladoFirst)} para ${pct(d.simuladoLast)} (${pp(d.simuladoEvolutionPp)}) entre o primeiro e o último simulado.`,
      })
    }
  }

  const rv = ctx.reviews
  if (rv.status === "OK" && (rv.overdue ?? 0) > 0) {
    add({
      type: "OVERDUE_REVIEWS",
      priority: (rv.overdue ?? 0) >= MENTOR_HIGH_OVERDUE_REVIEWS ? "HIGH" : "MEDIUM",
      disciplineId: null,
      disciplineName: null,
      period: period("today", ctx),
      evidence: { overdue: rv.overdue, dueToday: rv.dueToday, upcoming: rv.upcoming, activeItems: rv.activeItems },
      message: `Você possui ${rv.overdue} ${rv.overdue === 1 ? "revisão vencida" : "revisões vencidas"}.`,
    })
  }

  const g = ctx.goals.weeklyStudy
  if (g) {
    const below = g.realized < g.target
    add({
      type: "GOAL_PROGRESS",
      priority: g.realized < g.expectedByToday ? "MEDIUM" : "LOW",
      disciplineId: null,
      disciplineName: null,
      period: period("current_week", ctx),
      evidence: { targetMinutes: g.target, realizedMinutes: g.realized, differenceMinutes: g.difference, expectedByTodayMinutes: g.expectedByToday, daysElapsed: g.daysElapsed },
      message: below
        ? `Nesta semana: ${formatDurationRaw(g.realized)} de ${formatDurationRaw(g.target)} da meta (faltam ${formatDurationRaw(-g.difference)}).`
        : `Nesta semana: ${formatDurationRaw(g.realized)}, acima da meta de ${formatDurationRaw(g.target)}.`,
    })
  }

  const cy = ctx.cycle
  if (cy.status === "OK" && cy.currentRound !== null) {
    add({
      type: "CYCLE_POSITION",
      priority: "LOW",
      disciplineId: cy.currentItem?.disciplineId ?? null,
      disciplineName: cy.currentItem?.name ?? null,
      period: period("today", ctx),
      evidence: { round: cy.currentRound, roundsDone: cy.totalRoundsDone, roundProgressPct: cy.roundProgressPct, nextItem: cy.nextItem?.name ?? null },
      message: `Ciclo${cy.name ? ` "${cy.name}"` : ""}: volta ${cy.currentRound}, ${pct(cy.roundProgressPct ?? 0)} concluída${cy.currentItem ? `; matéria da vez: ${cy.currentItem.name}` : ""}.`,
    })
  }

  const ed = ctx.edital
  if (ed.status === "OK" && ed.total !== null && ed.completed !== null) {
    add({
      type: "EDITAL_PROGRESS",
      priority: "LOW",
      disciplineId: null,
      disciplineName: null,
      period: period("today", ctx),
      evidence: { total: ed.total, completed: ed.completed, studying: ed.studying, revising: ed.revising, notStarted: ed.notStarted, percentage: ed.percentage },
      message: `${ed.completed} de ${ed.total} disciplinas do edital marcadas como concluídas (${pct(ed.percentage ?? 0)}).`,
    })
  }

  return out
}

export function buildRecommendationCandidates(ctx: ContextForInsights): MentorRecommendationCandidate[] {
  const out: MentorRecommendationCandidate[] = []
  const add = (r: Omit<MentorRecommendationCandidate, "id">) => out.push({ id: `${r.type}:${r.disciplineId ?? "all"}`, ...r })

  if (ctx.contextQuality.level === "EMPTY" || ctx.contextQuality.level === "LOW") {
    add({
      type: "INSUFFICIENT_DATA",
      priority: ctx.contextQuality.level === "EMPTY" ? "MEDIUM" : "LOW",
      disciplineId: null,
      disciplineName: null,
      period: period("all_time", ctx),
      evidence: { level: ctx.contextQuality.level, ...ctx.contextQuality.signals },
      reason: ctx.contextQuality.reasons.join(" ") || "Dados insuficientes.",
    })
  }

  const st = ctx.study
  if (st.status === "OK" && st.last7 && st.last7.minutes < LOW_STUDY_MINUTES_PER_WEEK) {
    add({
      type: "LOW_STUDY_VOLUME",
      priority: st.last7.minutes === 0 ? "HIGH" : "MEDIUM",
      disciplineId: null,
      disciplineName: null,
      period: period("last_7_days", ctx, 7),
      evidence: {
        last7Minutes: st.last7.minutes,
        previous7Minutes: st.previous7?.minutes ?? null,
        last28Minutes: st.last28?.minutes ?? null,
        thresholdMinutes: LOW_STUDY_MINUTES_PER_WEEK,
      },
      reason: `${formatDurationRaw(st.last7.minutes)} de estudo nos últimos 7 dias (menos de ${formatDurationRaw(LOW_STUDY_MINUTES_PER_WEEK)}).`,
    })
  }

  const rv = ctx.reviews
  if (rv.status === "OK" && (rv.overdue ?? 0) >= MENTOR_HIGH_OVERDUE_REVIEWS) {
    add({
      type: "HIGH_OVERDUE_REVIEWS",
      priority: "HIGH",
      disciplineId: null,
      disciplineName: null,
      period: period("today", ctx),
      evidence: { overdue: rv.overdue, threshold: MENTOR_HIGH_OVERDUE_REVIEWS, activeItems: rv.activeItems },
      reason: `${rv.overdue} revisões vencidas (limite: ${MENTOR_HIGH_OVERDUE_REVIEWS}).`,
    })
  }

  const b = ctx.simulations.bottleneck
  if (ctx.simulations.status === "OK" && b && b.reasons.includes("LOW_PERFORMANCE") && b.accuracy !== null) {
    add({
      type: "LOW_SIMULADO_PERFORMANCE",
      priority: b.lowData ? "LOW" : "MEDIUM",
      disciplineId: b.disciplineId,
      disciplineName: b.name,
      period: period("all_time", ctx),
      evidence: { accuracy: b.accuracy, simulados: b.simuladosCount, lowData: b.lowData, reasons: b.reasons },
      reason: `${b.name}: ${pct(b.accuracy)} de média nos simulados${b.lowData ? " (um único simulado)" : ""}.`,
    })
  }

  for (const d of ctx.disciplines) {
    if (d.simuladosCount < MIN_SIMULADOS_FOR_EVOLUTION || d.simuladoEvolutionPp === null) continue
    const evidence = {
      first: d.simuladoFirst,
      last: d.simuladoLast,
      change: d.simuladoEvolutionPp,
      simulations: d.simuladosCount,
      studyMinutesLast28: d.studyMinutesLast28,
    }
    if (d.simuladoEvolutionPp <= -DROP_PP) {
      add({
        type: "DECLINING_DISCIPLINE",
        priority: "MEDIUM",
        disciplineId: d.disciplineId,
        disciplineName: d.name,
        period: period("all_time", ctx),
        evidence,
        reason: `${d.name}: ${pp(d.simuladoEvolutionPp)} do primeiro ao último simulado.`,
      })
    } else if (d.simuladoEvolutionPp >= HIGH_GROWTH_PP) {
      add({
        type: "HIGH_PROGRESS",
        priority: "LOW",
        disciplineId: d.disciplineId,
        disciplineName: d.name,
        period: period("all_time", ctx),
        evidence,
        reason: `${d.name}: ${pp(d.simuladoEvolutionPp)} do primeiro ao último simulado.`,
      })
    }
  }
  const sim = ctx.simulations
  if (sim.status === "OK" && (sim.count ?? 0) >= MIN_SIMULADOS_FOR_EVOLUTION && sim.firstToLastPp !== null && sim.firstToLastPp >= HIGH_GROWTH_PP) {
    add({
      type: "HIGH_PROGRESS",
      priority: "LOW",
      disciplineId: null,
      disciplineName: null,
      period: period("all_time", ctx),
      evidence: { first: sim.firstAccuracy, last: sim.lastAccuracy, change: sim.firstToLastPp, simulados: sim.count },
      reason: `Simulados: ${pp(sim.firstToLastPp)} do primeiro ao último.`,
    })
  }

  const g = ctx.goals.weeklyStudy
  if (g && g.realized < g.expectedByToday) {
    const gap = g.expectedByToday - g.realized
    add({
      type: "STUDY_BELOW_GOAL",
      priority: g.expectedByToday > 0 && gap >= g.expectedByToday / 2 ? "HIGH" : "MEDIUM",
      disciplineId: null,
      disciplineName: null,
      period: period("current_week", ctx),
      evidence: { targetMinutes: g.target, realizedMinutes: g.realized, expectedByTodayMinutes: g.expectedByToday, gapMinutes: gap, daysElapsed: g.daysElapsed },
      reason: `${formatDurationRaw(g.realized)} na semana; o proporcional da meta até hoje seria ${formatDurationRaw(g.expectedByToday)}.`,
    })
  }

  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const
  return out.sort((a, b) => order[a.priority] - order[b.priority] || a.id.localeCompare(b.id))
}
