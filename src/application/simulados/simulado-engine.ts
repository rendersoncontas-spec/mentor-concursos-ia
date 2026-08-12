import type {
  DifficultyFilter,
  PlayerQuestion,
  ScoreBand,
  SimuladoAlternative,
  SimuladoAnalysisInsight,
  SimuladoComparisonEntry,
  SimuladoDisciplineResult,
  SimuladoHeader,
  SimuladoQuestionResult,
  SimuladoTimeStats,
  SimuladoTopicResult,
  TrendSummary,
} from "@/domain/simulados/types"

// ============================================================================
// ENCÓDIGO PURO DO SIMULADOR (sem IO) — testável de forma determinística
// ============================================================================

// ─── RNG determinístico (mulberry32) ────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rng = mulberry32(seed)
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i] as T
    arr[i] = arr[j] as T
    arr[j] = tmp
  }
  return arr
}

// ─── Normalização de respostas ──────────────────────────────────────────────

export function normalizeAnswer(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw.trim().toUpperCase().replace(/\s+/g, " ")
}

const CERTO_SET = new Set(["C", "CERTO", "V", "VERDADEIRO", "VERDADEIRA"])
const ERRADO_SET = new Set(["E", "ERRADO", "F", "FALSO", "FALSA"])

/** Questão é do estilo Certo/Errado (sem alternativas A-E). */
export function isCertoErradoQuestion(correctAnswer: string | null | undefined): boolean {
  const norm = normalizeAnswer(correctAnswer)
  return CERTO_SET.has(norm) || ERRADO_SET.has(norm)
}

/** Compara a resposta do usuário com o gabarito de forma robusta. */
export function checkAnswer(
  correctAnswer: string | null | undefined,
  selectedAnswer: string | null | undefined
): boolean {
  if (!selectedAnswer) return false
  const user = normalizeAnswer(selectedAnswer)
  const expected = normalizeAnswer(correctAnswer)
  if (!expected) return false
  if (CERTO_SET.has(user) && CERTO_SET.has(expected)) return true
  if (ERRADO_SET.has(user) && ERRADO_SET.has(expected)) return true
  if (CERTO_SET.has(user) || ERRADO_SET.has(user)) return false
  return user === expected
}

// ─── Dificuldade ────────────────────────────────────────────────────────────

export function difficultyLabelOf(level: number | null): string | null {
  if (level === null || level === undefined) return null
  if (level <= 1) return "Muito Fácil"
  if (level === 2) return "Fácil"
  if (level === 3) return "Média"
  if (level === 4) return "Difícil"
  return "Muito Difícil"
}

export function difficultyBucket(level: number | null): "FACIL" | "MEDIA" | "DIFICIL" | "SEM" {
  if (level === null || level === undefined) return "SEM"
  if (level <= 2) return "FACIL"
  if (level <= 3) return "MEDIA"
  return "DIFICIL"
}

/** Existe dificuldade real cadastrada suficiente para o modo adaptativo? */
export function hasDifficultyData(levels: (number | null)[]): boolean {
  const known = levels.filter((l): l is number => l !== null && l !== undefined)
  if (known.length === 0) return false
  const distinct = new Set(known).size
  return known.length >= 10 && distinct >= 2
}

export function matchesDifficultyFilter(
  level: number | null,
  filter: DifficultyFilter
): boolean {
  if (filter === "TODAS" || filter === "ADAPTATIVO") return true
  const bucket = difficultyBucket(level)
  if (filter === "FACIL") return bucket === "FACIL"
  if (filter === "MEDIA") return bucket === "MEDIA"
  return bucket === "DIFICIL"
}

// ─── Distribuição por disciplina ────────────────────────────────────────────

export interface DistributionResult {
  ok: boolean
  counts: Record<string, number>
  error: string | null
}

/**
 * Valida a distribuição personalizada: a soma deve ser EXATAMENTE igual ao total.
 * Se distribution estiver vazia, distribui automaticamente (arredondamento justo).
 */
export function buildDistribution(
  total: number,
  disciplineIds: string[],
  distribution: Record<string, number>
): DistributionResult {
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, counts: {}, error: "Quantidade de questões inválida." }
  }
  if (disciplineIds.length === 0) {
    return { ok: false, counts: {}, error: "Selecione ao menos uma disciplina." }
  }

  const requested = Object.entries(distribution)
    .filter(([id]) => disciplineIds.includes(id))
    .map(([id, n]) => ({ id, n: Math.floor(Number(n) || 0) }))

  if (requested.length > 0) {
    const sum = requested.reduce((acc, r) => acc + r.n, 0)
    if (sum !== total) {
      return {
        ok: false,
        counts: {},
        error: `A distribuição soma ${sum} questão(ões), mas o total do simulado é ${total}. Ajuste os valores para que a soma seja exatamente ${total}.`,
      }
    }
    const counts: Record<string, number> = {}
    disciplineIds.forEach((id) => (counts[id] = 0))
    requested.forEach((r) => (counts[r.id] = r.n))
    return { ok: true, counts, error: null }
  }

  // Distribuição automática: igualitária com arredondamento justo.
  const base = Math.floor(total / disciplineIds.length)
  const remainder = total % disciplineIds.length
  const counts: Record<string, number> = {}
  disciplineIds.forEach((id, i) => (counts[id] = base + (i < remainder ? 1 : 0)))
  return { ok: true, counts, error: null }
}

// ─── Seleção do pool ────────────────────────────────────────────────────────

export interface QuestionPoolItem {
  id: string
  disciplineId: string | null
  topicId: string | null
  difficultyLevel: number | null
}

export interface PickPoolOptions {
  counts: Record<string, number>
  topicIds: string[]
  difficulty: DifficultyFilter
  /** IDs de questões cuja ÚLTIMA tentativa do usuário foi errada. */
  wrongQuestionIds: Set<string>
  /** true = somente questões erradas anteriormente (filtro duro). */
  onlyWrong: boolean
  /** true = priorizar erradas anteriormente dentro de cada disciplina. */
  prioritizeWrong: boolean
  seed: number
  /** IDs a excluir (ex.: repetir menos em Desafio). */
  excludeIds?: Set<string>
}

export interface PickPoolResult {
  picked: QuestionPoolItem[]
  availableByDiscipline: Record<string, number>
  totalAvailable: number
  error: string | null
}

/**
 * Seleciona o pool respeitando quotas por disciplina, filtros de tópico e
 * dificuldade, e as restrições de erros anteriores. Retorna erro honesto se
 * a base disponível não suportar a configuração.
 */
export function pickQuestionPool(
  pool: QuestionPoolItem[],
  opts: PickPoolOptions
): PickPoolResult {
  if (pool.length === 0) return { picked: [], availableByDiscipline: {}, totalAvailable: 0, error: null }

  const byDiscipline = new Map<string, QuestionPoolItem[]>()
  pool.forEach((q) => {
    const key = q.disciplineId ?? "SEM_DISCIPLINA"
    const list = byDiscipline.get(key) ?? []
    list.push(q)
    byDiscipline.set(key, list)
  })

  const availableByDiscipline: Record<string, number> = {}
  const filtered = new Map<string, QuestionPoolItem[]>()
  byDiscipline.forEach((list, disc) => {
    const eligible = seededShuffle(list, opts.seed ^ hashString(disc),).filter((q) => {
      if (opts.excludeIds?.has(q.id)) return false
      if (opts.topicIds.length > 0 && (!q.topicId || !opts.topicIds.includes(q.topicId))) return false
      if (!matchesDifficultyFilter(q.difficultyLevel, opts.difficulty)) return false
      if (opts.onlyWrong && !opts.wrongQuestionIds.has(q.id)) return false
      return true
    })
    if (opts.prioritizeWrong && !opts.onlyWrong) {
      const wrong = eligible.filter((q) => opts.wrongQuestionIds.has(q.id))
      const rest = eligible.filter((q) => !opts.wrongQuestionIds.has(q.id))
      filtered.set(disc, [...wrong, ...rest])
    } else {
      filtered.set(disc, eligible)
    }
    availableByDiscipline[disc] = eligible.length
  })

  const totalAvailable = [...filtered.values()].reduce((acc, l) => acc + l.length, 0)

  // Indicador por disciplina: quantas ainda restam após as quotas.
  const remainingBy = new Map(
    [...filtered.entries()].map(([disc, list]) => [disc, [...list]])
  )
  const wantedTotal = Object.values(opts.counts).reduce((a, b) => a + b, 0)
  const picked: QuestionPoolItem[] = []
  const used = new Set<string>()

  const takeOne = (disc: string): QuestionPoolItem | null => {
    const rest = remainingBy.get(disc) ?? []
    while (rest.length > 0) {
      const q = rest.shift()
      if (q && !used.has(q.id)) {
        used.add(q.id)
        return q
      }
    }
    return null
  }

  // 1ª passada: respeitar as quotas por disciplina.
  filtered.forEach((_list, disc) => {
    const want = opts.counts[disc] ?? 0
    for (let i = 0; i < want; i++) {
      const q = takeOne(disc)
      if (q) picked.push(q)
    }
  })

  // 2ª passada: completar com o excedente das disciplinas ENVOLVIDAS nas quotas.
  if (wantedTotal > picked.length) {
    const fillSource = Object.keys(opts.counts).filter((d) => remainingBy.get(d)?.length)
    let idx = 0
    while (picked.length < wantedTotal && fillSource.length > 0) {
      const disc = fillSource[idx % fillSource.length] as string
      const q = takeOne(disc)
      if (!q) {
        fillSource.splice(idx % fillSource.length, 1)
        continue
      }
      picked.push(q)
      idx++
    }
  }

  if (picked.length < wantedTotal) {
    return {
      picked,
      availableByDiscipline,
      totalAvailable,
      error: `Apenas ${totalAvailable} questão(ões) disponível(is) com os filtros atuais para as ${wantedTotal} solicitada(s). Reduza a quantidade ou ajuste os filtros.`,
    }
  }

  return { picked, availableByDiscipline, totalAvailable, error: null }
}

function hashString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ─── Correção e resultado ───────────────────────────────────────────────────

export interface RawAnswer {
  questionId: string
  orderIndex: number
  selectedAnswer: string | null
  isMarked: boolean
  responseTimeSeconds: number | null
}

export interface RawQuestion {
  id: string
  disciplineId: string | null
  disciplineName: string
  topicId: string | null
  topicName: string | null
  correctAnswer: string
  statement: string
  alternatives: SimuladoAlternative[] | null
  isCertoErrado: boolean
  explanation: string | null
  difficultyLevel: number | null
}

export interface CorrectedQuestion extends RawQuestion, RawAnswer {
  isCorrect: boolean | null
  answered: boolean
}

/** Corrige todas as respostas (null = em branco, não é erro nem acerto). */
export function correctAnswers(
  questions: RawQuestion[],
  answers: RawAnswer[]
): CorrectedQuestion[] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  return answers
    .map((a) => {
      const q = byId.get(a.questionId)
      if (!q) return null
      const isCorrect = a.selectedAnswer ? checkAnswer(q.correctAnswer, a.selectedAnswer) : null
      return {
        ...q,
        ...a,
        isCorrect,
        answered: a.selectedAnswer !== null && a.selectedAnswer !== undefined,
      }
    })
    .filter((x): x is CorrectedQuestion => x !== null)
    .sort((a, b) => a.orderIndex - b.orderIndex)
}

export function computeResultTotals(
  corrected: CorrectedQuestion[],
  totalSeconds: number | null
): {
  total: number
  answered: number
  correct: number
  wrong: number
  blank: number
  accuracy: number | null
  score: ScoreBand
  timeStats: SimuladoTimeStats
} {
  const total = corrected.length
  const answered = corrected.filter((c) => c.answered).length
  const correct = corrected.filter((c) => c.isCorrect === true).length
  const wrong = corrected.filter((c) => c.isCorrect === false).length
  const blank = total - answered
  const accuracy = answered > 0 ? (correct / answered) * 100 : null
  const ratio = accuracy === null ? 0 : accuracy / 100
  let score: ScoreBand = "BAIXO"
  if (ratio >= 0.85) score = "EXCELENTE"
  else if (ratio >= 0.7) score = "BOM"
  else if (ratio >= 0.5) score = "REGULAR"

  const times = corrected
    .filter((c) => c.responseTimeSeconds !== null && c.responseTimeSeconds !== undefined)
    .map((c) => c.responseTimeSeconds as number)
  const sum = times.reduce((a, b) => a + b, 0)
  const avgPerQuestion = times.length > 0 ? sum / times.length : null
  const correctTimes = corrected
    .filter((c) => c.isCorrect === true)
    .map((c) => c.responseTimeSeconds)
    .filter((t): t is number => t !== null && t !== undefined)
  const wrongTimes = corrected
    .filter((c) => c.isCorrect === false)
    .map((c) => c.responseTimeSeconds)
    .filter((t): t is number => t !== null && t !== undefined)
  const avgPerCorrect = correctTimes.length > 0 ? correctTimes.reduce((a, b) => a + b, 0) / correctTimes.length : null
  const avgPerWrong = wrongTimes.length > 0 ? wrongTimes.reduce((a, b) => a + b, 0) / wrongTimes.length : null

  return {
    total,
    answered,
    correct,
    wrong,
    blank,
    accuracy,
    score,
    timeStats: {
      totalSeconds: totalSeconds ?? 0,
      avgPerQuestionSeconds: avgPerQuestion === null ? null : Math.round(avgPerQuestion),
      avgPerCorrectSeconds: avgPerCorrect === null ? null : Math.round(avgPerCorrect),
      avgPerWrongSeconds: avgPerWrong === null ? null : Math.round(avgPerWrong),
    },
  }
}

export function computeByDiscipline(corrected: CorrectedQuestion[]): SimuladoDisciplineResult[] {
  const map = new Map<string, SimuladoDisciplineResult>()
  corrected.forEach((c) => {
    const key = c.disciplineId ?? c.disciplineName
    let entry = map.get(key)
    if (!entry) {
      entry = {
        disciplineId: c.disciplineId,
        disciplineName: c.disciplineName || "Sem disciplina",
        questions: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        accuracy: null,
      }
      map.set(key, entry)
    }
    entry.questions += 1
    if (c.isCorrect === true) entry.correct += 1
    else if (c.isCorrect === false) entry.wrong += 1
    else entry.blank += 1
  })
  const result = [...map.values()].map((e) => ({
    ...e,
    accuracy: e.questions > 0 ? (e.correct / e.questions) * 100 : null,
  }))
  return result.sort((a, b) => b.questions - a.questions)
}

export function computeByTopic(corrected: CorrectedQuestion[]): SimuladoTopicResult[] {
  const map = new Map<string, SimuladoTopicResult>()
  corrected.forEach((c) => {
    const key = c.topicId ?? c.topicName ?? "SEM_TOPICO"
    let entry = map.get(key)
    if (!entry) {
      entry = {
        topicId: c.topicId,
        topicName: c.topicName ?? "Sem tópico",
        disciplineName: c.disciplineName || "Sem disciplina",
        questions: 0,
        correct: 0,
        accuracy: null,
      }
      map.set(key, entry)
    }
    entry.questions += 1
    if (c.isCorrect === true) entry.correct += 1
  })
  const result = [...map.values()].map((e) => ({
    ...e,
    accuracy: e.questions > 0 ? (e.correct / e.questions) * 100 : null,
  }))
  return result.sort((a, b) => b.questions - a.questions)
}

// ─── Comparação com simulados anteriores ───────────────────────────────────

export function buildComparison(
  current: { accuracy: number | null; correct: number; wrong: number; total: number; timeSpentSeconds: number | null },
  previous: SimuladoHeader[]
): { comparison: SimuladoComparisonEntry[]; trend: TrendSummary } {
  const comparison: SimuladoComparisonEntry[] = previous
    .filter((p) => p.status === "FINISHED")
    .sort((a, b) => (a.simuladoDate ?? "").localeCompare(b.simuladoDate ?? ""))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      name: p.name,
      date: p.simuladoDate,
      accuracy: p.accuracy,
      correct: p.totalCorrect,
      wrong: p.totalWrong,
      total: p.totalQuestions,
      timeSpentSeconds: p.timeSpentSeconds,
    }))

  comparison.push({
    id: "atual",
    name: "Atual",
    date: new Date().toISOString().slice(0, 10),
    accuracy: current.accuracy,
    correct: current.correct,
    wrong: current.wrong,
    total: current.total,
    timeSpentSeconds: current.timeSpentSeconds,
  })

  const accuracyTrend = computeTrend(comparison.map((c) => c.accuracy))
  const correctTrend = computeTrend(comparison.map((c) => c.correct))
  const timeTrend = computeTimeTrend(comparison.map((c) => c.timeSpentSeconds))

  return {
    comparison,
    trend: { accuracy: accuracyTrend, correct: correctTrend, time: timeTrend },
  }
}

function computeTrend(values: (number | null)[]): "UP" | "STABLE" | "DOWN" | null {
  const v = values.filter((x): x is number => x !== null && x !== undefined)
  if (v.length < 3) return null
  const first = v[0] as number
  const last = v[v.length - 1] as number
  const diff = last - first
  const pct = first !== 0 ? Math.abs(diff) / Math.abs(first) : 0
  if (diff > 0 && pct >= 0.05) return "UP"
  if (diff < 0 && pct >= 0.05) return "DOWN"
  return "STABLE"
}

function computeTimeTrend(values: (number | null)[]): "FASTER" | "STABLE" | "SLOWER" | null {
  const v = values.filter((x): x is number => x !== null && x !== undefined)
  if (v.length < 3) return null
  const first = v[0] as number
  const last = v[v.length - 1] as number
  const diff = last - first
  const pct = first !== 0 ? Math.abs(diff) / Math.abs(first) : 0
  if (diff < 0 && pct >= 0.1) return "FASTER"
  if (diff > 0 && pct >= 0.1) return "SLOWER"
  return "STABLE"
}

// ─── Análise (somente com dados suficientes) ───────────────────────────────

export function analyzeResult(
  totals: ReturnType<typeof computeResultTotals>,
  byDiscipline: SimuladoDisciplineResult[],
  previousAvgAccuracy: number | null
): SimuladoAnalysisInsight[] {
  const insights: SimuladoAnalysisInsight[] = []

  if (totals.total === 0) return insights

  const answeredDisciplines = byDiscipline.filter((d) => d.questions >= 5)

  if (answeredDisciplines.length > 0) {
    const best = [...answeredDisciplines].sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1))[0]
    const worst = [...answeredDisciplines].sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101))[0]
    if (best && best.accuracy !== null)
      insights.push({ severity: "positive", message: `Seu melhor desempenho foi em ${best.disciplineName} (${Math.round(best.accuracy)}% de acerto).` })
    if (worst && worst.accuracy !== null && worst.questions > 0)
      insights.push({ severity: "warning", message: `Seu maior índice de erros ocorreu em ${worst.disciplineName} (${Math.round(worst.accuracy)}% de acerto).` })
  } else if (byDiscipline.length > 0) {
    insights.push({
      severity: "info",
      message: "Desempenho por disciplina: dados insuficientes para conclusões (menos de 5 questões por disciplina).",
    })
  }

  if (totals.accuracy !== null && totals.answered >= 5) {
    if (totals.accuracy >= 85)
      insights.push({ severity: "positive", message: `Excelente desempenho: ${Math.round(totals.accuracy)}% de acerto no simulado.` })
    else if (totals.accuracy < 50)
      insights.push({ severity: "warning", message: `Aproveitamento abaixo de 50%: revise os conteúdos dos erros antes de avançar.` })
  }

  if (totals.timeStats.avgPerQuestionSeconds !== null && totals.timeStats.avgPerQuestionSeconds > 180) {
    insights.push({
      severity: "warning",
      message: `Você gastou em média ${Math.round(totals.timeStats.avgPerQuestionSeconds / 60)}min por questão — acima dos 3min recomendados por questão.`,
    })
  }
  if (totals.timeStats.avgPerWrongSeconds !== null && totals.timeStats.avgPerCorrectSeconds !== null) {
    const ratio = totals.timeStats.avgPerWrongSeconds / Math.max(1, totals.timeStats.avgPerCorrectSeconds)
    if (ratio >= 1.5) {
      insights.push({
        severity: "info",
        message: `Você gastou ${Math.round(ratio * 10) / 10}x mais tempo nas questões erradas — provavelmente houve dúvida na resolução.`,
      })
    }
  }

  if (previousAvgAccuracy !== null && totals.accuracy !== null) {
    const diff = totals.accuracy - previousAvgAccuracy
    if (Math.abs(diff) >= 5) {
      insights.push({
        severity: diff > 0 ? "positive" : "warning",
        message:
          diff > 0
            ? `Seu desempenho foi ${Math.round(diff)}pp acima da sua média histórica (${Math.round(previousAvgAccuracy)}%).`
            : `Seu desempenho foi ${Math.round(Math.abs(diff))}pp abaixo da sua média histórica (${Math.round(previousAvgAccuracy)}%).`,
      })
    } else {
      insights.push({
        severity: "info",
        message: `Seu desempenho está estável em relação à sua média histórica (${Math.round(previousAvgAccuracy)}%).`,
      })
    }
  }

  return insights
}

export function averageAccuracy(headers: SimuladoHeader[]): number | null {
  const values = headers.filter((h) => h.accuracy !== null).map((h) => h.accuracy as number)
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

// ─── Personal Bests ─────────────────────────────────────────────────────────

export interface PersonalBestsResult {
  bestAccuracy: SimuladoHeader | null
  bestCorrect: SimuladoHeader | null
  fastestTime: SimuladoHeader | null
}

export function computePersonalBests(headers: SimuladoHeader[]): PersonalBestsResult {
  const finished = headers.filter((h) => h.status === "FINISHED")
  const byAccuracy = [...finished].sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1))[0] ?? null
  const byCorrect = [...finished].sort((a, b) => b.totalCorrect - a.totalCorrect)[0] ?? null
  const byTime = [...finished]
    .filter((h) => (h.timeSpentSeconds ?? 0) > 0)
    .sort((a, b) => (a.timeSpentSeconds ?? 0) - (b.timeSpentSeconds ?? 0))[0] ?? null
  return { bestAccuracy: byAccuracy, bestCorrect: byCorrect, fastestTime: byTime }
}

// ─── Modo adaptativo ────────────────────────────────────────────────────────

export interface AdaptivePickResult {
  next: QuestionPoolItem | null
  message: string | null
  state: { boosted: boolean; reduced: boolean; streak: number }
}

/**
 * Modo adaptativo: aumenta a dificuldade quando o usuário está acertando em
 * sequência, reduz quando está errando. Sem dados de dificuldade suficientes
 * na base, NÃO finge — retorna mensagem honesta.
 */
export function pickNextAdaptive(
  remaining: QuestionPoolItem[],
  lastResults: boolean[],
  allLevels: (number | null)[]
): AdaptivePickResult {
  if (!hasDifficultyData(allLevels)) {
    return { next: null, message: "Não há dados suficientes para adaptação de dificuldade.", state: { boosted: false, reduced: false, streak: 0 } }
  }
  const recent = lastResults.slice(-3)
  const correctStreak = recent.every((r) => r) && recent.length >= 2
  const wrongStreak = lastResults.slice(-2).every((r) => !r) && lastResults.length >= 2

  const buckets = { FACIL: [] as QuestionPoolItem[], MEDIA: [] as QuestionPoolItem[], DIFICIL: [] as QuestionPoolItem[] }
  remaining.forEach((q) => {
    const b = difficultyBucket(q.difficultyLevel)
    if (b !== "SEM") buckets[b].push(q)
  })

  let target: "FACIL" | "MEDIA" | "DIFICIL"
  let boosted = false
  let reduced = false
  if (correctStreak && buckets.DIFICIL.length > 0) {
    target = "DIFICIL"
    boosted = true
  } else if (wrongStreak && buckets.FACIL.length > 0) {
    target = "FACIL"
    reduced = true
  } else if (buckets.MEDIA.length > 0) {
    target = "MEDIA"
  } else if (buckets.FACIL.length > 0) {
    target = "FACIL"
  } else {
    target = "DIFICIL"
  }

  const pool = buckets[target]
  if (pool.length === 0) {
    return { next: null, message: null, state: { boosted: false, reduced: false, streak: correctStreak ? 2 : 0 } }
  }
  const next = pool[0] ?? null
  return { next, message: null, state: { boosted, reduced, streak: lastResults.length } }
}

/** Constrói o payload do player sem revelar o gabarito. */
export function toPlayerQuestion(
  q: { id: string; statement: string; alternatives: SimuladoAlternative[] | null; correctAnswer: string; disciplineId: string | null; disciplineName: string; topicName: string | null; difficultyLevel: number | null }
): PlayerQuestion {
  return {
    id: q.id,
    orderIndex: 0,
    statement: q.statement,
    alternatives: q.alternatives,
    isCertoErrado: isCertoErradoQuestion(q.correctAnswer),
    disciplineId: q.disciplineId ?? "UNKNOWN",
    disciplineName: q.disciplineName || "Sem disciplina",
    topicName: q.topicName,
    difficultyLabel: difficultyLabelOf(q.difficultyLevel),
  }
}

export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, "0")
  const ss = String(sec).padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function formatSimuladoQuestionResult(
  c: CorrectedQuestion,
  alternatives: SimuladoAlternative[] | null
): SimuladoQuestionResult {
  return {
    questionId: c.questionId,
    orderIndex: c.orderIndex,
    statement: c.statement,
    alternatives,
    isCertoErrado: c.isCertoErrado,
    disciplineId: c.disciplineId,
    disciplineName: c.disciplineName || "Sem disciplina",
    topicId: c.topicId,
    topicName: c.topicName,
    selectedAnswer: c.selectedAnswer,
    correctAnswer: c.correctAnswer,
    explanation: c.explanation,
    isCorrect: c.isCorrect,
    isMarked: c.isMarked,
    answered: c.answered,
    responseTimeSeconds: c.responseTimeSeconds,
    difficultyLabel: difficultyLabelOf(c.difficultyLevel),
  }
}