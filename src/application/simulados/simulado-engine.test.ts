/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  analyzeResult,
  buildComparison,
  buildDistribution,
  checkAnswer,
  computeByDiscipline,
  computeByTopic,
  computePersonalBests,
  computeResultTotals,
  correctAnswers,
  hasDifficultyData,
  isCertoErradoQuestion,
  matchesDifficultyFilter,
  pickNextAdaptive,
  pickQuestionPool,
  seededShuffle,
  type CorrectedQuestion,
  type PickPoolOptions,
  type QuestionPoolItem,
  type RawAnswer,
  type RawQuestion,
} from "./simulado-engine"

const QPOOL: QuestionPoolItem[] = [
  { id: "q1", disciplineId: "d1", topicId: "t1", difficultyLevel: 1 },
  { id: "q2", disciplineId: "d1", topicId: "t1", difficultyLevel: 2 },
  { id: "q3", disciplineId: "d1", topicId: "t2", difficultyLevel: 3 },
  { id: "q4", disciplineId: "d2", topicId: "t3", difficultyLevel: 5 },
  { id: "q5", disciplineId: "d2", topicId: "t3", difficultyLevel: null },
  { id: "q6", disciplineId: "d2", topicId: "t4", difficultyLevel: 3 },
  { id: "q7", disciplineId: "d3", topicId: null, difficultyLevel: 4 },
]

const RAW_QUESTIONS: RawQuestion[] = [
  { id: "q1", disciplineId: "d1", disciplineName: "Português", topicId: "t1", topicName: "Interpretação", correctAnswer: "A", statement: "S1", alternatives: null, isCertoErrado: false, explanation: "Expo", difficultyLevel: 1 },
  { id: "q2", disciplineId: "d1", disciplineName: "Português", topicId: "t2", topicName: "Crase", correctAnswer: "B", statement: "S2", alternatives: null, isCertoErrado: false, explanation: null, difficultyLevel: 2 },
  { id: "q3", disciplineId: "d2", disciplineName: "Constitucional", topicId: "t3", topicName: "Direitos", correctAnswer: "C", statement: "S3", alternatives: null, isCertoErrado: false, explanation: "Expo3", difficultyLevel: 3 },
  { id: "q4", disciplineId: "d2", disciplineName: "Constitucional", topicId: "t3", topicName: "Direitos", correctAnswer: "CERTO", statement: "S4", alternatives: null, isCertoErrado: true, explanation: null, difficultyLevel: null },
]

// ─── Distribuição ───────────────────────────────────────────────────────────

test("buildDistribution: distribuição personalizada com soma exata", () => {
  const r = buildDistribution(40, ["d1", "d2", "d3"], { d1: 10, d2: 20, d3: 10 })
  assert.equal(r.ok, true)
  assert.equal(r.counts["d1"], 10)
  assert.equal(r.counts["d2"], 20)
  assert.equal(r.counts["d3"], 10)
  assert.equal(r.error, null)
})

test("buildDistribution: rejeita soma diferente do total", () => {
  const r = buildDistribution(40, ["d1", "d2"], { d1: 10, d2: 20 })
  assert.equal(r.ok, false)
  assert.match(r.error ?? "", /soma 30.*total.*40|total.*40.*soma 30/)
})

test("buildDistribution: automática com arredondamento justo", () => {
  const r = buildDistribution(40, ["d1", "d2", "d3"], {})
  assert.equal(r.ok, true)
  const sum = Object.values(r.counts).reduce((a, b) => a + b, 0)
  assert.equal(sum, 40)
  const values = Object.values(r.counts)
  assert.ok(Math.max(...values) - Math.min(...values) <= 1)
})

test("buildDistribution: sem disciplinas é erro", () => {
  const r = buildDistribution(10, [], {})
  assert.equal(r.ok, false)
})

// ─── Seleção do pool ────────────────────────────────────────────────────────

test("pickQuestionPool: respeita quotas por disciplina", () => {
  const r = pickQuestionPool(QPOOL, {
    counts: { d1: 2, d2: 2, d3: 1 },
    topicIds: [],
    difficulty: "TODAS",
    wrongQuestionIds: new Set(),
    onlyWrong: false,
    prioritizeWrong: false,
    seed: 42,
  })
  assert.equal(r.error, null)
  assert.equal(r.picked.length, 5)
  const byDisc: Record<string, number> = {}
  r.picked.forEach((q) => {
    const k = q.disciplineId ?? "SEM"
    byDisc[k] = (byDisc[k] ?? 0) + 1
  })
  assert.equal(byDisc["d1"], 2)
  assert.equal(byDisc["d2"], 2)
  assert.equal(byDisc["d3"], 1)
})

test("pickQuestionPool: filtro de tópicos e dificuldade", () => {
  const r = pickQuestionPool(QPOOL, {
    counts: { d1: 1, d2: 1 },
    topicIds: ["t1", "t3"],
    difficulty: "FACIL",
    wrongQuestionIds: new Set(),
    onlyWrong: false,
    prioritizeWrong: false,
    seed: 7,
  })
  assert.equal(r.picked.length, 2)
  assert.ok(r.picked.every((q) => q.topicId === "t1"))
})

test("pickQuestionPool: somente erradas anteriormente", () => {
  const r = pickQuestionPool(QPOOL, {
    counts: { d1: 2, d2: 2, d3: 1 },
    topicIds: [],
    difficulty: "TODAS",
    wrongQuestionIds: new Set(["q2", "q5"]),
    onlyWrong: true,
    prioritizeWrong: false,
    seed: 3,
  })
  assert.equal(r.picked.length, 2)
  assert.ok(r.picked.every((q) => q.id === "q2" || q.id === "q5"))
})

test("pickQuestionPool: priorizar erradas mas completar com as outras", () => {
  const r = pickQuestionPool(QPOOL, {
    counts: { d1: 2, d2: 2, d3: 1 },
    topicIds: [],
    difficulty: "TODAS",
    wrongQuestionIds: new Set(["q2", "q5"]),
    onlyWrong: false,
    prioritizeWrong: true,
    seed: 11,
  })
  assert.equal(r.picked.length, 5)
  const order = r.picked.map((q) => q.id)
  assert.ok(order.indexOf("q2") < order.indexOf("q1"))
  assert.ok(order.indexOf("q5") < order.indexOf("q4"))
})

test("pickQuestionPool: erro honesto quando faltam questões", () => {
  const r = pickQuestionPool(QPOOL, {
    counts: { d1: 10 },
    topicIds: [],
    difficulty: "TODAS",
    wrongQuestionIds: new Set(),
    onlyWrong: false,
    prioritizeWrong: false,
    seed: 1,
  })
  assert.equal(r.picked.length, 3)
  assert.match(r.error ?? "", /Apenas 7 questão/)
})

test("pickQuestionPool: determinístico com mesmo seed", () => {
  const opts: PickPoolOptions = {
    counts: { d1: 3, d2: 3, d3: 1 },
    topicIds: [],
    difficulty: "TODAS",
    wrongQuestionIds: new Set(),
    onlyWrong: false,
    prioritizeWrong: false,
    seed: 99,
  }
  const a = pickQuestionPool(QPOOL, opts)
  const b = pickQuestionPool(QPOOL, opts)
  assert.deepEqual(a.picked.map((q) => q.id), b.picked.map((q) => q.id))
})

test("seededShuffle: ordem diferente por seed", () => {
  const a = seededShuffle([1, 2, 3, 4, 5], 1)
  const b = seededShuffle([1, 2, 3, 4, 5], 2)
  assert.notDeepEqual(a, b)
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5])
})

// ─── Respostas e correção ───────────────────────────────────────────────────

test("checkAnswer: múltipla escolha normaliza maiúsculas/espacos", () => {
  assert.equal(checkAnswer("A", "a"), true)
  assert.equal(checkAnswer("A", " B "), false)
  assert.equal(checkAnswer("B", "A"), false)
  assert.equal(checkAnswer("A", null), false)
})

test("checkAnswer: certo/errado aceita variações", () => {
  assert.equal(checkAnswer("CERTO", "C"), true)
  assert.equal(checkAnswer("C", "CERTO"), true)
  assert.equal(checkAnswer("V", "VERDADEIRA"), true)
  assert.equal(checkAnswer("ERRADO", "E"), true)
  assert.equal(checkAnswer("C", "E"), false)
})

test("isCertoErradoQuestion: detecta estilo", () => {
  assert.equal(isCertoErradoQuestion("CERTO"), true)
  assert.equal(isCertoErradoQuestion("falsa"), true)
  assert.equal(isCertoErradoQuestion("A"), false)
})

test("correctAnswers + computeResultTotals: acertos, erros, brancos e acurácia", () => {
  const answers: RawAnswer[] = [
    { questionId: "q1", orderIndex: 0, selectedAnswer: "A", isMarked: false, responseTimeSeconds: 60 },
    { questionId: "q2", orderIndex: 1, selectedAnswer: "A", isMarked: true, responseTimeSeconds: 120 },
    { questionId: "q3", orderIndex: 2, selectedAnswer: null, isMarked: false, responseTimeSeconds: null },
    { questionId: "q4", orderIndex: 3, selectedAnswer: "CERTO", isMarked: false, responseTimeSeconds: 90 },
  ]
  const corrected = correctAnswers(RAW_QUESTIONS, answers) as CorrectedQuestion[]
  assert.equal(corrected.length, 4)
  assert.equal(corrected[0]!.isCorrect, true)
  assert.equal(corrected[1]!.isCorrect, false)
  assert.equal(corrected[2]!.isCorrect, null)
  assert.equal(corrected[3]!.isCorrect, true)

  const totals = computeResultTotals(corrected, 300)
  assert.equal(totals.total, 4)
  assert.equal(totals.answered, 3)
  assert.equal(totals.correct, 2)
  assert.equal(totals.wrong, 1)
  assert.equal(totals.blank, 1)
  assert.equal(Math.round(totals.accuracy ?? 0), 67)
  assert.equal(totals.score, "REGULAR")
  assert.equal(totals.timeStats.totalSeconds, 300)
  assert.equal(totals.timeStats.avgPerQuestionSeconds, 90)
})

test("computeResultTotals: blank total = BAIXO e acurácia null", () => {
  const answers: RawAnswer[] = [
    { questionId: "q1", orderIndex: 0, selectedAnswer: null, isMarked: false, responseTimeSeconds: null },
  ]
  const corrected = correctAnswers(RAW_QUESTIONS, answers) as CorrectedQuestion[]
  const totals = computeResultTotals(corrected, 0)
  assert.equal(totals.accuracy, null)
  assert.equal(totals.score, "BAIXO")
  assert.equal(totals.wrong, 0)
})

test("computeByDiscipline/computeByTopic: agregação", () => {
  const answers: RawAnswer[] = [
    { questionId: "q1", orderIndex: 0, selectedAnswer: "A", isMarked: false, responseTimeSeconds: 10 },
    { questionId: "q3", orderIndex: 1, selectedAnswer: "C", isMarked: false, responseTimeSeconds: 10 },
  ]
  const corrected = correctAnswers(RAW_QUESTIONS, answers) as CorrectedQuestion[]
  const byDisc = computeByDiscipline(corrected)
  const port = byDisc.find((d) => d.disciplineName === "Português")
  assert.equal(port?.correct, 1)
  assert.equal(port?.questions, 1)
  const byTopic = computeByTopic(corrected)
  assert.equal(byTopic.find((t) => t.topicName === "Direitos")?.accuracy, 100)
})

// ─── Análise honesta ────────────────────────────────────────────────────────

test("analyzeResult: não gera conclusões sem dados suficientes", () => {
  const totals = computeResultTotals(
    correctAnswers(RAW_QUESTIONS, [
      { questionId: "q1", orderIndex: 0, selectedAnswer: "A", isMarked: false, responseTimeSeconds: 90 },
    ]) as CorrectedQuestion[],
    90
  )
  const insights = analyzeResult(totals, [], null)
  assert.equal(insights.length, 0)
})

test("analyzeResult: destaca melhor/pior disciplina com ≥5 questões", () => {
  const big: RawQuestion[] = []
  const answers: RawAnswer[] = []
  for (let i = 0; i < 10; i++) {
    const id = `g${i}`
    big.push({ id, disciplineId: "d1", disciplineName: "Português", topicId: null, topicName: null, correctAnswer: "A", statement: "S", alternatives: null, isCertoErrado: false, explanation: null, difficultyLevel: 1 })
    answers.push({ questionId: id, orderIndex: i, selectedAnswer: i < 9 ? "A" : "B", isMarked: false, responseTimeSeconds: 60 })
  }
  for (let i = 0; i < 5; i++) {
    const id = `h${i}`
    big.push({ id, disciplineId: "d2", disciplineName: "Contabilidade", topicId: null, topicName: null, correctAnswer: "A", statement: "S", alternatives: null, isCertoErrado: false, explanation: null, difficultyLevel: 3 })
    answers.push({ questionId: id, orderIndex: 100 + i, selectedAnswer: "B", isMarked: false, responseTimeSeconds: 60 })
  }
  const corrected = correctAnswers(big, answers) as CorrectedQuestion[]
  const totals = computeResultTotals(corrected, 900)
  const byDisc = computeByDiscipline(corrected)
  const insights = analyzeResult(totals, byDisc, null)
  assert.ok(insights.some((i) => i.message.includes("Português")))
  assert.ok(insights.some((i) => i.message.includes("Contabilidade")))
})

test("analyzeResult: compara com média histórica apenas com dado real", () => {
  const answers: RawAnswer[] = [
    { questionId: "q1", orderIndex: 0, selectedAnswer: "A", isMarked: false, responseTimeSeconds: 60 },
    { questionId: "q2", orderIndex: 1, selectedAnswer: "C", isMarked: false, responseTimeSeconds: 60 },
  ]
  const corrected = correctAnswers(RAW_QUESTIONS, answers) as CorrectedQuestion[]
  const totals = computeResultTotals(corrected, 120)
  const insights = analyzeResult(totals, [], 80)
  assert.ok(insights.some((i) => i.message.includes("abaixo")))
})

// ─── Comparação e tendência ─────────────────────────────────────────────────

test("buildComparison: compara série com tendência", () => {
  const prev = [
    { id: "s1", name: "Simulado 1", accuracy: 50, totalCorrect: 5, totalWrong: 5, totalQuestions: 10, timeSpentSeconds: 1000, status: "FINISHED", simuladoDate: "2026-07-01" },
    { id: "s2", name: "Simulado 2", accuracy: 60, totalCorrect: 6, totalWrong: 4, totalQuestions: 10, timeSpentSeconds: 900, status: "FINISHED", simuladoDate: "2026-07-15" },
  ]
  const res = buildComparison(
    { accuracy: 70, correct: 7, wrong: 3, total: 10, timeSpentSeconds: 800 },
    prev as never[]
  )
  assert.equal(res.comparison.length, 3)
  assert.equal(res.trend.accuracy, "UP")
  assert.equal(res.trend.time, "FASTER")
})

test("computePersonalBests: sem simulados é null-safe", () => {
  const bests = computePersonalBests([])
  assert.equal(bests.bestAccuracy, null)
  assert.equal(bests.bestCorrect, null)
  assert.equal(bests.fastestTime, null)
})

// ─── Adaptativo honesto ─────────────────────────────────────────────────────

test("hasDifficultyData: precisa de volume e variedade", () => {
  assert.equal(hasDifficultyData([]), false)
  assert.equal(hasDifficultyData([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), false)
  assert.equal(hasDifficultyData([1, 2, 1, 2, 1, 2, 1, 2, 1, 2]), true)
})

test("pickNextAdaptive: sem dados suficientes avisa honestamente", () => {
  const remaining: QuestionPoolItem[] = [{ id: "q1", disciplineId: "d1", topicId: null, difficultyLevel: null }]
  const r = pickNextAdaptive(remaining, [true, true], [null, null])
  assert.equal(r.next, null)
  assert.match(r.message ?? "", /Não há dados suficientes para adaptação/)
})

test("pickNextAdaptive: mudança de dificuldade conforme desempenho", () => {
  const remaining: QuestionPoolItem[] = [
    { id: "f", disciplineId: "d1", topicId: null, difficultyLevel: 1 },
    { id: "m", disciplineId: "d1", topicId: null, difficultyLevel: 3 },
    { id: "h", disciplineId: "d1", topicId: null, difficultyLevel: 5 },
  ]
  const levels = [1, 2, 1, 3, 2, 4, 1, 2, 3, 1, 5, 2] // >= 10 e variadas
  const boosted = pickNextAdaptive(remaining, [true, true, true], levels)
  assert.equal(boosted.next?.id, "h")
  assert.equal(boosted.state.boosted, true)
  const reduced = pickNextAdaptive(remaining, [false, false], levels)
  assert.equal(reduced.next?.id, "f")
  assert.equal(reduced.state.reduced, true)
})

test("matchesDifficultyFilter: respeita dificuldade cadastrada", () => {
  assert.equal(matchesDifficultyFilter(1, "FACIL"), true)
  assert.equal(matchesDifficultyFilter(4, "FACIL"), false)
  assert.equal(matchesDifficultyFilter(null, "MEDIA"), false)
  assert.equal(matchesDifficultyFilter(null, "TODAS"), true)
})