// ============================================================================
// Engine de estatísticas de simulados registrados (cálculo puro, sem I/O)
// ============================================================================

import type {
  PERFORMANCE_BANDS,
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
    const blank = s.blankCount ?? 0
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

/** Estatísticas agregadas do painel a partir dos registros (já ordenados por data asc). */
export function computePanelStats(records: SimuladoRecord[]): SimuladoPanelStats {
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

  const lastRecord = records[totalSimulados - 1]!
  const lastAccuracy = lastRecord.accuracy ?? null

  const last5 = records.slice(-5)
  const last5SumQ = last5.reduce((acc, r) => acc + r.totalQuestions, 0)
  const last5SumC = last5.reduce((acc, r) => acc + r.totalCorrect, 0)
  const last5AverageAccuracy = accuracyOf(last5SumC, last5SumQ)

  // Evolução: média dos últimos 5 vs média dos anteriores (ou primeiro vs último)
  let evolutionPp: number | null = null
  let trend: SimuladoPanelStats["trend"] = null
  let trendMessage: string | null = null

  if (accuracies.length >= 2) {
    if (last5AverageAccuracy !== null && averageAccuracy !== null) {
      evolutionPp = Math.round((last5AverageAccuracy - averageAccuracy) * 10) / 10
    }
    const recent = accuracies.slice(-3)
    const earlier = accuracies.slice(0, -3)
    if (recent.length >= 2) {
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
      if (earlier.length > 0) {
        const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length
        const delta = recentAvg - earlierAvg
        trend = delta > 2 ? "UP" : delta < -2 ? "DOWN" : "STABLE"
      } else {
        trend = recent[recent.length - 1]! > recent[0]! ? "UP" : recent[recent.length - 1]! < recent[0]! ? "DOWN" : "STABLE"
      }
    }
    trendMessage =
      trend === "UP"
        ? "Seu desempenho está evoluindo"
        : trend === "DOWN"
          ? "Seu desempenho caiu nos últimos simulados"
          : trend === "STABLE"
            ? "Seu desempenho está estável"
            : null
  }

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
    trend,
    trendMessage,
  }
}

/** Pontos do gráfico de evolução (ordenados por data asc). */
export function buildEvolutionPoints(records: SimuladoRecord[]): SimuladoEvolutionPoint[] {
  return records
    .filter((r) => r.accuracy !== null)
    .map((r) => ({
      simuladoId: r.id,
      name: r.name,
      date: r.simuladoDate,
      accuracy: r.accuracy,
    }))
}

/** Análise agregada por matéria com evolução e faixa. */
export function buildSubjectAnalysis(records: SimuladoRecord[]): SimuladoSubjectAnalysis[] {
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
      const key = (subject.disciplineId ?? subject.disciplineName).toLowerCase()
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
    .map((entry) => {
      const accuracy = accuracyOf(entry.totalCorrect, entry.totalQuestions)
      const withAcc = entry.history.filter((h): h is SimuladoEvolutionPoint => h.accuracy !== null)
      let evolutionPp: number | null = null
      if (withAcc.length >= 2) {
        evolutionPp =
          Math.round(((withAcc[withAcc.length - 1]!.accuracy ?? 0) - (withAcc[0]!.accuracy ?? 0)) * 10) / 10
      }
      return {
        disciplineId: entry.disciplineId,
        disciplineName: entry.disciplineName,
        totalQuestions: entry.totalQuestions,
        totalCorrect: entry.totalCorrect,
        accuracy,
        band: performanceBandOf(accuracy),
        evolutionPp,
        history: entry.history,
      }
    })
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
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

/** Percentual líquido de aproveitamento. */
export function netAccuracyOf(netScore: number, totalQuestions: number): number | null {
  if (totalQuestions <= 0) return null
  return Math.round((netScore / totalQuestions) * 1000) / 10
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
