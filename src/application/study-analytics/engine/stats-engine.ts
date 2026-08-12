// =============================================================================
// STATS ENGINE — Motor puro e determinístico de estatísticas de estudo.
// Regras:
//   - Zero imports. Syntaxe TypeScript "erasable" (sem enums, sem parameter
//     properties) para rodar também fora do Next (Node com type-stripping).
//   - Todos os cálculos dependem do par (now, timezone) passado explicitamente.
//   - Fórmulas documentadas em cada bloco (seção "FÓRMULA").
// =============================================================================

export const DEFAULT_TIMEZONE = "America/Sao_Paulo"

// ---------------------------------------------------------------------------
// TIPOS
// ---------------------------------------------------------------------------

export interface SessionRecord {
  id: string
  disciplineId: string | null
  disciplineName: string | null
  disciplineArea: string | null
  startedAt: string
  finishedAt: string | null
  durationMinutes: number
  activeMinutes: number | null
  pausedMinutes: number | null
  completed: boolean
  interrupted: boolean
  focusScore: number | null
  energyLevel: number | null
  difficulty: number | null
  studyType: string | null
  studySource: string | null
  pagesRead: number
  questionsAnswered: number
  questionsCorrect: number
  flashcardsReviewed: number
  topicName: string | null
  focusPercentage: number | null
  plannedMinutes: number | null
  notes: string | null
}

export interface QuestionAttemptRecord {
  id: string
  questionId: string | null
  disciplineId: string | null
  correct: boolean
  answeredAt: string | null
}

export interface DisciplineMeta {
  id: string
  name: string
  area: string | null
}

export interface UserDisciplineInput {
  disciplineId: string
  status: string | null
}

export interface ReviewItemRow {
  id: string
  disciplineId: string | null
  status: string | null
  nextReviewAt: string | null
}

export interface PlanItemRow {
  dayOfWeek: number
  durationMinutes: number
  disciplineId: string | null
}

export interface ActivePlan {
  weeklyHours: number | null
  weeklyQuestions: number | null
  weeklyDays: number | null
  items: PlanItemRow[]
}

export interface DailyBucket {
  date: string
  minutes: number
  activeMinutes: number
  pausedMinutes: number
  sessions: number
  completedSessions: number
  interruptedSessions: number
  pages: number
  questions: number
  correct: number
  wrong: number
  accuracy: number | null
  flashcards: number
  focusSum: number
  focusCount: number
  focusAvg: number | null
  attempts: number
}

export interface SessionStatistics {
  total: number
  completed: number
  interrupted: number
  averageMinutes: number
  longestMinutes: number
  shortestMinutes: number
  averageActiveMinutes: number
}

export interface TimeCardStatistics {
  todayMinutes: number
  weekMinutes: number
  monthMinutes: number
  last7Minutes: number
  last30Minutes: number
  last90Minutes: number
  totalMinutes: number
  studiedDayCount: number
  avgPerStudiedDay: number
  avgPerPeriodDay: number
  bestDay: { date: string; minutes: number } | null
  worstDay: { date: string; minutes: number } | null
}

export interface StreakStatistics {
  current: number
  currentEndsToday: boolean
  longest: number
}

export interface FocusStatistics {
  average: number | null
  averagePct: number | null
  best: number | null
  worst: number | null
  totalActiveMinutes: number
  totalPausedMinutes: number
  activeRatio: number | null
}

export interface PagesStatistics {
  totalPages: number
  pagesPerActiveHour: number
  pagesPerSession: number
}

export interface DisciplineStat {
  disciplineId: string
  name: string
  area: string | null
  minutes: number
  activeMinutes: number
  sessions: number
  questions: number
  correct: number
  wrong: number
  accuracy: number | null
  accuracyTrend: number | null
  trendDirection: "UP" | "DOWN" | "STABLE"
  focusAvg: number | null
  pages: number
  flashcards: number
  lastStudiedDate: string | null
  daysSinceLastStudy: number | null
  firstHalfMinutes: number
  secondHalfMinutes: number
  attentionScore: number
  attentionReasons: string[]
  classification: "DOMINADO" | "EM_DESENVOLVIMENTO" | "ATENCAO" | "CRITICO"
  classificationSeason?: string
  shareOfTotalMinutes: number
}

export interface TopicStat {
  topicName: string
  disciplineId: string
  disciplineName: string
  minutes: number
  sessions: number
  questions: number
  correct: number
  wrong: number
  accuracy: number | null
  focusAvg: number | null
  pages: number
  lastStudiedDate: string | null
  daysSinceLastStudy: number | null
  classification: "DOMINADO" | "EM_DESENVOLVIMENTO" | "ATENCAO" | "CRITICO"
}

export interface HourBucket {
  period: "MADRUGADA" | "MANHA" | "TARDE" | "NOITE"
  label: string
  minutes: number
  activeMinutes: number
  sessions: number
  questions: number
  correct: number
  wrong: number
  accuracy: number | null
  focusAvg: number | null
  best: boolean
}

export interface ComparisonRow {
  id: string
  label: string
  detail: string
  metrics: {
    minutes: MetricComparison
    questions: MetricComparison
    accuracy: MetricComparison
    focus: MetricComparison
    pages: MetricComparison
    sessions: MetricComparison
    days: MetricComparison
  }
}

export interface MetricComparison {
  current: number | null
  previous: number | null
  delta: number | null
  deltaPct: number | null
}

export interface PlanningSeriesPoint {
  date: string
  weekday: number
  plannedMinutes: number
  actualMinutes: number
  actualSessions: number
}

export interface PlanningStatistics {
  hasPlan: boolean
  weeklyTargetMinutes: number
  weeklyTargetQuestions: number
  weeklyTargetDays: number
  actualWeekMinutes: number
  actualWeekQuestions: number
  actualWeekDays: number
  adherencePct: number | null
  series: PlanningSeriesPoint[]
}

export interface RevisionDisciplineStat {
  disciplineId: string
  name: string
  overdue: number
  dueSoon: number
  total: number
}

export interface RevisionStatistics {
  totalPending: number
  overdue: number
  dueToday: number
  upcoming: number
  completedLast30: number
  completionRate: number | null
  byDiscipline: RevisionDisciplineStat[]
}

export interface EditalDisciplineStat {
  disciplineId: string
  name: string
  area: string | null
  status: string
  studiedMinutes: number
  daysSinceLastStudy: number | null
}

export interface EditalCoverage {
  total: number
  completed: number
  studying: number
  revising: number
  notStarted: number
  percentage: number
  byDiscipline: EditalDisciplineStat[]
}

export interface ProductivityBreakdown {
  activeRatioScore: number
  accuracyScore: number
  focusScore: number
  consistencyScore: number
}

export interface ProductivityStatistics {
  score: number | null
  breakdown: ProductivityBreakdown
}

export interface Insight {
  id: string
  severity: "positive" | "info" | "warning" | "danger"
  title: string
  message: string
}

export interface PriorityItem {
  disciplineId: string
  name: string
  area: string | null
  score: number
  reasons: string[]
  action: string
}

export interface ReportRow {
  id: string
  label: string
  current: string
  previous: string
  deltaLabel: string
  positive: boolean
}

export interface QuestionTrendPoint {
  date: string
  questions: number
  correct: number
  wrong: number
  accuracy: number | null
}

// ---------------------------------------------------------------------------
// CONFIG / RÓTULOS
// ---------------------------------------------------------------------------

export const CLASSIFICATION_LABELS: Record<string, string> = {
  DOMINADO: "Dominado",
  EM_DESENVOLVIMENTO: "Em desenvolvimento",
  ATENCAO: "Atenção",
  CRITICO: "Crítico",
}

export const CLASSIFICATION_EMOJI: Record<string, string> = {
  DOMINADO: "🟢",
  EM_DESENVOLVIMENTO: "🟡",
  ATENCAO: "🟠",
  CRITICO: "🔴",
}

export const STUDY_TYPE_LABELS: Record<string, string> = {
  TEORIA: "Teoria",
  QUESTOES: "Questões",
  REVISAO: "Revisão",
  RESUMO: "Resumo",
  MAPA_MENTAL: "Mapa mental",
  FLASHCARDS: "Flashcards",
  VIDEOAULA: "Videoaula",
  AUDIO: "Áudio",
  AULA_VIVO: "Aula ao vivo",
  LEITURA: "Leitura",
  LEI_SECA: "Lei seca",
  JURISPRUDENCIA: "Jurisprudência",
  INFORMATIVOS: "Informativo",
  DOUTRINA: "Doutrina",
  SIMULADO: "Simulado",
  MONITORIA: "Monitoria",
  ESTUDO_IA: "Estudo com IA",
  DISCUSSAO: "Discussão",
  OUTRO: "Outro",
}

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
]

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

// ---------------------------------------------------------------------------
// UTILITÁRIOS DE DATA (sempre em função de timezone explícito)
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n)
}

export function dateKeyFromYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`
}

/** Extrai { ano, mês, dia, hora, minuto } de um ISO em um timezone. */
export function localParts(
  iso: string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    const year = Number(get("year"))
    const month = Number(get("month"))
    const day = Number(get("day"))
    const hour = Number(get("hour"))
    const minute = Number(get("minute"))
    if (!year || !month || !day) return null
    return { year, month, day, hour, minute }
  } catch {
    return null
  }
}

/** "YYYY-MM-DD" no timezone indicado. */
export function dateKeyOf(
  iso: string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): string | null {
  const p = localParts(iso, timezone)
  if (!p) return null
  return dateKeyFromYmd(p.year, p.month, p.day)
}

/** Converte "YYYY-MM-DD" em Date UTC-meia-noite (para aritmética pura). */
export function keyToDate(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null
  }
  return d
}

/** Soma n dias (positivo ou negativo) a uma chave de data. */
export function addDaysToKey(key: string, n: number): string | null {
  const d = keyToDate(key)
  if (!d) return null
  d.setUTCDate(d.getUTCDate() + n)
  return dateKeyFromYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Número de dias entre duas chaves (b - a). */
export function daysBetweenKeys(a: string, b: string): number {
  const da = keyToDate(a)
  const db = keyToDate(b)
  if (!da || !db) return NaN
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

/** Chave de hoje, no timezone indicado. */
export function todayKey(now: Date, timezone: string = DEFAULT_TIMEZONE): string {
  const p = localParts(now.toISOString(), timezone)
  return p ? dateKeyFromYmd(p.year, p.month, p.day) : now.toISOString().slice(0, 10)
}

/** Chaves das últimas count datas (count-1 .. 0), incluindo hoje no final. */
export function lastNDays(count: number, now: Date, timezone: string = DEFAULT_TIMEZONE): string[] {
  const today = todayKey(now, timezone)
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const k = addDaysToKey(today, -i)
    if (k) keys.push(k)
  }
  return keys
}

/** Segunda-feira da semana (ISO, inicia na segunda-feira) daquela data. */
export function mondayKeyOf(key: string): string | null {
  const dow = weekdayOfKey(key)
  if (dow === null || dow === undefined) return null
  return addDaysToKey(key, (dow + 6) % 7 === 0 ? 0 : -((dow + 6) % 7))
}

/** Dia da semana 0=Dom..6=Sáb. */
export function weekdayOfKey(key: string): number | null {
  const d = keyToDate(key)
  if (!d) return null
  return d.getUTCDay()
}

/** "YYYY-MM" de uma chave de data. */
export function monthKeyOf(key: string): string {
  return key.slice(0, 7)
}

export function monthKeyFromYmd(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}`
}

export function addMonthsToKey(monthKey: string, n: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return monthKey
  const year = Number(m[1])
  const month = Number(m[2])
  const total = year * 12 + (month - 1) + n
  const y = Math.floor(total / 12)
  const mo = (total % 12) + 1
  return monthKeyFromYmd(y, mo)
}

export function daysInMonth(monthKey: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return 0
  const year = Number(m[1])
  const month = Number(m[2])
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// ---------------------------------------------------------------------------
// NORMALIZAÇÃO / VALIDAÇÃO (nunca apaga dados: só exclui registros inválidos)
// ---------------------------------------------------------------------------

function safeInt(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n))
}

function safeStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

export function sanitizeSession(raw: Record<string, unknown>): SessionRecord | null {
  const startedAt = safeStr(raw["started_at"])
  if (!startedAt || isNaN(new Date(startedAt).getTime())) return null
  const duration = safeInt(raw["duration_minutes"] ?? raw["active_minutes"] ?? 0)
  const questionsAnswered = safeInt(raw["questions_answered"])
  const questionsCorrect = Math.min(safeInt(raw["questions_correct"]), questionsAnswered)
  const focusScore =
    raw["focus_score"] === null || raw["focus_score"] === undefined
      ? null
      : Math.min(5, Math.max(1, safeInt(raw["focus_score"]) || 3))
  return {
    id: safeStr(raw["id"]) ?? "?",
    disciplineId: safeStr(raw["discipline_id"]),
    disciplineName: safeStr(raw["discipline_name"]),
    disciplineArea: safeStr(raw["discipline_area"]),
    startedAt,
    finishedAt: safeStr(raw["finished_at"]),
    durationMinutes: duration,
    activeMinutes: raw["active_minutes"] === null || raw["active_minutes"] === undefined ? null : safeInt(raw["active_minutes"]),
    pausedMinutes: raw["paused_minutes"] === null || raw["paused_minutes"] === undefined ? null : safeInt(raw["paused_minutes"]),
    completed: raw["completed"] === true || raw["completed"] === "true" || raw["completed"] === 1,
    interrupted: raw["interrupted"] === true || raw["interrupted"] === "true" || raw["interrupted"] === 1,
    focusScore,
    energyLevel: raw["energy_level"] === null || raw["energy_level"] === undefined ? null : safeInt(raw["energy_level"]),
    difficulty: raw["difficulty"] === null || raw["difficulty"] === undefined ? null : safeInt(raw["difficulty"]),
    studyType: safeStr(raw["study_type"]),
    studySource: safeStr(raw["study_source"]),
    pagesRead: safeInt(raw["pages_read"]),
    questionsAnswered,
    questionsCorrect,
    flashcardsReviewed: safeInt(raw["flashcards_reviewed"]),
    topicName: safeStr(raw["topic_name"]),
    focusPercentage: raw["focus_percentage"] === null || raw["focus_percentage"] === undefined ? null : Math.min(100, safeInt(raw["focus_percentage"])),
    plannedMinutes: raw["planned_minutes"] === null || raw["planned_minutes"] === undefined ? null : safeInt(raw["planned_minutes"]),
    notes: safeStr(raw["notes"]),
  }
}

export function sanitizeAttempt(raw: Record<string, unknown>): QuestionAttemptRecord | null {
  const id = safeStr(raw["id"]) ?? "?"
  const answeredAt = safeStr(raw["answered_at"])
  return {
    id,
    questionId: safeStr(raw["question_id"]) ?? null,
    disciplineId: safeStr(raw["discipline_id"]),
    correct: raw["correct"] === true || raw["correct"] === "true" || raw["correct"] === 1,
    answeredAt,
  }
}

export function sanitizeDisciplineMeta(raw: Record<string, unknown>): DisciplineMeta | null {
  const id = safeStr(raw["id"])
  const name = safeStr(raw["name"])
  if (!id) return null
  return { id, name: name ?? id, area: safeStr(raw["area"]) }
}

export function sanitizeReviewItem(raw: Record<string, unknown>): ReviewItemRow | null {
  const id = safeStr(raw["id"])
  if (!id) return null
  return {
    id,
    disciplineId: safeStr(raw["discipline_id"]),
    status: safeStr(raw["status"]),
    nextReviewAt: safeStr(raw["next_review_at"]),
  }
}

export function sanitizeUserDiscipline(raw: Record<string, unknown>): UserDisciplineInput | null {
  const disciplineId = safeStr(raw["discipline_id"])
  if (!disciplineId) return null
  return { disciplineId, status: safeStr(raw["status"]) ?? "NOT_STARTED" }
}

// ---------------------------------------------------------------------------
// DERIVAÇÕES POR SESSÃO
// ---------------------------------------------------------------------------

/**
 * FÓRMULA (tempo ativo): usa active_minutes quando presente; senão desconta as
 * pausas da duração total. Quando nada existe, assume 0.
 */
export function activeMinutesOf(s: SessionRecord): number {
  if (s.activeMinutes !== null && s.activeMinutes !== undefined) return Math.max(0, s.activeMinutes)
  const paused = s.pausedMinutes ?? 0
  return Math.max(0, s.durationMinutes - paused)
}

/** FÓRMULA (pausa): paused_minutes explícito ou duração - ativo (mín. 0). */
export function pausedMinutesOf(s: SessionRecord): number {
  if (s.pausedMinutes !== null && s.pausedMinutes !== undefined) return Math.max(0, s.pausedMinutes)
  return Math.max(0, s.durationMinutes - activeMinutesOf(s))
}

/**
 * FÓRMULA (foco em %) — prioridade:
 *   1. metadata.focus_percentage (0-100) gravada na sessão
 *   2. focus_score (1-5) convertido: score * 20
 */
export function focusPercentOf(s: SessionRecord): number | null {
  if (s.focusPercentage !== null && s.focusPercentage !== undefined) return Math.min(100, Math.max(0, s.focusPercentage))
  if (s.focusScore !== null && s.focusScore !== undefined) return Math.min(100, Math.max(0, s.focusScore * 20))
  return null
}

// ---------------------------------------------------------------------------
// AGREGADOS
// ---------------------------------------------------------------------------

export interface AggregatedTotals {
  minutes: number
  activeMinutes: number
  pausedMinutes: number
  sessions: number
  completedSessions: number
  interruptedSessions: number
  pages: number
  questions: number
  correct: number
  wrong: number
  accuracy: number | null
  flashcards: number
  focusSum: number
  focusCount: number
  focusAvg: number | null
  studiedDays: Set<string>
  attempts: number
}

export function emptyAggregatedTotals(): AggregatedTotals {
  return {
    minutes: 0,
    activeMinutes: 0,
    pausedMinutes: 0,
    sessions: 0,
    completedSessions: 0,
    interruptedSessions: 0,
    pages: 0,
    questions: 0,
    correct: 0,
    wrong: 0,
    accuracy: null,
    flashcards: 0,
    focusSum: 0,
    focusCount: 0,
    focusAvg: null,
    studiedDays: new Set<string>(),
    attempts: 0,
  }
}

export function addSessionToTotals(t: AggregatedTotals, s: SessionRecord, dateKey: string | null): void {
  t.minutes += s.durationMinutes
  t.activeMinutes += activeMinutesOf(s)
  t.pausedMinutes += pausedMinutesOf(s)
  t.sessions += 1
  if (s.completed) t.completedSessions += 1
  if (s.interrupted) t.interruptedSessions += 1
  t.pages += s.pagesRead
  t.questions += s.questionsAnswered
  t.correct += s.questionsCorrect
  t.wrong += s.questionsAnswered - s.questionsCorrect
  t.flashcards += s.flashcardsReviewed
  if (dateKey) t.studiedDays.add(dateKey)
  const f = focusPercentOf(s)
  if (f !== null) {
    t.focusSum += f
    t.focusCount += 1
  }
}

export function finalizeAggregatedTotals(t: AggregatedTotals): AggregatedTotals {
  t.accuracy = t.questions > 0 ? (t.correct / t.questions) * 100 : null
  t.focusAvg = t.focusCount > 0 ? t.focusSum / t.focusCount : null
  return t
}

export function addAttemptToTotals(t: AggregatedTotals, a: QuestionAttemptRecord): void {
  t.questions += 1
  if (a.correct) t.correct += 1
  else t.wrong += 1
  t.attempts += 1
}

export function rebuildAccuracy(t: AggregatedTotals): void {
  t.accuracy = t.questions > 0 ? (t.correct / t.questions) * 100 : null
}

/**
 * Séries diárias. Cada bucket agrega sessões (e tentativas quando o dia é
 * conhecido) daquele dia no fuso informado. FÓRMULA da acurácia do dia:
 * corretas / respondidas * 100 (nulo quando 0 questões).
 */
export function buildDayBuckets(
  sessions: SessionRecord[],
  attempts: QuestionAttemptRecord[],
  days: number,
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): DailyBucket[] {
  const keys = lastNDays(days, now, timezone)
  const byDate = new Map<string, DailyBucket>()
  const base: Omit<DailyBucket, "date"> = {
    minutes: 0,
    activeMinutes: 0,
    pausedMinutes: 0,
    sessions: 0,
    completedSessions: 0,
    interruptedSessions: 0,
    pages: 0,
    questions: 0,
    correct: 0,
    wrong: 0,
    accuracy: null,
    flashcards: 0,
    focusSum: 0,
    focusCount: 0,
    focusAvg: null,
    attempts: 0,
  }
  keys.forEach((k) => byDate.set(k, { ...base, date: k }))

  sessions.forEach((s) => {
    const k = dateKeyOf(s.startedAt, timezone)
    if (!k) return
    const b = byDate.get(k)
    if (!b) return
    b.minutes += s.durationMinutes
    b.activeMinutes += activeMinutesOf(s)
    b.pausedMinutes += pausedMinutesOf(s)
    b.sessions += 1
    if (s.completed) b.completedSessions += 1
    if (s.interrupted) b.interruptedSessions += 1
    b.pages += s.pagesRead
    b.questions += s.questionsAnswered
    b.correct += s.questionsCorrect
    b.wrong += s.questionsAnswered - s.questionsCorrect
    b.flashcards += s.flashcardsReviewed
    const f = focusPercentOf(s)
    if (f !== null) {
      b.focusSum += f
      b.focusCount += 1
    }
  })

  attempts.forEach((a) => {
    const k = a.answeredAt ? dateKeyOf(a.answeredAt, timezone) : null
    if (!k) return
    const b = byDate.get(k)
    if (!b) return
    b.questions += 1
    b.attempts += 1
    if (a.correct) b.correct += 1
    else b.wrong += 1
  })

  keys.forEach((k) => {
    const b = byDate.get(k)
    if (b) {
      b.accuracy = b.questions > 0 ? (b.correct / b.questions) * 100 : null
      b.focusAvg = b.focusCount > 0 ? b.focusSum / b.focusCount : null
    }
  })

  return keys.map((k) => byDate.get(k) ?? { ...base, date: k }).filter((b): b is DailyBucket => !!b)
}

/** Soma os buckets de uma janela (slice responsável por ordenar por data). */
export function aggregateBuckets(buckets: DailyBucket[]): AggregatedTotals {
  const t = emptyAggregatedTotals()
  buckets.forEach((b) => {
    t.minutes += b.minutes
    t.activeMinutes += b.activeMinutes
    t.pausedMinutes += b.pausedMinutes
    t.sessions += b.sessions
    t.completedSessions += b.completedSessions
    t.interruptedSessions += b.interruptedSessions
    t.pages += b.pages
    t.questions += b.questions
    t.correct += b.correct
    t.wrong += b.wrong
    t.flashcards += b.flashcards
    t.focusSum += b.focusSum
    t.focusCount += b.focusCount
    if (b.minutes > 0) t.studiedDays.add(b.date)
  })
  return finalizeAggregatedTotals(t)
}

/** Chaves de data entre startKey e endKey (inclusive). */
export function keysBetween(startKey: string, endKey: string): string[] {
  const diff = daysBetweenKeys(startKey, endKey)
  const keys: string[] = []
  for (let i = 0; i <= diff; i++) {
    const k = addDaysToKey(startKey, i)
    if (k) keys.push(k)
  }
  return keys
}

export function slicesOfBuckets(buckets: DailyBucket[], days: number): DailyBucket[] {
  return buckets.slice(Math.max(0, buckets.length - days))
}

// ---------------------------------------------------------------------------
// CARDS DE TEMPO
// ---------------------------------------------------------------------------

/**
 * FÓRMULAS:
 *  - Hoje = chave de hoje no fuso; semana = da segunda-feira à hoje;
 *  - Mês = do dia 1 do mês à hoje; janelas 7/30/90 dias = os últimos N dias;
 *  - Total = todos os buckets carregados;
 *  - Média por dia estudado = minutos / dias com sessão;
 *  - Média por dia do período = minutos / dias do período considerado.
 */
export function computeTimeCards(
  buckets: DailyBucket[],
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): TimeCardStatistics {
  const today = todayKey(now, timezone)
  const total = aggregateBuckets(buckets)
  const byDate = new Map(buckets.map((b) => [b.date, b]))

  const sumIn = (keys: string[]): number =>
    keys.reduce((acc, k) => acc + (byDate.get(k)?.minutes ?? 0), 0)

  const todayMinutes = sumIn([today])

  const parts = localParts(now.toISOString(), timezone)
  const monthStart = parts ? dateKeyFromYmd(parts.year, parts.month, 1) : today
  const monthKeys = parts ? keysBetween(monthStart, today) : [today]
  const weekMondays = mondayKeyOf(today)
  const weekKeys = weekMondays ? keysBetween(weekMondays, today) : [today]
  const monthMinutes = sumIn(monthKeys)
  const weekMinutes = sumIn(weekKeys)

  const totalDays = buckets.length
  const studied = total.studiedDays.size
  const last30 = aggregateBuckets(slicesOfBuckets(buckets, 30))
  const last90 = aggregateBuckets(slicesOfBuckets(buckets, 90))
  const last7 = aggregateBuckets(slicesOfBuckets(buckets, 7))

  let bestDay: { date: string; minutes: number } | null = null
  let worstDay: { date: string; minutes: number } | null = null
  buckets.forEach((b) => {
    if (b.minutes > 0) {
      if (!bestDay || b.minutes > bestDay.minutes) bestDay = { date: b.date, minutes: b.minutes }
      if (!worstDay || b.minutes < worstDay.minutes) worstDay = { date: b.date, minutes: b.minutes }
    }
  })

  return {
    todayMinutes,
    weekMinutes,
    monthMinutes,
    last7Minutes: last7.minutes,
    last30Minutes: last30.minutes,
    last90Minutes: last90.minutes,
    totalMinutes: total.minutes,
    studiedDayCount: studied,
    avgPerStudiedDay: studied > 0 ? total.minutes / studied : 0,
    avgPerPeriodDay: totalDays > 0 ? total.minutes / totalDays : 0,
    bestDay,
    worstDay,
  }
}

export function computeSessionStatistics(sessions: SessionRecord[]): SessionStatistics {
  const total = sessions.length
  let completed = 0
  let interrupted = 0
  let minutesSum = 0
  let activeSum = 0
  let longest = 0
  let shortest = Infinity
  sessions.forEach((s) => {
    if (s.completed) completed += 1
    if (s.interrupted) interrupted += 1
    minutesSum += s.durationMinutes
    activeSum += activeMinutesOf(s)
    if (s.durationMinutes > longest) longest = s.durationMinutes
    if (s.durationMinutes < shortest) shortest = s.durationMinutes
  })
  return {
    total,
    completed,
    interrupted,
    averageMinutes: total > 0 ? minutesSum / total : 0,
    longestMinutes: longest,
    shortestMinutes: shortest === Infinity ? 0 : shortest,
    averageActiveMinutes: total > 0 ? activeSum / total : 0,
  }
}

// ---------------------------------------------------------------------------
// QUESTÕES
// ---------------------------------------------------------------------------

export interface QuestionStatistics {
  total: number
  correct: number
  wrong: number
  accuracy: number | null
  fromSessions: number
  fromAttempts: number
}

export function computeQuestionStatistics(
  sessions: SessionRecord[],
  attempts: QuestionAttemptRecord[]
): QuestionStatistics {
  const fromSessions = sessions.reduce((acc, s) => acc + s.questionsAnswered, 0)
  const correctSessions = sessions.reduce((acc, s) => acc + s.questionsCorrect, 0)
  const fromAttempts = attempts.length
  const correctAttempts = attempts.filter((a) => a.correct).length
  const total = fromSessions + fromAttempts
  const correct = correctSessions + correctAttempts
  return {
    total,
    correct,
    wrong: total - correct,
    accuracy: total > 0 ? (correct / total) * 100 : null,
    fromSessions,
    fromAttempts,
  }
}

export function computeQuestionTrend(buckets: DailyBucket[]): QuestionTrendPoint[] {
  return buckets
    .filter((b) => b.questions > 0)
    .map((b) => ({
      date: b.date,
      questions: b.questions,
      correct: b.correct,
      wrong: b.wrong,
      accuracy: b.accuracy,
    }))
}

// ---------------------------------------------------------------------------
// FOCO / PÁGINAS / SESSÕES DETALHES
// ---------------------------------------------------------------------------

export function computeFocusStatistics(sessions: SessionRecord[]): FocusStatistics {
  let sum = 0
  let count = 0
  let best = 0
  let worst = Infinity
  let totalActive = 0
  let totalPaused = 0
  let totalDuration = 0
  sessions.forEach((s) => {
    const f = focusPercentOf(s)
    if (f !== null) {
      sum += f
      count += 1
      if (f > best) best = f
      if (f < worst) worst = f
    }
    totalActive += activeMinutesOf(s)
    totalPaused += pausedMinutesOf(s)
    totalDuration += s.durationMinutes
  })
  const avg = count > 0 ? sum / count : null
  const activeRatio = totalDuration > 0 ? totalActive / totalDuration : null
  return {
    average: avg,
    averagePct: avg,
    best: count > 0 ? best : null,
    worst: count > 0 ? worst : null,
    totalActiveMinutes: totalActive,
    totalPausedMinutes: totalPaused,
    activeRatio,
  }
}

export function computePagesStatistics(sessions: SessionRecord[]): PagesStatistics {
  const totalPages = sessions.reduce((acc, s) => acc + s.pagesRead, 0)
  const activeHours = sessions.reduce((acc, s) => acc + activeMinutesOf(s), 0) / 60
  const total = sessions.length
  return {
    totalPages,
    pagesPerActiveHour: activeHours > 0 ? totalPages / activeHours : 0,
    pagesPerSession: total > 0 ? totalPages / total : 0,
  }
}

// ---------------------------------------------------------------------------
// CONSTÂNCIA (STREAK / SEQUÊNCIAS)
// ---------------------------------------------------------------------------

/**
 * FÓRMULA (sequência atual): dias consecutivos com sessão terminando hoje ou
 * ontem (um dia ainda sem estudo não quebra a sequência de hoje). Sequência
 * máxima = maior corrida de dias seguidos no período.
 */
export function computeStreaks(days: Set<string>, now: Date, timezone: string = DEFAULT_TIMEZONE): StreakStatistics {
  const today = todayKey(now, timezone)
  const yesterday = addDaysToKey(today, -1)
  const anchors: string[] = []
  if (days.has(today)) anchors.push(today)
  else if (yesterday && days.has(yesterday)) anchors.push(yesterday)
  let current = 0
  anchors.forEach((anchor) => {
    let d = anchor
    let run = 0
    while (days.has(d)) {
      run++
      const prev = addDaysToKey(d, -1)
      if (!prev) break
      d = prev
    }
    if (run > current) current = run
  })

  const sorted = [...days].sort()
  let longest = 0
  let run = 0
  let prev: string | null = null
  sorted.forEach((k) => {
    if (prev === null || daysBetweenKeys(prev, k) === 1) {
      run += 1
    } else {
      run = 1
    }
    if (run > longest) longest = run
    prev = k
  })

  const todayStudied = days.has(today)
  return { current, currentEndsToday: todayStudied, longest }
}

export function computeFrequency(buckets: DailyBucket[], now: Date, timezone: string = DEFAULT_TIMEZONE) {
  const last7 = new Set(buckets.slice(-7).filter((b) => b.minutes > 0).map((b) => b.date))
  const last30 = new Set(buckets.slice(-30).filter((b) => b.minutes > 0).map((b) => b.date))
  const last90 = new Set(buckets.slice(-90).filter((b) => b.minutes > 0).map((b) => b.date))
  const total = new Set(buckets.filter((b) => b.minutes > 0).map((b) => b.date))
  const today = todayKey(now, timezone)
  const gapDays: string[] = []
  const keys = lastNDays(14, now, timezone)
  let lastStudy: string | null = null
  const studied = buckets.filter((b) => b.minutes > 0).map((b) => b.date).sort()
  lastStudy = studied.length > 0 ? studied[studied.length - 1] ?? null : null

  keys.forEach((k) => {
    if (!total.has(k)) gapDays.push(k)
  })

  // Sessão "por semana": média de dias estudados por semana nos últimos 4 domingos-cheios.
  const monday = mondayKeyOf(today)
  let weeklyAvg = 0
  if (monday) {
    let totalDays = 0
    let weeks = 0
    for (let w = 0; w < 4; w++) {
      const weekStart = addDaysToKey(monday, -(w * 7))
      if (!weekStart) break
      const weekEnd = addDaysToKey(weekStart, 6)
      if (!weekEnd) break
      let daysInWeek = 0
      for (let d = 0; d < 7; d++) {
        const k = addDaysToKey(weekStart, d)
        if (k && total.has(k)) daysInWeek++
      }
      totalDays += daysInWeek
      weeks++
    }
    weeklyAvg = weeks > 0 ? totalDays / weeks : 0
  }

  return {
    last7Days: last7.size,
    last30Days: last30.size,
    last90Days: last90.size,
    totalDays: total.size,
    weeklyAvgDays: weeklyAvg,
    daysSinceLastStudy: lastStudy ? daysBetweenKeys(lastStudy, today) : null,
    gapDays,
  }
}

// ---------------------------------------------------------------------------
// DISCIPLINAS
// ---------------------------------------------------------------------------

const DOMINADO_MIN_QUESTIONS = 5
const DOMINADO_MIN_ACCURACY = 80
const DOMINADO_MAX_DAYS_SINCE = 14
const ATENCAO_MIN_ACCURACY = 60
const CRITICO_MAX_ACCURACY = 40
const CRITICO_MAX_DAYS_SINCE = 60

/**
 * FÓRMULA (classificação):
 *   DOMINADO  🟢 → ≥ 5 questões, acurácia ≥ 80% e estudo nos últimos 14 dias
 *   EM_DESENVOLVIMENTO 🟡 → estudou e não se enquadra nas demais, ≤ 30 dias desde o último estudo
 *   ATENCAO   🟠 → acurácia < 60% (com ≥ 5 questões) OU 31-60 dias sem estudo
 *   CRITICO   🔴 → > 60 dias sem estudo OU acurácia < 40% (com ≥ 5 questões)
 */
export function classifyDiscipline(d: {
  questions: number
  accuracy: number | null
  daysSince: number | null
  studied: boolean
}): DisciplineStat["classification"] {
  const q = d.questions
  const acc = d.accuracy
  const days = d.daysSince
  if (q >= DOMINADO_MIN_QUESTIONS && acc !== null && acc >= DOMINADO_MIN_ACCURACY && days !== null && days <= DOMINADO_MAX_DAYS_SINCE) {
    return "DOMINADO"
  }
  if (!d.studied) return "CRITICO"
  if (q >= DOMINADO_MIN_QUESTIONS && acc !== null && acc < CRITICO_MAX_ACCURACY) return "CRITICO"
  if (days !== null && days > CRITICO_MAX_DAYS_SINCE) return "CRITICO"
  if (q >= DOMINADO_MIN_QUESTIONS && acc !== null && acc < ATENCAO_MIN_ACCURACY) return "ATENCAO"
  if (days !== null && days > 30) return "ATENCAO"
  return "EM_DESENVOLVIMENTO"
}

/**
 * FÓRMULA (score de atenção 0-100), pesos documentados:
 *   Desempenho 30%  → (1 - acurácia/100), acurácia ausente assume 0.5
 *   Volume de erros 15% → min(erros / 25, 1)
 *   Abandono 20%     → min(dias sem estudo / 30, 1)
 *   Revisão 15%      → min(revisões atrasadas / 10, 1)
 *   Cobertura 10%    → 1 NOT_STARTED | 0.6 EM_ESTUDO | 0.2 outros
 *   Tendência 10%    → 1 DOWN | 0.5 STABLE | 0 UP
 */
export function computeAttentionScore(d: {
  accuracy: number | null
  wrong: number
  daysSince: number | null
  overdue: number
  status: string | null
  trendDirection: "UP" | "DOWN" | "STABLE"
}): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  const accScore = d.accuracy === null ? 0.5 : 1 - d.accuracy / 100
  score += accScore * 30
  if (d.accuracy !== null && d.accuracy < ATENCAO_MIN_ACCURACY) reasons.push(`Acurácia de ${Math.round(d.accuracy)}% abaixo de ${ATENCAO_MIN_ACCURACY}%`)

  const errScore = Math.min(d.wrong / 25, 1)
  score += errScore * 15
  if (d.wrong >= 10) reasons.push(`${d.wrong} erros acumulados`)

  const abandonScore = d.daysSince === null ? 0.5 : Math.min(d.daysSince / 30, 1)
  score += abandonScore * 20
  if (d.daysSince !== null && d.daysSince > 7) reasons.push(`${d.daysSince} dias sem estudar`)

  const revScore = Math.min(d.overdue / 10, 1)
  score += revScore * 15
  if (d.overdue > 0) reasons.push(`${d.overdue} revisões atrasadas`)

  let coverScore: number
  if (d.status === "NOT_STARTED") coverScore = 1
  else if (d.status === "EM_ESTUDO") coverScore = 0.6
  else coverScore = 0.2
  score += coverScore * 10
  if (d.status === "NOT_STARTED") reasons.push("Nunca começada")
  if (d.status === "EM_ESTUDO") reasons.push("Em estudo mas sem dominar")

  let trendScore: number
  if (d.trendDirection === "DOWN") trendScore = 1
  else if (d.trendDirection === "STABLE") trendScore = 0.5
  else trendScore = 0
  score += trendScore * 10
  if (d.trendDirection === "DOWN") reasons.push("Tendência de queda no tempo de estudo")

  return { score: Math.round(Math.min(100, Math.max(0, score))), reasons: reasons.slice(0, 3) }
}

export function computeTrendDirection(deltaPct: number | null): "UP" | "DOWN" | "STABLE" {
  if (deltaPct === null) return "STABLE"
  if (deltaPct > 10) return "UP"
  if (deltaPct < -10) return "DOWN"
  return "STABLE"
}

export interface GroupByNameOptions {
  includeTopics: boolean
}

/**
 * FÓRMULA (tendência): compara os minutos da 2ª metade com a 1ª metade do
 * período estudado da disciplina (≥4 sessões para valer). Delta negativo =
 * queda.
 */
export function computeDisciplineStats(
  sessions: SessionRecord[],
  attempts: QuestionAttemptRecord[],
  disciplineRegistry: Map<string, DisciplineMeta>,
  userDisciplines: UserDisciplineInput[],
  overdueByDiscipline: Map<string, number>,
  totalMinutesAll: number,
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): DisciplineStat[] {
  const statusByDiscipline = new Map(userDisciplines.map((u) => [u.disciplineId, u.status]))
  const groups = new Map<string, SessionRecord[]>()

  sessions.forEach((s) => {
    const key = s.disciplineId ?? "UNKNOWN"
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  })

  const result: DisciplineStat[] = []

  groups.forEach((list, key) => {
    const name = (disciplineRegistry.get(key)?.name ?? list.find((s) => s.disciplineName)?.disciplineName) ?? "Sem disciplina"
    const area = disciplineRegistry.get(key)?.area ?? list.find((s) => s.disciplineArea)?.disciplineArea ?? null
    const minutes = list.reduce((acc, s) => acc + s.durationMinutes, 0)
    const activeMinutes = list.reduce((acc, s) => acc + activeMinutesOf(s), 0)
    const questions = list.reduce((acc, s) => acc + s.questionsAnswered, 0)
    const correct = list.reduce((acc, s) => acc + s.questionsCorrect, 0)
    const pages = list.reduce((acc, s) => acc + s.pagesRead, 0)
    const flashcards = list.reduce((acc, s) => acc + s.flashcardsReviewed, 0)
    const focusSum = list.reduce((acc, s) => acc + (focusPercentOf(s) ?? 0), 0)
    const focusCount = list.reduce((acc, s) => acc + (focusPercentOf(s) !== null ? 1 : 0), 0)

    const dated = list
      .map((s) => ({ iso: s.startedAt, minutes: s.durationMinutes }))
      .sort((a, b) => a.iso.localeCompare(b.iso))
    const lastStudiedIso = dated.length > 0 ? dated[dated.length - 1]?.iso ?? null : null
    const lastStudiedDate = lastStudiedIso ? dateKeyOf(lastStudiedIso, timezone) : null
    const daysSince = lastStudiedDate ? daysBetweenKeys(lastStudiedDate, todayKey(now, timezone)) : null

    const half = Math.floor(dated.length / 2)
    const firstHalfMinutes = dated.slice(0, half).reduce((acc, d) => acc + d.minutes, 0)
    const secondHalfMinutes = dated.slice(half).reduce((acc, d) => acc + d.minutes, 0)
    const deltaPct =
      dated.length >= 4 && firstHalfMinutes > 0
        ? ((secondHalfMinutes - firstHalfMinutes) / firstHalfMinutes) * 100
        : null
    const trendDirection = computeTrendDirection(deltaPct)

    const attemptsFor = attempts.filter((a) => a.disciplineId && a.disciplineId === key)
    const attemptsForUnmapped = key === "UNKNOWN" ? attempts.filter((a) => !a.disciplineId) : []
    const allAttempts = [...attemptsFor, ...attemptsForUnmapped]
    const totalQuestions = questions + allAttempts.length
    const totalCorrect = correct + allAttempts.filter((a) => a.correct).length

    const accuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : null
    const status = statusByDiscipline.get(key) ?? null
    const overdue = overdueByDiscipline.get(key) ?? 0
    const att = computeAttentionScore({
      accuracy,
      wrong: totalQuestions - totalCorrect,
      daysSince,
      overdue,
      status,
      trendDirection,
    })

    result.push({
      disciplineId: key,
      name,
      area,
      minutes,
      activeMinutes,
      sessions: list.length,
      questions: totalQuestions,
      correct: totalCorrect,
      wrong: totalQuestions - totalCorrect,
      accuracy,
      accuracyTrend: deltaPct,
      trendDirection,
      focusAvg: focusCount > 0 ? focusSum / focusCount : null,
      pages,
      flashcards,
      lastStudiedDate,
      daysSinceLastStudy: daysSince,
      firstHalfMinutes,
      secondHalfMinutes,
      attentionScore: att.score,
      attentionReasons: att.reasons,
      classification: classifyDiscipline({
        questions: totalQuestions,
        accuracy,
        daysSince,
        studied: list.length > 0,
      }),
      shareOfTotalMinutes: totalMinutesAll > 0 ? (minutes / totalMinutesAll) * 100 : 0,
    })
  })

  return result
}

export function computeTopicStats(
  sessions: SessionRecord[],
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): TopicStat[] {
  const groups = new Map<string, SessionRecord[]>()
  sessions.forEach((s) => {
    if (!s.topicName) return
    const key = `${s.disciplineId ?? ""}::${s.topicName}`
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  })

  const result: TopicStat[] = []
  groups.forEach((list, key) => {
    const [disciplineId, topicName] = key.split("::")
    const minutes = list.reduce((acc, s) => acc + s.durationMinutes, 0)
    const questions = list.reduce((acc, s) => acc + s.questionsAnswered, 0)
    const correct = list.reduce((acc, s) => acc + s.questionsCorrect, 0)
    const focusSum = list.reduce((acc, s) => acc + (focusPercentOf(s) ?? 0), 0)
    const focusCount = list.reduce((acc, s) => acc + (focusPercentOf(s) !== null ? 1 : 0), 0)
    const pages = list.reduce((acc, s) => acc + s.pagesRead, 0)
    const lastIso = list.map((s) => s.startedAt).sort().slice(-1)[0] ?? null
    const lastStudiedDate = lastIso ? dateKeyOf(lastIso, timezone) : null
    const daysSince = lastStudiedDate ? daysBetweenKeys(lastStudiedDate, todayKey(now, timezone)) : null
    const accuracy = questions > 0 ? (correct / questions) * 100 : null

    result.push({
      topicName: topicName ?? "Sem tópico",
      disciplineId: disciplineId ?? "",
      disciplineName: list.find((s) => s.disciplineName)?.disciplineName ?? "Sem disciplina",
      minutes,
      sessions: list.length,
      questions,
      correct,
      wrong: questions - correct,
      accuracy,
      focusAvg: focusCount > 0 ? focusSum / focusCount : null,
      pages,
      lastStudiedDate,
      daysSinceLastStudy: daysSince,
      classification: classifyDiscipline({ questions, accuracy, daysSince, studied: list.length > 0 }),
    })
  })

  return result.sort((a, b) => b.minutes - a.minutes || (b.questions ?? 0) - (a.questions ?? 0))
}

// ---------------------------------------------------------------------------
// PERÍODOS DO DIA
// ---------------------------------------------------------------------------

export function computeHoursOfDay(
  sessions: SessionRecord[],
  attempts: QuestionAttemptRecord[],
  timezone: string = DEFAULT_TIMEZONE
): HourBucket[] {
  const buckets: HourBucket[] = [
    { period: "MADRUGADA", label: "Madrugada (00h-06h)", minutes: 0, activeMinutes: 0, sessions: 0, questions: 0, correct: 0, wrong: 0, accuracy: null, focusAvg: null, best: false },
    { period: "MANHA", label: "Manhã (06h-12h)", minutes: 0, activeMinutes: 0, sessions: 0, questions: 0, correct: 0, wrong: 0, accuracy: null, focusAvg: null, best: false },
    { period: "TARDE", label: "Tarde (12h-18h)", minutes: 0, activeMinutes: 0, sessions: 0, questions: 0, correct: 0, wrong: 0, accuracy: null, focusAvg: null, best: false },
    { period: "NOITE", label: "Noite (18h-00h)", minutes: 0, activeMinutes: 0, sessions: 0, questions: 0, correct: 0, wrong: 0, accuracy: null, focusAvg: null, best: false },
  ]
  const index = (hour: number): number => {
    if (hour >= 18) return 3
    if (hour >= 12) return 2
    if (hour >= 6) return 1
    return 0
  }

  sessions.forEach((s) => {
    const p = localParts(s.startedAt, timezone)
    if (!p) return
    const b = buckets[index(p.hour)]
    if (b) {
      b.minutes += s.durationMinutes
      b.activeMinutes += activeMinutesOf(s)
      b.sessions += 1
      b.questions += s.questionsAnswered
      b.correct += s.questionsCorrect
      b.wrong += s.questionsAnswered - s.questionsCorrect
    }
  })

  attempts.forEach((a) => {
    if (!a.answeredAt) return
    const p = localParts(a.answeredAt, timezone)
    if (!p) return
    const b = buckets[index(p.hour)]
    if (b) {
      b.questions += 1
      if (a.correct) b.correct += 1
      else b.wrong += 1
    }
  })

  let bestIndex = -1
  let bestScore = -1
  buckets.forEach((b, i) => {
    b.accuracy = b.questions > 0 ? (b.correct / b.questions) * 100 : null
    if (b.questions >= 5) {
      const score = b.accuracy !== null ? b.accuracy : 0
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }
  })
  if (bestIndex < 0) {
    let maxMinutes = -1
    buckets.forEach((b, i) => {
      if (b.minutes > maxMinutes) {
        maxMinutes = b.minutes
        bestIndex = i
      }
    })
  }
  const best = bestIndex >= 0 ? buckets[bestIndex] : undefined
  if (best) best.best = true

  return buckets
}

// ---------------------------------------------------------------------------
// EU VS EU (COMPARAÇÕES)
// ---------------------------------------------------------------------------

function cmp(
  current: number | null,
  previous: number | null
): MetricComparison {
  if (current === null && previous === null) return { current: null, previous: null, delta: null, deltaPct: null }
  const c = current ?? 0
  const p = previous ?? 0
  const delta = c - p
  const deltaPct = p > 0 ? (delta / p) * 100 : null
  return { current: current, previous: previous, delta, deltaPct }
}

function cmpPp(current: number | null, previous: number | null): MetricComparison {
  if (current === null || previous === null) return { current, previous, delta: null, deltaPct: null }
  return { current, previous, delta: current - previous, deltaPct: null }
}

export function computeComparisons(
  buckets: DailyBucket[],
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): ComparisonRow[] {
  const rows: ComparisonRow[] = []
  const today = todayKey(now, timezone)
  const byDate = new Map(buckets.map((b) => [b.date, b]))

  const addRow = (
    id: string,
    label: string,
    detail: string,
    curKeys: string[],
    prevKeys: string[],
    avgDaily: boolean
  ) => {
    const a = curKeys.length > 0 ? aggregateBuckets(curKeys.map((k) => byDate.get(k)).filter((b): b is DailyBucket => !!b)) : null
    const b = prevKeys.length > 0 ? aggregateBuckets(prevKeys.map((k) => byDate.get(k)).filter((x): x is DailyBucket => !!x)) : null
    const curMin = avgDaily && a && a.studiedDays.size > 0 ? a.minutes / a.studiedDays.size : a?.minutes ?? null
    const prevMin = avgDaily && b && b.studiedDays.size > 0 ? b.minutes / b.studiedDays.size : b?.minutes ?? null
    rows.push({
      id,
      label,
      detail,
      metrics: {
        minutes: cmp(curMin, prevMin),
        questions: avgDaily && a && b
          ? cmp(
              a.studiedDays.size > 0 && b.studiedDays.size > 0 ? a.questions / (a.studiedDays.size || 1) : null,
              b.questions / (b.studiedDays.size || 1)
            )
          : cmp(a?.questions ?? null, b?.questions ?? null),
        accuracy: a && b ? cmpPp(a.accuracy, b.accuracy) : cmpPp(null, null),
        focus: a && b ? cmpPp(a.focusAvg, b.focusAvg) : cmpPp(null, null),
        pages: cmp(a?.pages ?? null, b?.pages ?? null),
        sessions: cmp(a?.sessions ?? null, b?.sessions ?? null),
        days: cmp(a ? a.studiedDays.size : null, b ? b.studiedDays.size : null),
      },
    })
  }

  const studiedKeys = buckets.filter((b) => b.minutes > 0).map((b) => b.date)
  addRow("today_vs_avg", "Hoje", "Hoje (parcial) vs média por dia estudado no período", [today], studiedKeys, true)

  const monday = mondayKeyOf(today)
  const weekKeys = monday ? keysBetween(monday, today) : [today]
  const prevWeekEnd = addDaysToKey(weekKeys[0] ?? today, -1)
  const prevWeekStart = prevWeekEnd ? addDaysToKey(prevWeekEnd, -6) : null
  addRow(
    "week_vs_prev",
    "Semana atual",
    "Segunda até hoje vs os 7 dias anteriores",
    weekKeys,
    prevWeekStart && prevWeekEnd ? keysBetween(prevWeekStart, prevWeekEnd) : [],
    false
  )

  const parts = localParts(now.toISOString(), timezone)
  const curMonthKey = parts ? monthKeyFromYmd(parts.year, parts.month) : monthKeyOf(today)
  const prevMonthKey = addMonthsToKey(curMonthKey, -1)
  const curMonthKeys = buckets.filter((b) => monthKeyOf(b.date) === curMonthKey).map((b) => b.date)
  const prevMonthKeys = buckets.filter((b) => monthKeyOf(b.date) === prevMonthKey).map((b) => b.date)
  addRow("month_vs_prev", "Mês atual", "Mês corrido vs mês anterior completo", curMonthKeys, prevMonthKeys, false)

  const last30Keys = buckets.slice(-30).map((b) => b.date)
  const prev30Keys = buckets.slice(-60, -30).map((b) => b.date)
  addRow("30_vs_prev30", "Últimos 30 dias", "Janela móvel de 30 dias vs os 30 anteriores", last30Keys, prev30Keys, false)

  return rows
}

// ---------------------------------------------------------------------------
// PLANEJAMENTO (PLANO ATIVO x REALIZADO)
// ---------------------------------------------------------------------------

export function computePlanning(
  plan: ActivePlan | null,
  buckets: DailyBucket[],
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): PlanningStatistics {
  if (!plan || plan.items.length === 0) {
    return {
      hasPlan: false,
      weeklyTargetMinutes: 0,
      weeklyTargetQuestions: 0,
      weeklyTargetDays: 0,
      actualWeekMinutes: 0,
      actualWeekQuestions: 0,
      actualWeekDays: 0,
      adherencePct: null,
      series: [],
    }
  }

  const weeklyTargetMinutes = Math.max(0, Math.round((plan.weeklyHours ?? 0) * 60))
  const weeklyTargetQuestions = Math.max(0, plan.weeklyQuestions ?? 0)
  const weeklyTargetDays = Math.max(0, plan.weeklyDays ?? 0)

  const today = todayKey(now, timezone)
  const monday = mondayKeyOf(today)
  const weekKeys = monday ? keysBetween(monday, today) : [today]

  const byDate = new Map(buckets.map((b) => [b.date, b]))
  const plannedByWeekday = new Map<number, number>()
  plan.items.forEach((it) => {
    const cur = plannedByWeekday.get(it.dayOfWeek) ?? 0
    plannedByWeekday.set(it.dayOfWeek, cur + it.durationMinutes)
  })

  const dayKeys: string[] = [today]
  for (let i = 1; i <= 27; i++) {
    const k = addDaysToKey(today, -i)
    if (k) dayKeys.push(k)
  }
  dayKeys.reverse()

  const series: PlanningSeriesPoint[] = dayKeys.map((date) => {
    const dow = weekdayOfKey(date) ?? 0
    const b = byDate.get(date)
    return {
      date,
      weekday: dow,
      plannedMinutes: plannedByWeekday.get(dow) ?? 0,
      actualMinutes: b?.minutes ?? 0,
      actualSessions: b?.sessions ?? 0,
    }
  })

  let actualWeekMinutes = 0
  let actualWeekQuestions = 0
  let actualWeekDays = 0
  weekKeys.forEach((k) => {
    const b = byDate.get(k)
    if (b && b.minutes > 0) {
      actualWeekMinutes += b.minutes
      actualWeekQuestions += b.questions
      actualWeekDays += 1
    }
  })

  const adherencePct =
    weeklyTargetMinutes > 0 ? (actualWeekMinutes / weeklyTargetMinutes) * 100 : null

  return {
    hasPlan: true,
    weeklyTargetMinutes,
    weeklyTargetQuestions,
    weeklyTargetDays,
    actualWeekMinutes,
    actualWeekQuestions,
    actualWeekDays,
    adherencePct,
    series,
  }
}

// ---------------------------------------------------------------------------
// REVISÕES
// ---------------------------------------------------------------------------

export function computeRevisionStatistics(
  items: ReviewItemRow[],
  completedLast30: number,
  now: Date,
  disciplineRegistry: Map<string, DisciplineMeta>
): RevisionStatistics {
  const todayIso = now.toISOString().slice(0, 10)
  let total = 0
  let overdue = 0
  let dueToday = 0
  let upcoming = 0

  const byDiscipline = new Map<string, RevisionDisciplineStat>()

  const addToDiscipline = (disciplineId: string | null, key: "overdue" | "dueToday" | "upcoming") => {
    const id = disciplineId ?? ""
    let entry = byDiscipline.get(id)
    if (!entry) {
      entry = {
        disciplineId: id,
        name: disciplineRegistry.get(id)?.name ?? "Sem disciplina",
        overdue: 0,
        dueSoon: 0,
        total: 0,
      }
      byDiscipline.set(id, entry)
    }
    entry.total += 1
    if (key === "overdue") entry.overdue += 1
    else entry.dueSoon += 1
  }

  items.forEach((it) => {
    if (!it.nextReviewAt) return
    total += 1
    const dueIso = it.nextReviewAt.slice(0, 10)
    if (dueIso < todayIso) {
      overdue += 1
      addToDiscipline(it.disciplineId, "overdue")
    } else if (dueIso === todayIso) {
      dueToday += 1
      addToDiscipline(it.disciplineId, "dueToday")
    } else {
      upcoming += 1
      addToDiscipline(it.disciplineId, "upcoming")
    }
  })

  const done = completedLast30
  const completionRate = done + total > 0 ? (done / (done + total)) * 100 : null

  return {
    totalPending: total,
    overdue,
    dueToday,
    upcoming,
    completedLast30: done,
    completionRate,
    byDiscipline: [...byDiscipline.values()].sort((a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon),
  }
}

// ---------------------------------------------------------------------------
// EDITAL
// ---------------------------------------------------------------------------

export function computeEditalCoverage(
  userDisciplines: UserDisciplineInput[],
  disciplineStats: DisciplineStat[],
  disciplineRegistry: Map<string, DisciplineMeta>,
  _now: Date
): EditalCoverage {
  const statsByDiscipline = new Map(disciplineStats.map((d) => [d.disciplineId, d]))

  const byDiscipline: EditalDisciplineStat[] = userDisciplines.map((u) => {
    const meta = disciplineRegistry.get(u.disciplineId)
    const stats = statsByDiscipline.get(u.disciplineId)
    return {
      disciplineId: u.disciplineId,
      name: meta?.name ?? stats?.name ?? "Sem disciplina",
      area: meta?.area ?? stats?.area ?? null,
      status: u.status ?? "NOT_STARTED",
      studiedMinutes: stats?.minutes ?? 0,
      daysSinceLastStudy: stats?.daysSinceLastStudy ?? null,
    }
  }).sort((a, b) => (b.studiedMinutes - a.studiedMinutes) || (a.name.localeCompare(b.name)))

  const total = byDiscipline.length
  const completed = byDiscipline.filter((d) => d.status === "CONCLUIDA" || d.status === "COMPLETED" || d.status === "CONCLUÍDA").length
  const studying = byDiscipline.filter((d) => d.status === "EM_ESTUDO" || d.status === "STUDYING").length
  const revising = byDiscipline.filter((d) => d.status === "EM_REVISAO" || d.status === "REVISING").length
  const notStarted = byDiscipline.filter((d) => d.status === "NOT_STARTED").length

  return {
    total,
    completed,
    studying,
    revising,
    notStarted,
    percentage: total > 0 ? (completed / total) * 100 : 0,
    byDiscipline,
  }
}

// ---------------------------------------------------------------------------
// PRODUTIVIDADE
// ---------------------------------------------------------------------------

/**
 * FÓRMULA (produtividade, 0-100): média ponderada com pesos documentados.
 * Sem questões suficientes (≥5), o peso da acurácia é redistribuído para
 * foco e constância. Retorna null quando há menos de 3 sessões no período.
 *
 *   Atividade 40% → minutos ativos / duração total
 *   Acurácia 30%  → acurácia/100 (somente com ≥5 questões)
 *   Foco 20%      → foco médio (%) / 100
 *   Constância 10%→ dias estudados nos últimos 7 / 7
 */
export function computeProductivity(
  sessions: SessionRecord[],
  questionStats: QuestionStatistics,
  focusPct: number | null,
  studiedDaysLast7: number
): ProductivityStatistics {
  if (sessions.length === 0) {
    return { score: null, breakdown: { activeRatioScore: 0, accuracyScore: 0, focusScore: 0, consistencyScore: 0 } }
  }

  const totalDuration = sessions.reduce((acc, s) => acc + s.durationMinutes, 0)
  const totalActive = sessions.reduce((acc, s) => acc + activeMinutesOf(s), 0)
  const activeRatioScore = totalDuration > 0 ? totalActive / totalDuration : 0

  const hasAccuracy = questionStats.total >= 5
  const accuracyScore = hasAccuracy && questionStats.accuracy !== null ? questionStats.accuracy / 100 : null
  const focusScore = focusPct !== null ? focusPct / 100 : null
  const consistencyScore = studiedDaysLast7 / 7

  let score: number | null
  if (sessions.length < 3) {
    score = null
  } else if (hasAccuracy) {
    score = activeRatioScore * 40 + (accuracyScore ?? 0) * 30 + (focusScore ?? 0) * 20 + consistencyScore * 10
  } else {
    score = activeRatioScore * 40 + (focusScore ?? 0) * 45 + consistencyScore * 15
  }

  return {
    score: score === null ? null : Math.round(Math.min(100, Math.max(0, score))),
    breakdown: {
      activeRatioScore: Math.round(activeRatioScore * 100),
      accuracyScore: accuracyScore !== null ? Math.round(accuracyScore * 100) : 0,
      focusScore: focusScore !== null ? Math.round(focusScore * 100) : 0,
      consistencyScore: Math.round(consistencyScore * 100),
    },
  }
}

// ---------------------------------------------------------------------------
// ANÁLISE INTELIGENTE (INSIGHTS)
// ---------------------------------------------------------------------------

export interface InsightInput {
  hasPlan: boolean
  sessionsInRange: number
  hoursOfDay: HourBucket[]
  focusPct: number | null
  questionStats: QuestionStatistics
  streaks: StreakStatistics
  comparisons: ComparisonRow[]
  planning: PlanningStatistics
  revision: RevisionStatistics
  disciplineStats: DisciplineStat[]
  topicStats: TopicStat[]
  timeCards: TimeCardStatistics
  productivity: ProductivityStatistics
  daysSinceLastStudy: number | null
  questionsPerDay: number
}

export function generateInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = []
  const todayRow = input.comparisons.find((c) => c.id === "today_vs_avg")
  const weekRow = input.comparisons.find((c) => c.id === "week_vs_prev")
  const monthRow = input.comparisons.find((c) => c.id === "month_vs_prev")

  if (input.sessionsInRange < 3) {
    insights.push({
      id: "poucas_sessoes",
      severity: "info",
      title: "Ainda poucos dados",
      message: "Complete ao menos 3 sessões de estudo para que a análise comece a produzir recomendações personalizadas.",
    })
    return insights
  }

  const minToday = todayRow?.metrics.minutes
  if (minToday && minToday.current !== null && minToday.previous !== null && minToday.previous > 0) {
    if (minToday.current >= minToday.previous * 1.2) {
      insights.push({
        id: "hoje_acima",
        severity: "positive",
        title: "Ritmo acima da média",
        message: `Hoje você já estudou ${formatDurationRaw(minToday.current)} — bônus de +${Math.round(((minToday.current - minToday.previous) / minToday.previous) * 100)}% sobre sua média por dia estudado.`,
      })
    } else if (minToday.current <= minToday.previous * 0.5) {
      insights.push({
        id: "hoje_abaixo",
        severity: "warning",
        title: "Começo de dia lento",
        message: "Você está abaixo de 50% da sua média diária. Uma sessão de 25 minutos já recoloca o ritmo.",
      })
    }
  }

  if (input.streaks.current >= 3) {
    insights.push({
      id: "streak",
      severity: "positive",
      title: `Sequência de ${input.streaks.current} dias`,
      message:
        input.streaks.currentEndsToday
          ? "Você está em plena sequência de estudos. Mantenha o hábito hoje!"
          : `Você manteve ${input.streaks.current} dias consecutivos. Sua maior sequência foi de ${input.streaks.longest} dias.`,
    })
  }

  if (input.streaks.longest >= 5 && input.streaks.current < 2) {
    insights.push({
      id: "sequencia_reinicio",
      severity: "info",
      title: "Reinicie sua sequência",
      message: `Sua maior sequência foi de ${input.streaks.longest} dias. Um estudo hoje retoma o hábito — sequências curtas ajudam mais que sessões longas isoladas.`,
    })
  }

  const q = input.questionStats
  if (q.total >= 10 && q.accuracy !== null && q.accuracy < 60) {
    insights.push({
      id: "acuraciabaixa",
      severity: "warning",
      title: `Acurácia de ${Math.round(q.accuracy)}%`,
      message: `Com ${q.total} questões resolvidas, ${q.wrong} erros. Revise os erros dos últimos dias antes de avançar para conteúdo novo.`,
    })
  }

  const criticalTopics = input.topicStats
    .filter((t) => t.questions >= 5 && t.accuracy !== null && t.accuracy < 50)
    .slice(0, 3)
  if (criticalTopics.length > 0) {
    insights.push({
      id: "topicos_fracos",
      severity: "warning",
      title: "Tópicos que precisam de revisão",
      message: criticalTopics
        .map((t) => `${t.topicName} (${Math.round(t.accuracy ?? 0)}%)`)
        .join(", "),
    })
  }

  const bestHour = input.hoursOfDay.find((h) => h.best)
  if (bestHour) {
    insights.push({
      id: "melhor_periodo",
      severity: "positive",
      title: `Melhor rendimento: ${bestHour.label}`,
      message: `Seu melhor desempenho registrado (≤ acurácia com ${bestHour.questions} questões) aconteceu no período da ${bestHour.label}. Considere fixar as sessões de prática nesse horário.`,
    })
  } else {
    const bestByMinutes = [...input.hoursOfDay].sort((a, b) => b.minutes - a.minutes)[0]
    if (bestByMinutes && bestByMinutes.minutes > 0) {
      insights.push({
        id: "horario_frequente",
        severity: "info",
        title: `Horário mais produtivo: ${bestByMinutes.label}`,
        message: `Você estuda mais no período da ${bestByMinutes.label} (${formatDurationRaw(bestByMinutes.minutes)}). Consolidar esse horário tende a criar consistência.`,
      })
    }
  }

  if (weekRow) {
    const w = weekRow.metrics.minutes
    if (w.previous && w.previous > 0 && w.current !== null) {
      const pct = ((w.current - w.previous) / w.previous) * 100
      if (pct >= 20) {
        insights.push({
          id: "semana_melhor",
          severity: "positive",
          title: "Semana em alta",
          message: `Nesta semana você estuda ${Math.round(pct)}% a mais que na anterior — continue assim.`,
        })
      } else if (pct <= -20) {
        insights.push({
          id: "semana_pior",
          severity: "warning",
          title: "Semana abaixo do esperado",
          message: `Seu tempo de estudo caiu ${Math.abs(Math.round(pct))}% em relação à semana anterior.`,
        })
      }
    }
  }

  if (input.hasPlan && input.planning.adherencePct !== null) {
    if (input.planning.adherencePct >= 100) {
      insights.push({
        id: "plano_aderente",
        severity: "positive",
        title: "Plano 100% cumprido",
        message: `Você já cumpriu ${Math.round(input.planning.adherencePct)}% da meta semanal de ${formatDurationRaw(input.planning.weeklyTargetMinutes)}.`,
      })
    } else if (input.planning.adherencePct < 50) {
      insights.push({
        id: "plano_baixa_aderencia",
        severity: "warning",
        title: "Plano abaixo de 50%",
        message: `Você cumpriu ${Math.round(input.planning.adherencePct)}% da meta semanal (${formatDurationRaw(input.planning.actualWeekMinutes)} de ${formatDurationRaw(input.planning.weeklyTargetMinutes)} planejados).`,
      })
    }
  }

  if (input.revision.overdue > 0) {
    insights.push({
      id: "revisoes_atrasadas",
      severity: "danger",
      title: `${input.revision.overdue} revisões atrasadas`,
      message: "Revisões atrasadas aceleram o esquecimento. Reserve 15 minutos para zerar a fila de revisões.",
    })
  } else if (input.revision.totalPending > 0) {
    insights.push({
      id: "revisoes_dia",
      severity: "info",
      title: `${input.revision.totalPending} revisões na fila`,
      message: `Há ${input.revision.totalPending} itens programados (${input.revision.dueToday} para hoje). Revisar em pequenos blocos mantém a memória estável.`,
    })
  }

  const priority = input.disciplineStats.slice().sort((a, b) => b.attentionScore - a.attentionScore)[0]
  if (priority && priority.attentionScore >= 40) {
    insights.push({
      id: "prioridade",
      severity: "warning",
      title: `Foco sugerido: ${priority.name}`,
      message: `Entre suas matérias, ${priority.name} concentra os maiores sinais de atenção: ${priority.attentionReasons[0] ?? "não estudada há tempo"}.`,
    })
  }

  if (input.daysSinceLastStudy !== null && input.daysSinceLastStudy > 3) {
    insights.push({
      id: "sem_estudo",
      severity: "danger",
      title: `${input.daysSinceLastStudy} dias sem estudar`,
      message: "Após pausas longas, comece com uma revisão rápida antes do conteúdo novo.",
    })
  }

  const bestPeriod = input.hoursOfDay.filter((h) => h.minutes > 0).sort((a, b) => b.accuracy ?? -1 - (a.accuracy ?? -1))
  void bestPeriod

  if (input.productivity.score !== null && monthRow) {
    const m = monthRow.metrics.accuracy
    if (m && m.current !== null && m.previous !== null && m.delta !== null && m.delta >= 5) {
      insights.push({
        id: "acuraciamensal",
        severity: "positive",
        title: "Acurácia em evolução",
        message: `Sua acurácia subiu ${Math.round(m.delta)} pontos percentuais no mês. O padrão de revisão está dando resultado.`,
      })
    }
  }

  insights.push({
    id: "visao_geral",
    severity: "info",
    title: "Visão do período",
    message: `No período, você somou ${q.total > 0 ? `${q.total} questões (${Math.round(q.accuracy ?? 0)}% de acerto)` : "estudo registrado sem questões"} e ${formatDurationRaw(input.timeCards.totalMinutes)} de estudo.`,
  })

  return insights
}

// ---------------------------------------------------------------------------
// PRIORIDADES
// ---------------------------------------------------------------------------

export function computePriorities(
  disciplineStats: DisciplineStat[],
  _revisionStats: RevisionStatistics
): PriorityItem[] {
  return disciplineStats
    .map((d) => {
      const reasons = [...d.attentionReasons]
      let action = "Siga o plano de estudo para esta disciplina."
      if (d.classification === "CRITICO") {
        action = "Retome o estudo imediatamente — comece por uma revisão de 20 minutos."
      } else if (d.classification === "ATENCAO") {
        action = "Priorize esta disciplina nas próximas 2 sessões."
      } else if (d.classification === "EM_DESENVOLVIMENTO") {
        action = "Mantenha a constância: mais um ciclo de prática em 2 dias."
      } else {
        action = "Mantenha com revisões espaçadas a cada 7 dias."
      }
      return {
        disciplineId: d.disciplineId,
        name: d.name,
        area: d.area,
        score: d.attentionScore,
        reasons,
        action,
      }
    })
    .sort((a, b) => b.score - a.score)
}

// ---------------------------------------------------------------------------
// RELATÓRIOS SEMANAIS / MENSAIS
// ---------------------------------------------------------------------------

function reportDeltaText(delta: number | null, isPct: boolean, invert: boolean): string {
  if (delta === null) return "—"
  let sign = ""
  if (delta > 0) sign = "+"
  else if (delta < 0) sign = "-"
  const value = isPct ? `${sign}${Math.round(Math.abs(delta))}pp` : `${sign}${Math.abs(delta)}`
  const up = invert ? delta < 0 : delta > 0
  let arrow = "▼"
  if (up) arrow = "▲"
  else if (delta === 0) arrow = "■"
  return `${value} ${arrow}`
}

/** Relatório: últimos 7 dias vs os 7 anteriores. */
export function computeWeeklyReport(
  buckets: DailyBucket[],
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): ReportRow[] {
  const today = todayKey(now, timezone)
  const last7Start = addDaysToKey(today, -6)
  const prevStart = last7Start ? addDaysToKey(last7Start, -7) : null
  const prevEnd = last7Start ? addDaysToKey(last7Start, -1) : null

  const cur = last7Start ? buckets.filter((b) => b.date >= last7Start && b.date <= today) : []
  const prev = prevStart && prevEnd ? buckets.filter((b) => b.date >= prevStart && b.date <= prevEnd) : []
  const a = aggregateBuckets(cur)
  const b = aggregateBuckets(prev)

  const fmt = (n: number) => (n === 0 ? "0" : n.toLocaleString("pt-BR"))
  const fmtDur = (n: number) => formatDurationRaw(n)
  const numRow = (id: string, label: string, c: number, p: number, invert = false): ReportRow => ({
    id,
    label,
    current: fmt(c),
    previous: fmt(p),
    deltaLabel: reportDeltaText(c - p, false, invert),
    positive: invert ? c < p : c > p,
  })
  const durRow = (id: string, label: string, c: number, p: number): ReportRow => ({
    id,
    label,
    current: fmtDur(c),
    previous: fmtDur(p),
    deltaLabel: reportDeltaText(c - p, false, false),
    positive: c > p,
  })

  const rows: ReportRow[] = []
  rows.push(durRow("tempo", "Tempo de estudo", a.minutes, b.minutes))
  rows.push(numRow("sessoes", "Sessões", a.sessions, b.sessions))
  rows.push(numRow("dias", "Dias estudados", a.studiedDays.size, b.studiedDays.size))
  rows.push(numRow("questoes", "Questões", a.questions, b.questions))
  rows.push(numRow("acertos", "Acertos", a.correct, b.correct))
  const accCur = a.accuracy
  const accPrev = b.accuracy
  rows.push({
    id: "acuraciia",
    label: "Acurácia",
    current: accCur !== null ? `${Math.round(accCur)}%` : "—",
    previous: accPrev !== null ? `${Math.round(accPrev)}%` : "—",
    deltaLabel: reportDeltaText(
      accCur !== null && accPrev !== null ? accCur - accPrev : null,
      true,
      false
    ),
    positive: accCur !== null && accPrev !== null && accCur >= accPrev,
  })
  const fCur = a.focusAvg
  const fPrev = b.focusAvg
  rows.push({
    id: "foco",
    label: "Foco médio",
    current: fCur !== null ? `${Math.round(fCur)}%` : "—",
    previous: fPrev !== null ? `${Math.round(fPrev)}%` : "—",
    deltaLabel: reportDeltaText(fCur !== null && fPrev !== null ? fCur - fPrev : null, true, false),
    positive: fCur !== null && fPrev !== null && fCur >= fPrev,
  })
  rows.push(numRow("paginas", "Páginas lidas", a.pages, b.pages))
  rows.push(numRow("flashcards", "Flashcards", a.flashcards, b.flashcards))
  rows.push(numRow("pausa", "Minutos em pausa", a.pausedMinutes, b.pausedMinutes, true))

  return rows
}

/** Relatório: mês corrido vs mês anterior completo. */
export function computeMonthlyReport(
  buckets: DailyBucket[],
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): ReportRow[] {
  const parts = localParts(now.toISOString(), timezone)
  const curMonth = parts ? monthKeyFromYmd(parts.year, parts.month) : monthKeyOf(todayKey(now, timezone))
  const prevMonth = addMonthsToKey(curMonth, -1)
  const cur = buckets.filter((b) => monthKeyOf(b.date) === curMonth)
  const prev = buckets.filter((b) => monthKeyOf(b.date) === prevMonth)
  const a = aggregateBuckets(cur)
  const b = aggregateBuckets(prev)

  const rows: ReportRow[] = []
  const fmt = (n: number) => (n === 0 ? "0" : n.toLocaleString("pt-BR"))

  rows.push({
    id: "tempo",
    label: "Tempo de estudo",
    current: formatDurationRaw(a.minutes),
    previous: formatDurationRaw(b.minutes),
    deltaLabel: reportDeltaText(a.minutes - b.minutes, false, false),
    positive: a.minutes > b.minutes,
  })
  rows.push({
    id: "dias",
    label: "Dias estudados",
    current: fmt(a.studiedDays.size),
    previous: fmt(b.studiedDays.size),
    deltaLabel: reportDeltaText(a.studiedDays.size - b.studiedDays.size, false, false),
    positive: a.studiedDays.size > b.studiedDays.size,
  })
  rows.push({
    id: "questoes",
    label: "Questões",
    current: fmt(a.questions),
    previous: fmt(b.questions),
    deltaLabel: reportDeltaText(a.questions - b.questions, false, false),
    positive: a.questions > b.questions,
  })
  rows.push({
    id: "sessoes",
    label: "Sessões",
    current: fmt(a.sessions),
    previous: fmt(b.sessions),
    deltaLabel: reportDeltaText(a.sessions - b.sessions, false, false),
    positive: a.sessions > b.sessions,
  })
  rows.push({
    id: "acuraciia",
    label: "Acurácia",
    current: a.accuracy !== null ? `${Math.round(a.accuracy)}%` : "—",
    previous: b.accuracy !== null ? `${Math.round(b.accuracy)}%` : "—",
    deltaLabel: reportDeltaText(
      a.accuracy !== null && b.accuracy !== null ? a.accuracy - b.accuracy : null,
      true,
      false
    ),
    positive: a.accuracy !== null && b.accuracy !== null && a.accuracy >= b.accuracy,
  })
  rows.push({
    id: "foco",
    label: "Foco médio",
    current: a.focusAvg !== null ? `${Math.round(a.focusAvg)}%` : "—",
    previous: b.focusAvg !== null ? `${Math.round(b.focusAvg)}%` : "—",
    deltaLabel: reportDeltaText(a.focusAvg !== null && b.focusAvg !== null ? a.focusAvg - b.focusAvg : null, true, false),
    positive: a.focusAvg !== null && b.focusAvg !== null && a.focusAvg >= b.focusAvg,
  })
  rows.push({
    id: "paginas",
    label: "Páginas lidas",
    current: fmt(a.pages),
    previous: fmt(b.pages),
    deltaLabel: reportDeltaText(a.pages - b.pages, false, false),
    positive: a.pages > b.pages,
  })
  rows.push({
    id: "flashcards",
    label: "Flashcards revisados",
    current: fmt(a.flashcards),
    previous: fmt(b.flashcards),
    deltaLabel: reportDeltaText(a.flashcards - b.flashcards, false, false),
    positive: a.flashcards > b.flashcards,
  })

  return rows
}

// ---------------------------------------------------------------------------
// HEATMAP
// ---------------------------------------------------------------------------

export interface HeatmapCell {
  date: string
  minutes: number
  level: 0 | 1 | 2 | 3 | 4
}

/**
 * FÓRMULA (nível do heatmap): 0 = sem estudo; caso contrário, percentis sobre
 * os minutos do período: ≤25% nível 1, ≤50% nível 2, ≤75% nível 3, acima nível 4.
 */
export function buildHeatmap(buckets: DailyBucket[], days: number): HeatmapCell[] {
  const slice = slicesOfBuckets(buckets, days)
  const values = slice.filter((b) => b.minutes > 0).map((b) => b.minutes).sort((a, b) => a - b)
  const q25 = values[Math.floor(values.length * 0.25)] ?? 0
  const q50 = values[Math.floor(values.length * 0.5)] ?? 0
  const q75 = values[Math.floor(values.length * 0.75)] ?? 0

  return slice.map((b) => {
    let level: 0 | 1 | 2 | 3 | 4 = 0
    if (b.minutes > 0) {
      if (b.minutes > q75) level = 4
      else if (b.minutes > q50) level = 3
      else if (b.minutes > q25) level = 2
      else level = 1
    }
    return { date: b.date, minutes: b.minutes, level }
  })
}

// ---------------------------------------------------------------------------
// FORMATAÇÃO
// ---------------------------------------------------------------------------

export function formatDurationRaw(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min}min`
  if (min === 0) return `${h}h`
  return `${h}h ${String(min).padStart(2, "0")}min`
}

export function formatMinutesPct(v: number | null): string {
  if (v === null) return "—"
  return `${Math.round(v)}%`
}

export function formatBRDate(key: string): string {
  const d = keyToDate(key)
  if (!d) return key
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`
}

export function formatSmartDate(key: string, now: Date, timezone: string = DEFAULT_TIMEZONE): string {
  const today = todayKey(now, timezone)
  const diff = daysBetweenKeys(key, today)
  if (diff === 0) return "Hoje"
  if (diff === 1) return "Ontem"
  if (diff > 1 && diff <= 6) {
    const dow = weekdayOfKey(key)
    return dow !== null ? WEEKDAY_LABELS[dow] ?? key : key
  }
  return formatBRDate(key)
}