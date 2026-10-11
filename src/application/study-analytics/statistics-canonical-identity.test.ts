import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { buildDisciplineIdentity, canonicalIdOf, EMPTY_DISCIPLINE_IDENTITY } from "@/domain/disciplines/discipline-identity"
import type { SimuladoRecord, SimuladoRecordSubject } from "@/domain/simulados/types"
import { filterAttempts } from "@/features/statistics/lib/attempts-filter"
import { filterSimuladosForStatistics, simuladoAnalysisByDiscipline } from "@/features/statistics/lib/simulados-by-discipline"
import { must } from "@/lib/testing/must"

import {
  computeDisciplineStats,
  computeEditalCoverage,
  computeRevisionStatistics,
  computeTopicStats,
  type DisciplineMeta,
  type QuestionAttemptRecord,
  type SessionRecord,
} from "./engine/stats-engine"
import { canonicalizeStatisticsInput, collectStatisticsDisciplineIds, type StatisticsIdentityInput } from "./statistics-identity"

// G2.13 — Estatísticas pela identidade canônica. O motor não muda: a tradução
// discipline_id → identidade acontece uma vez, no payload.

const NOW = new Date("2026-10-06T15:00:00Z")
const RLEM = "rl-e-m" // canônica: Raciocínio Lógico e Matemático
const RLM = "rl-m" // alias comprovado
const RLM2 = "rl-m-2" // segundo alias da mesma canônica (cenário de teste)
const RL = "rl" // Raciocínio Lógico (sem vínculo)
const DA = "da" // Direito Administrativo
const NDA = "noc-da" // Noções de Direito Administrativo (ambígua, SEM vínculo)

const IDENTITY = buildDisciplineIdentity({
  catalog: [
    { id: RLEM, name: "Raciocínio Lógico e Matemático" },
    { id: RLM, name: "Raciocínio Lógico-Matemático", canonicalDisciplineId: RLEM },
    { id: RLM2, name: "RLM (antigo)", canonicalDisciplineId: RLEM },
    { id: RL, name: "Raciocínio Lógico" },
    { id: DA, name: "Direito Administrativo" },
    { id: NDA, name: "Noções de Direito Administrativo" },
  ],
  personal: [{ disciplineId: DA, customName: "Dir. Adm." }],
})

let seq = 0
function ses(disciplineId: string | null, minutes: number, day = "2026-10-01", extra: Partial<SessionRecord> = {}): SessionRecord {
  seq += 1
  return {
    id: `s${seq}`, disciplineId, disciplineName: disciplineId ? `nome-${disciplineId}` : null, disciplineArea: null,
    startedAt: `${day}T15:00:00Z`, finishedAt: null, durationMinutes: minutes, activeMinutes: null, pausedMinutes: null,
    completed: true, interrupted: false, focusScore: null, energyLevel: null, difficulty: null, studyType: "TEORIA",
    studySource: "FREE", pagesRead: 0, questionsAnswered: 0, questionsCorrect: 0, flashcardsReviewed: 0,
    topicName: null, focusPercentage: null, plannedMinutes: null, notes: null, focusSound: null, ...extra,
  }
}

function att(id: string, disciplineId: string | null, correct: boolean): QuestionAttemptRecord {
  return { id, questionId: null, disciplineId, correct, answeredAt: "2026-10-01T15:00:00Z", attemptSource: "MANUAL" }
}

function subj(id: string, q: number, c: number): SimuladoRecordSubject {
  return { disciplineId: id, disciplineName: `nome-${id}`, questionsCount: q, correctCount: c, wrongCount: q - c, blankCount: 0, accuracy: Math.round((c / q) * 1000) / 10 }
}

function rec(id: string, date: string, subjects: SimuladoRecordSubject[]): SimuladoRecord {
  const q = subjects.reduce((a, s) => a + s.questionsCount, 0)
  const c = subjects.reduce((a, s) => a + s.correctCount, 0)
  return {
    id, userId: "u", name: id, examName: "", roleName: "", simuladoDate: date, source: "TEC", sourceCustom: null,
    exam_board: null, exam_board_custom: null, totalQuestions: q, totalCorrect: c, totalWrong: q - c, totalBlank: 0,
    accuracy: Math.round((c / q) * 1000) / 10, timeSpentSeconds: null, notes: null, scoringRule: "PERCENTUAL",
    penaltyScore: null, subjects, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`,
  }
}

function input(partial: Partial<StatisticsIdentityInput>): StatisticsIdentityInput {
  return { sessions: [], attempts: [], disciplines: [], userDisciplines: [], reviewItems: [], activePlan: null, simulados: [], ...partial }
}

function stats(sessions: SessionRecord[], attempts: QuestionAttemptRecord[] = [], registry = new Map<string, DisciplineMeta>()) {
  const total = sessions.reduce((a, s) => a + s.durationMinutes, 0)
  return computeDisciplineStats(sessions, attempts, registry, [], new Map(), total, NOW)
}

describe("estudo (study_history) pela identidade canônica", () => {
  it("1/7. disciplina sem alias: payload idêntico (mesmos objetos), mesmas estatísticas", () => {
    const sessions = [ses(RL, 60), ses(DA, 30)]
    const raw = input({ sessions })
    const out = canonicalizeStatisticsInput(raw, EMPTY_DISCIPLINE_IDENTITY)
    assert.equal(out.sessions[0], sessions[0])
    assert.deepEqual(stats(out.sessions).map((d) => [d.disciplineId, d.minutes]), stats(sessions).map((d) => [d.disciplineId, d.minutes]))
  })

  it("2/4. estudo no alias vai para a canônica", () => {
    const out = canonicalizeStatisticsInput(input({ sessions: [ses(RLM, 45)] }), IDENTITY)
    assert.equal(out.sessions[0]?.disciplineId, RLEM)
    assert.equal(out.sessions[0]?.disciplineName, "Raciocínio Lógico e Matemático")
  })

  it("5/6/3. estudo na canônica + no alias + em OUTRO alias: uma linha, somas corretas", () => {
    const out = canonicalizeStatisticsInput(input({ sessions: [ses(RLEM, 228), ses(RLM, 59), ses(RLM2, 13), ses(RL, 77)] }), IDENTITY)
    const list = stats(out.sessions)
    const rlem = must(list.find((d) => d.disciplineId === RLEM))
    assert.equal(rlem.minutes, 300)
    assert.equal(rlem.sessions, 3)
    assert.equal(list.length, 2, "RLEM e RL — nenhuma série para alias")
    assert.equal(must(list.find((d) => d.disciplineId === RL)).minutes, 77, "Raciocínio Lógico continua separado")
  })

  it("10. registro real entra uma vez: linha repetida (mesmo id) não duplica; registro na canônica não é recontado", () => {
    const a = ses(RLEM, 50)
    const b = ses(RLM, 10)
    const out = canonicalizeStatisticsInput(input({ sessions: [a, b, { ...a }], attempts: [att("q1", RLM, true), att("q1", RLM, true)] }), IDENTITY)
    assert.equal(out.sessions.length, 2)
    assert.equal(out.attempts?.length, 1)
    assert.equal(must(stats(out.sessions).find((d) => d.disciplineId === RLEM)).minutes, 60)
  })

  it("questões (attempts) do alias contam na acurácia da canônica", () => {
    const out = canonicalizeStatisticsInput(
      input({ sessions: [ses(RLEM, 30)], attempts: [att("q1", RLM, true), att("q2", RLEM, false), att("q3", RL, true)] }),
      IDENTITY,
    )
    const rlem = must(stats(out.sessions, out.attempts ?? []).find((d) => d.disciplineId === RLEM))
    assert.equal(rlem.questions, 2)
    assert.equal(rlem.correct, 1)
  })

  it("11. custom_name aparece; id interno é o canônico; entrada não é alterada", () => {
    const original = ses(DA, 40)
    const frozen = JSON.stringify(original)
    const out = canonicalizeStatisticsInput(input({ sessions: [original], disciplines: [{ id: DA, name: "Direito Administrativo", area: "Direito" }] }), IDENTITY)
    assert.equal(out.sessions[0]?.disciplineName, "Dir. Adm.")
    assert.equal(out.sessions[0]?.disciplineId, DA)
    assert.equal(out.disciplines?.[0]?.name, "Dir. Adm.")
    assert.equal(JSON.stringify(original), frozen)
  })

  it("12. ambígua sem vínculo continua separada (Noções de DA ≠ DA)", () => {
    const out = canonicalizeStatisticsInput(input({ sessions: [ses(DA, 40), ses(NDA, 20)] }), IDENTITY)
    assert.equal(stats(out.sessions).length, 2)
  })
})

describe("simulados (simulado_disciplines) pela identidade canônica", () => {
  const records = [
    rec("s1", "2026-08-01", [subj(RLM, 20, 10)]), // alias
    rec("s2", "2026-09-10", [subj(RLEM, 20, 14)]), // canônica
    rec("s3", "2026-09-30", [subj(RLM, 10, 9), subj(RLEM, 10, 9), subj(NDA, 10, 5)]), // ambos no mesmo simulado
  ]

  it("7/8/9. alias + canônica somados; mesmo simulado não vira dois pontos", () => {
    const out = canonicalizeStatisticsInput(input({ simulados: records }), IDENTITY)
    const byDisc = simuladoAnalysisByDiscipline(filterSimuladosForStatistics(out.simulados ?? [], [], true, "all"))
    const a = must(byDisc.get(RLEM))
    assert.equal(a.simuladosCount, 3)
    assert.equal(a.firstAccuracy, 50)
    assert.equal(a.lastAccuracy, 90)
    assert.equal(byDisc.has(RLM), false, "nenhuma série do alias")
    assert.ok(byDisc.has(NDA), "ambígua separada")
    const s3 = must(out.simulados?.find((r) => r.id === "s3"))
    assert.equal(s3.subjects.filter((s) => s.disciplineId === RLEM).length, 1)
    assert.equal(s3.totalQuestions, 30, "totais do simulado não mudam")
  })

  it("período: só simulados dentro da janela", () => {
    const out = canonicalizeStatisticsInput(input({ simulados: records }), IDENTITY)
    const inWindow = filterSimuladosForStatistics(out.simulados ?? [], ["2026-09-01", "2026-09-30"], false, "all")
    assert.deepEqual(inWindow.map((r) => r.id), ["s2", "s3"])
  })
})

describe("filtros", () => {
  it("13. filtro pela canônica inclui registros que vieram do alias (sessões, questões, simulados)", () => {
    const out = canonicalizeStatisticsInput(
      input({ attempts: [att("q1", RLM, true), att("q2", RL, true)], simulados: [rec("s1", "2026-09-01", [subj(RLM, 10, 5)])] }),
      IDENTITY,
    )
    assert.deepEqual(filterAttempts(out.attempts ?? [], [], RLEM, "all", "America/Sao_Paulo", true).map((a) => a.id), ["q1"])
    assert.equal(filterSimuladosForStatistics(out.simulados ?? [], [], true, RLEM).length, 1)
  })

  it("14. filtro que chega com id de alias é resolvido para a canônica antes de filtrar", () => {
    const out = canonicalizeStatisticsInput(input({ attempts: [att("q1", RLM, true), att("q2", RLEM, false)] }), IDENTITY)
    const selected = canonicalIdOf(IDENTITY, RLM)
    assert.equal(selected, RLEM)
    assert.equal(filterAttempts(out.attempts ?? [], [], selected, "all", "America/Sao_Paulo", true).length, 2)
  })
})

describe("seções por disciplina sem série duplicada", () => {
  it("15. edital, revisões e tópicos: uma entrada por identidade", () => {
    const out = canonicalizeStatisticsInput(
      input({
        sessions: [ses(RLEM, 30, "2026-10-01", { topicName: "Proposições" }), ses(RLM, 20, "2026-10-02", { topicName: "Proposições" })],
        userDisciplines: [
          { disciplineId: RLM, status: "REVISING" },
          { disciplineId: RLEM, status: "STUDYING" },
          { disciplineId: RL, status: "STUDYING" },
        ],
        disciplines: [
          { id: RLM, name: "Raciocínio Lógico-Matemático", area: "Exatas" },
          { id: RLEM, name: "Raciocínio Lógico e Matemático", area: "Geral" },
        ],
        reviewItems: [
          { id: "r1", disciplineId: RLM, status: "ACTIVE", nextReviewAt: "2026-10-01T00:00:00Z" },
          { id: "r2", disciplineId: RLEM, status: "ACTIVE", nextReviewAt: "2026-10-01T00:00:00Z" },
        ],
        activePlan: { weeklyHours: 10, weeklyQuestions: null, weeklyDays: null, items: [{ dayOfWeek: 1, durationMinutes: 60, disciplineId: RLM }] },
      }),
      IDENTITY,
    )
    assert.deepEqual(out.userDisciplines?.map((u) => [u.disciplineId, u.status]), [[RLEM, "STUDYING"], [RL, "STUDYING"]], "status da canônica vence")
    assert.equal(out.disciplines?.length, 1)
    assert.equal(out.activePlan?.items[0]?.disciplineId, RLEM)
    const registry = new Map((out.disciplines ?? []).map((d) => [d.id, d]))
    const discStats = stats(out.sessions, [], registry)
    assert.equal(computeEditalCoverage(out.userDisciplines ?? [], discStats, registry, NOW).byDiscipline.length, 2)
    const revision = computeRevisionStatistics(out.reviewItems ?? [], 0, NOW, registry)
    assert.equal(revision.byDiscipline.length, 1)
    const topics = computeTopicStats(out.sessions, NOW)
    assert.equal(topics.filter((t) => t.topicName === "Proposições").length, 1)
  })

  it("ids coletados cobrem todas as fontes (uma leitura de identidade)", () => {
    const ids = collectStatisticsDisciplineIds(
      input({
        sessions: [ses(RL, 1)],
        attempts: [att("q", DA, true)],
        reviewItems: [{ id: "r", disciplineId: NDA, status: null, nextReviewAt: null }],
        userDisciplines: [{ disciplineId: RLEM, status: null }],
        activePlan: { weeklyHours: null, weeklyQuestions: null, weeklyDays: null, items: [{ dayOfWeek: 1, durationMinutes: 10, disciplineId: RLM2 }] },
        simulados: [rec("s", "2026-09-01", [subj(RLM, 1, 1)])],
      }),
    )
    assert.deepEqual(ids, [DA, NDA, RL, RLEM, RLM, RLM2].sort())
  })
})

describe("volumes", () => {
  it("16. zero registros", () => {
    const out = canonicalizeStatisticsInput(input({}), IDENTITY)
    assert.deepEqual(out.sessions, [])
    assert.equal(stats(out.sessions).length, 0)
    assert.equal(simuladoAnalysisByDiscipline(out.simulados ?? []).size, 0)
  })

  it("17. um registro", () => {
    const out = canonicalizeStatisticsInput(input({ sessions: [ses(RLM, 15)] }), IDENTITY)
    assert.deepEqual(stats(out.sessions).map((d) => [d.disciplineId, d.minutes, d.sessions]), [[RLEM, 15, 1]])
  })

  it("18. muitos registros: 50.000 sessões, soma exata e tempo linear", () => {
    const ids = [RLEM, RLM, RLM2, RL, DA, NDA]
    const many: SessionRecord[] = []
    for (let i = 0; i < 50_000; i++) many.push(ses(ids[i % ids.length] ?? RL, 1))
    const t0 = performance.now()
    const out = canonicalizeStatisticsInput(input({ sessions: many }), IDENTITY)
    const elapsed = performance.now() - t0
    const list = stats(out.sessions)
    assert.equal(list.reduce((a, d) => a + d.minutes, 0), 50_000)
    const expectedRlem = many.filter((s) => s.disciplineId === RLEM || s.disciplineId === RLM || s.disciplineId === RLM2).length
    assert.equal(must(list.find((d) => d.disciplineId === RLEM)).sessions, expectedRlem)
    assert.equal(list.length, 4)
    assert.ok(elapsed < 1500, `canonicalização levou ${elapsed.toFixed(0)} ms`)
  })
})

describe("wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8")

  it("action: identidade carregada uma vez para o payload inteiro e aplicada na fronteira", () => {
    const src = read("src/application/study-analytics/statistics-center.action.ts")
    assert.equal((src.match(/loadDisciplineIdentity\(/g) ?? []).length, 1)
    assert.match(src, /collectStatisticsDisciplineIds\(raw\)/)
    assert.match(src, /canonicalizeStatisticsInput\(raw, identity\)/)
    assert.match(src, /!identityResult\.error/, "payload sem identidade não vai para o cache")
    assert.match(src, /payload\.simulados !== null/, "falha nos simulados não vai para o cache")
    assert.match(src, /readSimuladoRecords\(supabase, effectiveUserId\)/)
  })

  it("tela: filtro resolve alias e simulados usam o cálculo da G2.10", () => {
    const src = read("src/features/statistics/components/statistics-center-view.tsx")
    assert.match(src, /canonicalIdOf\(payload\?\.identity, disciplineId\)/)
    assert.match(src, /filterSessions\(\s*payload\?\.sessions \?\? \[\],\s*rangeKeys,\s*effectiveDisciplineId/)
    assert.match(src, /filterAttempts\(payload\?\.attempts \?\? \[\], rangeKeys, effectiveDisciplineId/)
    const lib = read("src/features/statistics/lib/simulados-by-discipline.ts")
    assert.match(lib, /buildSubjectAnalysis\(records\)/)
  })

  it("cache: simulado salvo/excluído e nome pessoal/vínculo invalidam as Estatísticas", () => {
    const sim = read("src/application/simulados/simulado-records.actions.ts")
    assert.equal((sim.match(/invalidateStatisticsCenterCache\(userId\)/g) ?? []).length, 2)
    const disc = read("src/application/disciplines/discipline-actions.ts")
    assert.ok((disc.match(/invalidateStatisticsCenterCache\(effectiveUserId\)/g) ?? []).length >= 3)
    assert.match(disc, /invalidateStatisticsCenterCache\(\)/, "rename global (admin) limpa o cache de todos")
  })

  it("motor de estatísticas não ganhou regra de identidade (continua agrupando por disciplineId)", () => {
    const engine = read("src/application/study-analytics/engine/stats-engine.ts")
    assert.doesNotMatch(engine, /canonical/i)
  })
})
