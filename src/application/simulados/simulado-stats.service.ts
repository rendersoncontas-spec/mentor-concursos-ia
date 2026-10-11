// ============================================================================
// Engine de estatísticas de simulados registrados (cálculo puro, sem I/O)
// ============================================================================

import { subjectIdentityKey } from "@/domain/disciplines/discipline-identity"
import type {
  PERFORMANCE_BANDS,
  SimuladoBottleneck,
  SimuladoBottleneckReason,
  SimuladoBottleneckReport,
  SimuladoEvolutionPoint,
  SimuladoPanelStats,
  SimuladoRecord,
  SimuladoRecordInput,
  SimuladoRecordSubject,
  SimuladoScoringRule,
  SimuladoSubjectAnalysis,
  SimuladoComparisonResult,
} from "@/domain/simulados/types"
import { CEBRASPE_DEFAULT_PENALTY } from "@/domain/simulados/types"

type Band = keyof typeof PERFORMANCE_BANDS

/** Faixas centralizadas (>=85 Excelente, 75–84 Bom, 60–74 Atenção, <60 Fraco). */
export function performanceBandOf(accuracy: number | null): Band {
  if (accuracy === null) return "FRACO"
  if (accuracy >= 85) return "EXCELENTE"
  if (accuracy >= 75) return "BOM"
  if (accuracy >= 60) return "ATENCAO"
  return "FRACO"
}

/** Percentual de acertos: correct / questions * 100 (null quando inválido). */
export function accuracyOf(correct: number, questions: number): number | null {
  if (!Number.isFinite(correct) || !Number.isFinite(questions) || questions <= 0) return null
  return Math.round((correct / questions) * 1000) / 10
}

/** Calcula totais agregados de uma lista de matérias. */
export function aggregateSubjects(
  subjects: { questionsCount: number; correctCount: number; wrongCount: number; blankCount: number }[]
) {
  const totalQuestions = subjects.reduce((acc, s) => acc + s.questionsCount, 0)
  const totalCorrect = subjects.reduce((acc, s) => acc + s.correctCount, 0)
  const totalWrong = subjects.reduce((acc, s) => acc + s.wrongCount, 0)
  const totalBlank = subjects.reduce((acc, s) => acc + s.blankCount, 0)
  return {
    totalQuestions,
    totalCorrect,
    totalWrong,
    totalBlank,
    accuracy: accuracyOf(totalCorrect, totalQuestions),
  }
}

/** Erros derivados: questions - correct - blank. */
export function wrongsOf(questions: number, correct: number, blank: number): number {
  return Math.max(0, questions - correct - blank)
}

/**
 * Valida a consistência de um registro:
 * - acertos + erros + brancos deve ser <= questões;
 * - acertos <= questões;
 * - soma das questões por matéria comparada ao total.
 */
export function validateRecord(input: {
  totalQuestions: number
  totalCorrect: number
  totalWrong: number
  totalBlank: number
  subjects: { questionsCount: number }[]
}): { ok: boolean; errors: string[]; subjectsSum: number | null } {
  const errors: string[] = []
  const { totalQuestions, totalCorrect, totalWrong, totalBlank } = input

  if (totalQuestions <= 0) errors.push("O simulado precisa ter pelo menos 1 questão.")
  if (totalCorrect < 0) errors.push("Acertos não podem ser negativos.")
  if (totalWrong < 0) errors.push("Erros não podem ser negativos.")
  if (totalBlank < 0) errors.push("Questões em branco não podem ser negativas.")
  if (totalCorrect + totalWrong + totalBlank !== totalQuestions) {
    errors.push("Acertos + erros + brancos deve ser igual ao total de questões.")
  }
  if (totalCorrect > totalQuestions) {
    errors.push("Acertos não podem ser maiores que o total de questões.")
  }

  let subjectsSum: number | null = null
  if (input.subjects.length > 0) {
    subjectsSum = input.subjects.reduce((acc, s) => acc + s.questionsCount, 0)
  }

  return { ok: errors.length === 0, errors, subjectsSum }
}

/** Converte input em subjects computados (percentual e líquido por matéria). */
export function computeSubjects(
  subjects: SimuladoRecordInput["subjects"],
  opts?: { scoringRule?: SimuladoScoringRule | undefined; penaltyPerWrong?: number | null | undefined }
): SimuladoRecordSubject[] {
  const rule = opts?.scoringRule ?? "PERCENTUAL"
  return subjects.map((s) => {
    // G1.2 (G-10): blank nunca negativo (compatível com o CHECK do banco).
    const blank = Math.max(0, s.blankCount ?? 0)
    const wrong = s.wrongCount >= 0 ? s.wrongCount : wrongsOf(s.questionsCount, s.correctCount, blank)
    const questionsCount = Math.max(0, s.questionsCount)
    const correctCount = Math.max(0, s.correctCount)
    const wrongCount = Math.max(0, wrong)
    const netScore =
      rule === "CEBRASPE"
        ? computeNetScore({
            totalCorrect: correctCount,
            totalWrong: wrongCount,
            scoringRule: rule,
            penaltyPerWrong: opts?.penaltyPerWrong,
          })
        : null
    return {
      disciplineId: s.disciplineId ?? null,
      disciplineName: s.disciplineName.trim(),
      questionsCount,
      correctCount,
      wrongCount,
      blankCount: blank,
      accuracy: accuracyOf(s.correctCount, s.questionsCount),
      netScore,
    }
  })
}

type PanelTrend = NonNullable<SimuladoPanelStats["trend"]>

const TREND_MESSAGES: Record<PanelTrend, string> = {
  UP: "Seu desempenho está evoluindo",
  DOWN: "Seu desempenho caiu nos últimos simulados",
  STABLE: "Seu desempenho está estável",
}

/** Acima de +threshold sobe, abaixo de -threshold cai; no meio, estável. */
function trendFromDelta(delta: number, threshold: number): PanelTrend {
  if (delta > threshold) return "UP"
  if (delta < -threshold) return "DOWN"
  return "STABLE"
}

/**
 * G2.10 — mínimo de pontos para falar em "tendência". Com 2 simulados existe
 * uma variação (primeiro → último), não uma tendência: 60% → 61% não é
 * "evolução". Abaixo disso a tendência é null e a tela não a desenha.
 */
export const MIN_TREND_POINTS = 3
/** Variação mínima (p.p.) para deixar de ser "estável". */
export const TREND_THRESHOLD_PP = 2

const round1 = (n: number) => Math.round(n * 10) / 10
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

/**
 * Tendência de uma série em ordem cronológica (determinística):
 *   - menos de MIN_TREND_POINTS valores → null;
 *   - exatamente 3 → último vs primeiro;
 *   - 4 ou mais → média dos 3 mais recentes vs média dos anteriores.
 * Em todos os casos, |Δ| ≤ TREND_THRESHOLD_PP é "estável".
 */
export function trendOfSeries(values: number[]): PanelTrend | null {
  if (values.length < MIN_TREND_POINTS) return null
  const recent = values.slice(-3)
  const earlier = values.slice(0, -3)
  const delta =
    earlier.length > 0
      ? mean(recent) - mean(earlier)
      : (recent[recent.length - 1] as number) - (recent[0] as number)
  return trendFromDelta(delta, TREND_THRESHOLD_PP)
}

/**
 * Ordem cronológica estável: data do simulado, depois momento do registro,
 * depois id. Sem o desempate, dois simulados no mesmo dia trocavam de lugar
 * conforme a ordem em que o banco os devolvia, e o "último resultado" e a
 * tendência mudavam sem nenhum dado novo.
 */
export function compareRecordsChronologically(
  a: Pick<SimuladoRecord, "simuladoDate" | "createdAt" | "id">,
  b: Pick<SimuladoRecord, "simuladoDate" | "createdAt" | "id">,
): number {
  return (
    (a.simuladoDate ?? "").localeCompare(b.simuladoDate ?? "") ||
    (a.createdAt ?? "").localeCompare(b.createdAt ?? "") ||
    a.id.localeCompare(b.id)
  )
}

export function sortRecordsChronologically<T extends Pick<SimuladoRecord, "simuladoDate" | "createdAt" | "id">>(records: T[]): T[] {
  return [...records].sort(compareRecordsChronologically)
}

/** Mais recente primeiro (lista/histórico), com o mesmo desempate. */
export function sortRecordsRecentFirst<T extends Pick<SimuladoRecord, "simuladoDate" | "createdAt" | "id">>(records: T[]): T[] {
  return [...records].sort((a, b) => compareRecordsChronologically(b, a))
}

/**
 * Estatísticas agregadas do painel. Ordena internamente (cronológico estável),
 * então não depende da ordem em que o chamador entrega os registros.
 *
 * Média geral = acertos totais ÷ questões totais (ponderada pelo tamanho do
 * simulado): um simulado de 120 questões pesa mais que um de 10.
 */
export function computePanelStats(input: SimuladoRecord[]): SimuladoPanelStats {
  const records = sortRecordsChronologically(input)
  const totalSimulados = records.length
  if (totalSimulados === 0) {
    return {
      totalSimulados: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      totalWrong: 0,
      averageAccuracy: null,
      bestAccuracy: null,
      lastAccuracy: null,
      last5AverageAccuracy: null,
      worstAccuracy: null,
      evolutionPp: null,
      firstAccuracy: null,
      firstToLastPp: null,
      trend: null,
      trendMessage: null,
    }
  }

  const totalQuestions = records.reduce((acc, r) => acc + r.totalQuestions, 0)
  const totalCorrect = records.reduce((acc, r) => acc + r.totalCorrect, 0)
  const totalWrong = records.reduce((acc, r) => acc + r.totalWrong, 0)
  const averageAccuracy = accuracyOf(totalCorrect, totalQuestions)

  const accuracies = records
    .map((r) => r.accuracy)
    .filter((a): a is number => a !== null)

  const bestAccuracy = accuracies.length > 0 ? Math.max(...accuracies) : null
  const worstAccuracy = accuracies.length > 0 ? Math.min(...accuracies) : null
  const firstAccuracy = accuracies.length > 0 ? (accuracies[0] as number) : null

  const lastRecord = records[totalSimulados - 1]!
  const lastAccuracy = lastRecord.accuracy ?? null

  const last5 = records.slice(-5)
  const last5SumQ = last5.reduce((acc, r) => acc + r.totalQuestions, 0)
  const last5SumC = last5.reduce((acc, r) => acc + r.totalCorrect, 0)
  const last5AverageAccuracy = accuracyOf(last5SumC, last5SumQ)

  // Últimos 5 vs média geral (mantido) e primeiro → último (G2.10). Com um
  // único simulado não há variação: ambos ficam null, não 0.
  let evolutionPp: number | null = null
  let firstToLastPp: number | null = null
  if (accuracies.length >= 2) {
    if (last5AverageAccuracy !== null && averageAccuracy !== null) {
      evolutionPp = round1(last5AverageAccuracy - averageAccuracy)
    }
    firstToLastPp = round1((accuracies[accuracies.length - 1] as number) - (accuracies[0] as number))
  }

  const trend = trendOfSeries(accuracies)
  const trendMessage = trend === null ? null : TREND_MESSAGES[trend]

  return {
    totalSimulados,
    totalQuestions,
    totalCorrect,
    totalWrong,
    averageAccuracy,
    bestAccuracy,
    lastAccuracy,
    last5AverageAccuracy,
    worstAccuracy,
    evolutionPp,
    firstAccuracy,
    firstToLastPp,
    trend,
    trendMessage,
  }
}

/** Pontos do gráfico de evolução (ordenados por data asc). */
export function buildEvolutionPoints(records: SimuladoRecord[]): SimuladoEvolutionPoint[] {
  return sortRecordsChronologically(records)
    .filter((r) => r.accuracy !== null)
    .map((r) => ({
      simuladoId: r.id,
      name: r.name,
      date: r.simuladoDate,
      accuracy: r.accuracy,
    }))
}

/**
 * Análise agregada por matéria com evolução e faixa. Uma matéria só entra no
 * histórico dos simulados em que aparece — simulados sem ela não viram 0%.
 * Média da matéria = acertos ÷ questões somados (ponderada).
 */
export function buildSubjectAnalysis(input: SimuladoRecord[]): SimuladoSubjectAnalysis[] {
  const records = sortRecordsChronologically(input)
  const map = new Map<
    string,
    {
      disciplineId: string | null
      disciplineName: string
      totalQuestions: number
      totalCorrect: number
      history: SimuladoSubjectAnalysis["history"]
    }
  >()

  for (const record of records) {
    for (const subject of record.subjects) {
      // G2.12: mesma chave de identidade de todas as análises (id, ou nome
      // canônico quando a matéria não tem id).
      const key = subjectIdentityKey(subject)
      const entry =
        map.get(key) ??
        {
          disciplineId: subject.disciplineId,
          disciplineName: subject.disciplineName,
          totalQuestions: 0,
          totalCorrect: 0,
          history: [],
        }
      entry.totalQuestions += subject.questionsCount
      entry.totalCorrect += subject.correctCount
      entry.history.push({
        simuladoId: record.id,
        name: record.name,
        date: record.simuladoDate,
        accuracy: subject.accuracy,
      })
      map.set(key, entry)
    }
  }

  return Array.from(map.values())
    .map((entry): SimuladoSubjectAnalysis => {
      const accuracy = accuracyOf(entry.totalCorrect, entry.totalQuestions)
      const values = entry.history.map((h) => h.accuracy).filter((a): a is number => a !== null)
      const first = values.length > 0 ? (values[0] as number) : null
      const last = values.length > 0 ? (values[values.length - 1] as number) : null
      return {
        disciplineId: entry.disciplineId,
        disciplineName: entry.disciplineName,
        totalQuestions: entry.totalQuestions,
        totalCorrect: entry.totalCorrect,
        accuracy,
        band: performanceBandOf(accuracy),
        evolutionPp: values.length >= 2 && first !== null && last !== null ? round1(last - first) : null,
        history: entry.history,
        simuladosCount: entry.history.length,
        firstAccuracy: first,
        lastAccuracy: last,
        bestAccuracy: values.length > 0 ? Math.max(...values) : null,
        worstAccuracy: values.length > 0 ? Math.min(...values) : null,
        trend: trendOfSeries(values),
      }
    })
    .sort(
      (a, b) =>
        (a.accuracy ?? 0) - (b.accuracy ?? 0) ||
        a.disciplineName.localeCompare(b.disciplineName, "pt-BR"),
    )
}

/** Matérias fracas (band FRACO ou ATENCAO), ordenadas da pior para a melhor. */
export function findWeakSubjects(
  analysis: SimuladoSubjectAnalysis[],
  opts?: { includeAtencao?: boolean }
): SimuladoSubjectAnalysis[] {
  const includeAtencao = opts?.includeAtencao ?? true
  return analysis
    .filter((a) => a.band === "FRACO" || (includeAtencao && a.band === "ATENCAO"))
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
}

/** Detecta matérias com queda de desempenho nos últimos N registros. */
export function findDecliningSubjects(
  analysis: SimuladoSubjectAnalysis[],
  window = 3
): SimuladoSubjectAnalysis[] {
  return analysis.filter((a) => {
    const history = a.history.filter((h) => h.accuracy !== null)
    if (history.length < window) return false
    const recent = history.slice(-window).map((h) => h.accuracy as number)
    // Queda consistente: cada registro mais recente pior que o anterior
    let declining = true
    for (let i = 1; i < recent.length; i++) {
      if (recent[i]! >= recent[i - 1]!) {
        declining = false
        break
      }
    }
    return declining
  })
}

/** G2.10 — limiares dos gargalos (p.p. e mínimos), exportados para teste e documentação. */
export const BOTTLENECK_BELOW_AVERAGE_PP = 5
export const BOTTLENECK_RECENT_DROP_PP = 5
export const BOTTLENECK_LOW_PERFORMANCE = 60
export const BOTTLENECK_MIN_QUESTIONS = 5

/**
 * G2.10 — gargalos determinísticos (sem IA). Uma matéria é apontada quando:
 *   - BELOW_AVERAGE: média da matéria ≥ 5 p.p. abaixo da média geral;
 *   - LOW_PERFORMANCE: média abaixo de 60% (faixa "Fraco");
 *   - RECENT_DROP: o último registro caiu ≥ 5 p.p. em relação ao penúltimo.
 * Matérias com menos de 5 questões somadas não são avaliadas (amostra pequena
 * demais para dizer qualquer coisa). Com menos de 2 simulados da matéria, o
 * apontamento vem marcado como preliminar (`lowData`).
 * O gargalo principal é o de menor média entre os apontados; empate → nome.
 */
export function findBottlenecks(
  analysis: SimuladoSubjectAnalysis[],
  overallAccuracy: number | null,
): SimuladoBottleneckReport {
  const items: SimuladoBottleneck[] = []
  for (const s of analysis) {
    if (s.accuracy === null || s.totalQuestions < BOTTLENECK_MIN_QUESTIONS) continue
    const reasons: SimuladoBottleneckReason[] = []
    const gap = overallAccuracy === null ? null : round1(s.accuracy - overallAccuracy)
    if (gap !== null && gap <= -BOTTLENECK_BELOW_AVERAGE_PP) reasons.push("BELOW_AVERAGE")
    if (s.accuracy < BOTTLENECK_LOW_PERFORMANCE) reasons.push("LOW_PERFORMANCE")
    const values = s.history.map((h) => h.accuracy).filter((a): a is number => a !== null)
    let recentDropPp: number | null = null
    if (values.length >= 2) {
      const diff = round1((values[values.length - 2] as number) - (values[values.length - 1] as number))
      if (diff >= BOTTLENECK_RECENT_DROP_PP) {
        recentDropPp = diff
        reasons.push("RECENT_DROP")
      }
    }
    if (reasons.length === 0) continue
    items.push({
      disciplineId: s.disciplineId,
      disciplineName: s.disciplineName,
      accuracy: s.accuracy,
      reasons,
      gapToOverallPp: gap,
      recentDropPp,
      simuladosCount: s.simuladosCount,
      lowData: s.simuladosCount < 2,
    })
  }
  items.sort(
    (a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || a.disciplineName.localeCompare(b.disciplineName, "pt-BR"),
  )
  return { overallAccuracy, primary: items[0] ?? null, items }
}

/** Frase do gargalo principal, só com números calculados. */
export function describeBottleneck(b: SimuladoBottleneck, overallAccuracy: number | null): string {
  const acc = b.accuracy === null ? "—" : `${Math.round(b.accuracy)}%`
  const parts: string[] = []
  if (b.reasons.includes("BELOW_AVERAGE") && overallAccuracy !== null) {
    parts.push(`média ${acc}, abaixo da sua média geral de ${Math.round(overallAccuracy)}%`)
  } else {
    parts.push(`média ${acc}`)
  }
  if (b.reasons.includes("RECENT_DROP") && b.recentDropPp !== null) {
    parts.push(`caiu ${String(b.recentDropPp).replace(".", ",")} p.p. no último simulado`)
  }
  const base = `${b.disciplineName} — ${parts.join("; ")}`
  return b.lowData ? `${base} (baseado em 1 simulado)` : base
}

/** Compara dois simulados (geral e por matéria). */
export function compareSimulados(
  first: SimuladoRecord,
  second: SimuladoRecord
): SimuladoComparisonResult {
  const firstByName = new Map(first.subjects.map((s) => [s.disciplineName.toLowerCase(), s]))
  const secondByName = new Map(second.subjects.map((s) => [s.disciplineName.toLowerCase(), s]))
  const names = new Set([...firstByName.keys(), ...secondByName.keys()])

  const subjects: SimuladoComparisonResult["subjects"] = []
  for (const name of names) {
    const f = firstByName.get(name) ?? null
    const s = secondByName.get(name) ?? null
    const fAcc = f ? f.accuracy : null
    const sAcc = s ? s.accuracy : null
    subjects.push({
      disciplineName: (f ?? s)!.disciplineName,
      firstAccuracy: fAcc,
      secondAccuracy: sAcc,
      deltaPp:
        fAcc !== null && sAcc !== null ? Math.round((sAcc - fAcc) * 10) / 10 : null,
    })
  }
  subjects.sort((a, b) => (a.deltaPp ?? 999) - (b.deltaPp ?? 999))

  const accuracyDeltaPp =
    first.accuracy !== null && second.accuracy !== null
      ? Math.round((second.accuracy - first.accuracy) * 10) / 10
      : null

  return { firstId: first.id, secondId: second.id, accuracyDeltaPp, subjects }
}

/** Formata segundos como HH:MM:SS. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

/** Fontes disponíveis para registro. */
export const SIMULADO_SOURCES: { value: SimuladoRecordInput["source"]; label: string }[] = [
  { value: "TEC", label: "TEC Concursos" },
  { value: "GRAN", label: "Gran" },
  { value: "ESTRATEGIA", label: "Estratégia" },
  { value: "QCONCURSOS", label: "QConcursos" },
  { value: "PDF", label: "PDF" },
  { value: "PROVA_ANTERIOR", label: "Prova anterior" },
  { value: "OUTRO", label: "Outro" },
]

/** Rótulo da fonte (considera customização). */
export function sourceLabel(source: SimuladoRecordInput["source"], custom?: string | null): string {
  if (source === "OUTRO") return custom?.trim() || "Outro"
  const found = SIMULADO_SOURCES.find((s) => s.value === source)
  return found?.label ?? String(source)
}

/** Rótulo da regra de pontuação. */
export function scoringRuleLabel(rule: SimuladoScoringRule): string {
  if (rule === "CEBRASPE") return "CEBRASPE / CESPE"
  if (rule === "PENALIZACAO") return "Com penalização"
  if (rule === "PERSONALIZADO") return "Personalizada"
  return "Apenas percentual de acertos"
}

/** Entrada para cálculo de pontuação líquida. */
export interface NetScoreInput {
  totalCorrect: number
  totalWrong: number
  scoringRule: SimuladoScoringRule
  penaltyScore?: number | null | undefined
  penaltyPerWrong?: number | null | undefined
}

/** Calcula a pontuação líquida de acordo com a regra escolhida. */
export function computeNetScore(input: NetScoreInput): number {
  if (input.scoringRule === "PERCENTUAL") return input.totalCorrect
  if (input.scoringRule === "CEBRASPE") {
    const penalty = input.penaltyPerWrong ?? CEBRASPE_DEFAULT_PENALTY
    return input.totalCorrect - input.totalWrong * penalty
  }
  if (input.scoringRule === "PENALIZACAO" && input.penaltyScore !== null && input.penaltyScore !== undefined) {
    return input.penaltyScore
  }
  return input.totalCorrect
}

/** Percentual líquido de aproveitamento (piso 0 na apresentação; fórmula bruta preservada). */
export function netAccuracyOf(netScore: number, totalQuestions: number): number | null {
  if (totalQuestions <= 0) return null
  const raw = Math.round((netScore / totalQuestions) * 1000) / 10
  return Math.max(0, raw)
}

/** Percentual efetivo considerando regra de pontuação. */
export function effectiveAccuracy(
  input: NetScoreInput & { totalQuestions: number }
): number | null {
  if (input.scoringRule === "PENALIZACAO" && input.penaltyScore !== null && input.penaltyScore !== undefined) {
    return Math.max(0, Math.min(100, input.penaltyScore))
  }
  if (input.scoringRule === "CEBRASPE") {
    return netAccuracyOf(computeNetScore(input), input.totalQuestions)
  }
  return accuracyOf(input.totalCorrect, input.totalQuestions)
}
