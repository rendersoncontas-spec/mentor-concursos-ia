import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { resolveTargetFields } from "@/application/dashboard/active-target"
import type { SessionRecord } from "@/application/study-analytics/engine/stats-engine"
import { canonicalizeStatisticsInput } from "@/application/study-analytics/statistics-identity"
import { buildDisciplineIdentity, EMPTY_DISCIPLINE_IDENTITY } from "@/domain/disciplines/discipline-identity"
import type { StudentMentorContext } from "@/domain/mentor/student-mentor-context"
import type { SimuladoRecord, SimuladoRecordSubject } from "@/domain/simulados/types"
import type { CycleOverview } from "@/domain/study-cycle/study-cycle.types"
import { must } from "@/lib/testing/must"

import { MENTOR_HIGH_OVERDUE_REVIEWS } from "./mentor-insights"
import { buildStudentMentorContext, type MentorContextInput, type MentorStatsInput } from "./student-context.builder"

// G2.15 — dados → métricas → contexto → insights → recomendações, SEM LLM.

const NOW = new Date("2026-10-06T15:00:00Z") // terça, 12h em São Paulo
const CT = "ct" // Contabilidade
const PT = "pt" // Português
const X = "x"
const A = "a" // alias de X
const NDA = "noc-da" // Noções de DA (ambígua, sem vínculo)
const DA = "da"

let seq = 0
function ses(disciplineId: string | null, minutes: number, day: string, name?: string): SessionRecord {
  seq += 1
  return {
    id: `s${seq}`, disciplineId, disciplineName: name ?? (disciplineId ? `Matéria ${disciplineId}` : null), disciplineArea: null,
    startedAt: `${day}T15:00:00Z`, finishedAt: null, durationMinutes: minutes, activeMinutes: null, pausedMinutes: null,
    completed: true, interrupted: false, focusScore: null, energyLevel: null, difficulty: null, studyType: "TEORIA",
    studySource: "FREE", pagesRead: 0, questionsAnswered: 0, questionsCorrect: 0, flashcardsReviewed: 0,
    topicName: null, focusPercentage: null, plannedMinutes: null, notes: null, focusSound: null,
  }
}

function subj(id: string, q: number, c: number, name = `Matéria ${id}`): SimuladoRecordSubject {
  return { disciplineId: id, disciplineName: name, questionsCount: q, correctCount: c, wrongCount: q - c, blankCount: 0, accuracy: Math.round((c / q) * 1000) / 10 }
}

function rec(id: string, date: string, subjects: SimuladoRecordSubject[]): SimuladoRecord {
  const q = subjects.reduce((s, x) => s + x.questionsCount, 0)
  const c = subjects.reduce((s, x) => s + x.correctCount, 0)
  return {
    id, userId: "u", name: id, examName: "", roleName: "", simuladoDate: date, source: "TEC", sourceCustom: null,
    exam_board: null, exam_board_custom: null, totalQuestions: q, totalCorrect: c, totalWrong: q - c, totalBlank: 0,
    accuracy: Math.round((c / q) * 1000) / 10, timeSpentSeconds: null, notes: null, scoringRule: "PERCENTUAL",
    penaltyScore: null, subjects, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`,
  }
}

function stats(partial: Partial<MentorStatsInput> = {}): MentorStatsInput {
  return {
    sessions: [], attempts: [], disciplines: [], userDisciplines: [], reviewItems: [], reviewsCompletedLast30: 0,
    activePlan: null, activePlanError: false, weekStartDay: 1, simulados: [], identity: EMPTY_DISCIPLINE_IDENTITY, ...partial,
  }
}

function input(partial: Partial<MentorContextInput> = {}): MentorContextInput {
  return {
    now: NOW,
    stats: stats(),
    cycle: { status: "NO_DATA", overview: null },
    profileGoals: { status: "OK", weeklyStudyHours: null, weeklyQuestionsGoal: 100, weeklyStudyDaysGoal: 6 },
    target: { status: "NO_DATA", examName: null, examDate: null },
    sources: ["teste"],
    ...partial,
  }
}

const build = (p: Partial<MentorContextInput> = {}) => buildStudentMentorContext(input(p))
const insight = (c: StudentMentorContext, type: string, id?: string) =>
  c.insights.find((i) => i.type === type && (id === undefined || i.disciplineId === id))
const rec_ = (c: StudentMentorContext, type: string, id?: string) =>
  c.recommendations.find((r) => r.type === type && (id === undefined || r.disciplineId === id))

describe("usuário novo", () => {
  it("nada registrado: EMPTY, nulls (nunca 0) e 'Dados insuficientes'", () => {
    const c = build()
    assert.equal(c.contextQuality.level, "EMPTY")
    assert.equal(c.study.status, "NO_DATA")
    assert.equal(c.study.totalMinutes, null)
    assert.equal(c.study.last7, null)
    assert.equal(c.simulations.status, "NO_DATA")
    assert.equal(c.simulations.averageAccuracy, null)
    assert.equal(c.reviews.status, "NO_DATA")
    assert.equal(c.reviews.overdue, null, "0 itens não vira 0 vencidas")
    assert.equal(c.goals.weeklyStudy, null)
    assert.deepEqual(c.insights.map((i) => i.message), ["Dados insuficientes para avaliar sua evolução."])
    assert.deepEqual(c.recommendations.map((r) => r.type), ["INSUFFICIENT_DATA"])
    assert.deepEqual(c.disciplines, [])
  })

  it("metas padrão do banco (100 questões, 6 dias) não contam como meta do aluno", () => {
    const c = build()
    assert.equal(c.goals.weeklyQuestions, null)
    assert.equal(c.goals.weeklyDays, null)
    assert.equal(c.goals.status, "NO_DATA")
    assert.equal(c.goals.notes.length, 2)
  })
})

describe("usuário parcial", () => {
  it("estudo sem simulado: estudo calculado, simulados NO_DATA com aviso", () => {
    const c = build({ stats: stats({ sessions: [ses(CT, 60, "2026-10-05"), ses(CT, 30, "2026-10-01")] }) })
    assert.equal(c.study.status, "OK")
    assert.equal(c.study.last7?.minutes, 90)
    assert.equal(c.simulations.status, "NO_DATA")
    assert.ok(c.insights.some((i) => i.type === "INSUFFICIENT_DATA" && /simulados/.test(i.message)))
    assert.equal(must(c.disciplines.find((d) => d.disciplineId === CT)).simuladoAverage, null)
  })

  it("simulado sem estudo: horas da disciplina são null (não 0)", () => {
    const c = build({ stats: stats({ simulados: [rec("s1", "2026-09-20", [subj(CT, 20, 12)])] }) })
    assert.equal(c.study.status, "NO_DATA")
    assert.equal(c.simulations.status, "OK")
    const ct = must(c.disciplines.find((d) => d.disciplineId === CT))
    assert.equal(ct.studyMinutesTotal, null)
    assert.equal(ct.studyMinutesLast28, null)
    assert.equal(ct.simuladoAverage, 60)
    assert.equal(insight(c, "LAST_SIMULADO")?.message, "Seu último simulado foi 60% (20/09/2026).")
  })

  it("meta sem estudo: meta real, realizado 0 na semana e recomendação de meta", () => {
    const c = build({ profileGoals: { status: "OK", weeklyStudyHours: 15, weeklyQuestionsGoal: 100, weeklyStudyDaysGoal: 6 } })
    const g = must(c.goals.weeklyStudy)
    assert.equal(g.target, 900)
    assert.equal(g.realized, 0)
    assert.equal(g.daysElapsed, 2, "semana começando na segunda; hoje é terça")
    assert.equal(g.expectedByToday, Math.round((900 * 2) / 7))
    assert.ok(rec_(c, "STUDY_BELOW_GOAL"))
    assert.equal(c.study.status, "NO_DATA")
  })

  it("revisões sem simulado: vencidas contadas; alta prioridade a partir do limite", () => {
    const items = Array.from({ length: MENTOR_HIGH_OVERDUE_REVIEWS }, (_, i) => ({ id: `r${i}`, disciplineId: CT, status: null, nextReviewAt: "2026-10-01T12:00:00Z" }))
    items.push({ id: "hoje", disciplineId: CT, status: null, nextReviewAt: "2026-10-06T18:00:00Z" })
    const c = build({ stats: stats({ reviewItems: items }) })
    assert.equal(c.reviews.overdue, MENTOR_HIGH_OVERDUE_REVIEWS)
    assert.equal(c.reviews.dueToday, 1)
    assert.equal(insight(c, "OVERDUE_REVIEWS")?.message, `Você possui ${MENTOR_HIGH_OVERDUE_REVIEWS} revisões vencidas.`)
    assert.equal(rec_(c, "HIGH_OVERDUE_REVIEWS")?.priority, "HIGH")
    assert.equal(c.simulations.status, "NO_DATA")
  })

  it("apenas uma disciplina", () => {
    const c = build({ stats: stats({ sessions: [ses(PT, 45, "2026-10-06")] }) })
    assert.equal(c.disciplines.length, 1)
    assert.equal(c.disciplines[0]?.studyMinutesTotal, 45)
  })

  it("leitura de simulados falhou: UNAVAILABLE, nunca NO_DATA nem 0", () => {
    const c = build({ stats: stats({ simulados: null, sessions: [ses(PT, 45, "2026-10-06")] }) })
    assert.equal(c.simulations.status, "UNAVAILABLE")
    assert.equal(c.simulations.count, null)
  })
})

describe("usuário completo", () => {
  const sessions = [
    ...Array.from({ length: 10 }, (_, i) => ses(CT, 76, `2026-10-0${(i % 6) + 1}`)), // 12h40 nos últimos 7 dias
    ...Array.from({ length: 12 }, (_, i) => ses(PT, 60, `2026-09-${String(10 + i).padStart(2, "0")}`)),
  ]
  const simulados = [
    rec("s1", "2026-08-10", [subj(CT, 20, 14, "Contabilidade"), subj(PT, 20, 12, "Português")]), // CT 70, PT 60
    rec("s2", "2026-09-10", [subj(CT, 20, 13, "Contabilidade"), subj(PT, 20, 15, "Português")]), // CT 65, PT 75
    rec("s3", "2026-10-02", [subj(CT, 20, 11, "Contabilidade"), subj(PT, 20, 16, "Português")]), // CT 55, PT 80
  ]
  const c = build({
    stats: stats({ sessions, simulados }),
    profileGoals: { status: "OK", weeklyStudyHours: 15, weeklyQuestionsGoal: 50, weeklyStudyDaysGoal: 3 },
    cycle: {
      status: "OK",
      overview: {
        cycle: { name: "Receita" }, currentRound: 2, totalRoundsDone: 1, roundProgressPercentage: 42.5,
        currentItem: { disciplineId: CT, disciplineName: "Contabilidade", studiedMinutesInRound: 30.4, plannedMinutes: 90 },
        nextItem: { disciplineId: PT, disciplineName: "Português" },
      } as unknown as CycleOverview,
    },
    target: { status: "OK", examName: "Receita Federal", examDate: "2026-12-20" },
  })

  it("qualidade HIGH e estudo dos últimos 7 dias formatado", () => {
    assert.equal(c.contextQuality.level, "HIGH")
    assert.equal(c.study.last7?.minutes, 760)
    assert.equal(insight(c, "STUDY_LAST_7_DAYS")?.message.startsWith("Você estudou 12h 40min nos últimos 7 dias"), true)
  })

  it("queda com evidência estruturada (primeiro, último, variação, simulados, horas)", () => {
    const d = must(insight(c, "DECLINING_DISCIPLINE", CT))
    assert.deepEqual(
      { first: d.evidence["first"], last: d.evidence["last"], change: d.evidence["change"], simulations: d.evidence["simulations"] },
      { first: 70, last: 55, change: -15, simulations: 3 },
    )
    assert.equal(typeof d.evidence["studyMinutesTotal"], "number")
    assert.ok(rec_(c, "DECLINING_DISCIPLINE", CT))
  })

  it("evolução na outra matéria e no geral; matéria de atenção vem dos gargalos G2.10", () => {
    assert.ok(insight(c, "IMPROVING_DISCIPLINE", PT))
    assert.ok(rec_(c, "HIGH_PROGRESS", PT), "+20 p.p. ≥ 8 p.p.")
    assert.equal(c.simulations.count, 3)
    assert.equal(c.simulations.bottleneck?.disciplineId, CT)
    assert.equal(insight(c, "DISCIPLINE_ATTENTION", CT)?.message, "Contabilidade apresenta média de 63.3% nos simulados.".replace("63.3", "63,3"))
  })

  it("meta, metas não padrão, ciclo e alvo", () => {
    assert.equal(c.goals.weeklyStudy?.target, 900)
    assert.equal(c.goals.weeklyQuestions?.target, 50)
    assert.equal(c.goals.weeklyDays?.target, 3)
    assert.equal(c.cycle.currentRound, 2)
    assert.equal(c.cycle.currentItem?.studiedMinutesInRound, 30)
    assert.equal(c.cycle.nextItem?.name, "Português")
    assert.ok(insight(c, "CYCLE_POSITION")?.message.includes("volta 2"))
    assert.equal(c.target.daysToExam, 75)
  })

  it("nenhuma frase afirma causa", () => {
    for (const t of [...c.insights.map((i) => i.message), ...c.recommendations.map((r) => r.reason)]) {
      assert.doesNotMatch(t, /porque|por causa|devido|graças/i, t)
    }
  })

  it("estável: sem insight de queda nem de evolução", () => {
    const s = build({ stats: stats({ simulados: [rec("a", "2026-09-01", [subj(CT, 20, 14)]), rec("b", "2026-09-20", [subj(CT, 20, 14)])] }) })
    assert.equal(insight(s, "DECLINING_DISCIPLINE"), undefined)
    assert.equal(insight(s, "IMPROVING_DISCIPLINE"), undefined)
  })
})

describe("identidade canônica", () => {
  const identity = buildDisciplineIdentity({
    catalog: [
      { id: X, name: "Matéria X" },
      { id: A, name: "Matéria X (antiga)", canonicalDisciplineId: X },
      { id: DA, name: "Direito Administrativo" },
      { id: NDA, name: "Noções de Direito Administrativo" },
    ],
    personal: [{ disciplineId: X, customName: "Minha X" }],
  })

  it("estudo no alias + simulado na canônica = uma disciplina X; ambígua separada", () => {
    const raw = {
      sessions: [ses(A, 120, "2026-10-05"), ses(DA, 30, "2026-10-05"), ses(NDA, 15, "2026-10-04")],
      attempts: [], disciplines: [], userDisciplines: [], reviewItems: [], activePlan: null,
      simulados: [rec("s1", "2026-09-01", [subj(X, 10, 6)]), rec("s2", "2026-10-01", [subj(A, 10, 8)])],
    }
    const canonical = canonicalizeStatisticsInput(raw, identity)
    const c = build({ stats: stats({ ...canonical, identity }) })
    const x = c.disciplines.filter((d) => d.disciplineId === X)
    assert.equal(x.length, 1)
    assert.equal(x[0]?.name, "Minha X")
    assert.deepEqual(x[0]?.mergedNames, ["Matéria X (antiga)"])
    assert.equal(x[0]?.studyMinutesTotal, 120)
    assert.equal(x[0]?.simuladosCount, 2)
    assert.equal(x[0]?.simuladoEvolutionPp, 20)
    assert.equal(c.disciplines.some((d) => d.disciplineId === A), false)
    assert.ok(c.disciplines.some((d) => d.disciplineId === NDA))
    assert.ok(c.disciplines.some((d) => d.disciplineId === DA))
    assert.equal(c.identity.knownAliases, 1)
  })
})

describe("contextQuality", () => {
  it("LOW: só histórico antigo", () => {
    const c = build({ stats: stats({ sessions: [ses(CT, 60, "2026-06-01")] }) })
    assert.equal(c.contextQuality.level, "LOW")
    assert.ok(insight(c, "NO_RECENT_STUDY"))
    assert.ok(rec_(c, "LOW_STUDY_VOLUME")?.priority === "HIGH", "0 min nos últimos 7 dias")
  })

  it("MEDIUM: estudo recente + 1 simulado", () => {
    const c = build({
      stats: stats({
        sessions: [ses(CT, 60, "2026-10-05"), ses(CT, 60, "2026-10-04"), ses(CT, 60, "2026-10-03")],
        simulados: [rec("s1", "2026-10-01", [subj(CT, 10, 6)])],
      }),
    })
    assert.equal(c.contextQuality.level, "MEDIUM")
  })
})

describe("segurança, cache e anti-alucinação (wiring)", () => {
  const action = readFileSync("src/application/mentor/student-context.action.ts", "utf8")

  it("action sem parâmetros do cliente; aluno resolvido no servidor", () => {
    assert.match(action, /export async function getStudentMentorContextAction\(\): Promise/)
    assert.match(action, /getEffectiveUserId\(supabase\)/)
    assert.equal((action.match(/^export /gm) ?? []).length, 1, "só a action é exportada do arquivo use server")
  })

  it("somente leitura e sempre filtrando pelo aluno", () => {
    assert.doesNotMatch(action, /\.(insert|update|upsert|delete)\(/)
    assert.match(action, /\.eq\("user_id", userId\)/)
    assert.match(action, /\.eq\("id", userId\)/)
  })

  it("reaproveita o payload das Estatísticas (cache + invalidações) e o leitor do ciclo", () => {
    assert.match(action, /getStatisticsCenterAction\(\)/)
    assert.match(action, /loadCycleOverviewById\(/)
    for (const f of [
      "src/application/study-history/study-history.actions.ts",
      "src/application/simulados/simulado-records.actions.ts",
      "src/application/review-engine/review.actions.ts",
      "src/application/dashboard/goals.action.ts",
      "src/application/disciplines/discipline-actions.ts",
    ]) {
      assert.match(readFileSync(f, "utf8"), /invalidateStatisticsCenterCache\(/, f)
    }
  })

  it("nenhuma chamada a LLM no Mentor determinístico", () => {
    for (const f of [
      "src/application/mentor/student-context.action.ts",
      "src/application/mentor/student-context.builder.ts",
      "src/application/mentor/mentor-insights.ts",
      "src/features/mentor/components/mentor-overview.tsx",
    ]) {
      assert.doesNotMatch(readFileSync(f, "utf8"), /openai|gemini|anthropic|generativelanguage|fetch\(/i, f)
    }
  })

  it("tela: estado vazio com a frase exigida e '—' para ausência", () => {
    const ui = readFileSync("src/features/mentor/components/mentor-overview.tsx", "utf8")
    assert.match(ui, /Dados insuficientes para avaliar sua evolução\./)
    assert.match(ui, /return "—"/)
  })

  it("alvo: data e nome do exame vêm do JSON de main_study_source (colunas não existem)", () => {
    assert.deepEqual(resolveTargetFields({ main_study_source: '{"examDate":"2026-12-20","examName":"Receita"}' }), {
      examDate: "2026-12-20", examTime: null, examLocation: null, examName: "Receita",
    })
    assert.deepEqual(resolveTargetFields(null), { examDate: null, examTime: null, examLocation: null, examName: null })
    assert.match(action, /\.select\("target_exam, main_study_source"\)/)
  })
})
