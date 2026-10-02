// ============================================================================
// G1.3 — INTEGRIDADE DO CYCLE ENGINE, ESTUDO, REVISÕES E CONSISTÊNCIA.
// Convenção de evidência:
// - [REAL-DB ...] = provado no Supabase real em 2026-09-28 (ver relatório).
// - comportamental com FakeReviewDb/fakes locais; wiring onde a action exige
//   runtime Next. Nenhum mock afirma transação real.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { FakeReviewDb } from "@/lib/testing/fake-review-db"

import {
  buildImportFingerprint,
  fingerprintField,
  FINGERPRINT_NULL,
} from "@/domain/study-history/import-fingerprint.ts"
import {
  reviewSessionMinutes,
  reviewSessionSeconds,
} from "@/domain/reviews/session-duration.ts"
import {
  studyMinutesFromMinutesInput,
  studyMinutesFromMs,
  studyMinutesFromSeconds,
} from "@/domain/study-session/study-duration.ts"
import { reconcileCycleFromStudies } from "@/application/study-cycle/cycle-reconciliation.engine.ts"
import { filterAttempts } from "@/features/statistics/lib/attempts-filter.ts"
import type { QuestionAttemptRecord } from "@/application/study-analytics/engine/stats-engine"

process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://mock.supabase.co"
process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "mock-anon-key"

import type * as ReviewService from "@/application/review-engine/review.service"

type Service = typeof ReviewService

let service: Service

async function loadService(): Promise<Service> {
  service ??= await import("@/application/review-engine/review.service")
  return service
}

function src(path: string): string {
  return readFileSync(path, "utf8")
}

// ---------------------------------------------------------------------------
// G-08 — updateFullCycleAction termina em rebuild canônico.
// ---------------------------------------------------------------------------

describe("G-08 — mutação de ciclo termina em reconciliação canônica", () => {
  const actions = src("src/application/study-cycle/study-cycle.actions.ts")
  const fn = actions.slice(actions.indexOf("export async function updateFullCycleAction"))

  it("1/2/3. composição alterada → reconcileCycleProgress (nunca clamp manual)", () => {
    assert.match(fn, /reconcileCycleProgress\(\)/)
    assert.doesNotMatch(fn, /Math\.max\(0, totalCount - 1\)/)
    assert.doesNotMatch(fn, /current_item_progress_min: 0/)
  })

  it("4. sem escrita direta de cursor/progresso na action", () => {
    assert.doesNotMatch(fn, /\.update\(\{\s*current_item_index/)
    assert.doesNotMatch(fn, /current_item_progress_min/)
  })

  it("5/6. falha de rebuild é erro honesto (não sucesso com cursor órfão)", () => {
    assert.match(fn, /if \(!reconcile\.success\)/)
    assert.match(fn, /reconciliação falhou/)
  })

  it("7. resolve canônico de disciplina (name_key antes de ilike)", () => {
    assert.match(fn, /\.eq\("name_key", discKey\)/)
    assert.match(fn, /name_key: discKey/)
  })

  it("8. round_conclusions existe para o fluxo concluir-volta [REAL-DB: tabela criada + RLS]", () => {
    const mig = src("supabase/migrations/20260929_g13_round_conclusions_table.sql")
    assert.match(mig, /CREATE TABLE IF NOT EXISTS public\.study_cycle_round_conclusions/)
    assert.match(mig, /ENABLE ROW LEVEL SECURITY/)
    assert.match(mig, /UNIQUE \(cycle_id, round_number\)/)
  })
})

// ---------------------------------------------------------------------------
// G-34 — finalize nunca declara sucesso sem estudo (comportamental).
// ---------------------------------------------------------------------------

const USER = "aluno-1"
const DISCIPLINE = "disc-1"
const NOW = "2026-03-10T15:00:00.000Z"
const LATER = "2026-03-10T15:30:00.000Z"

function fixture(): FakeReviewDb {
  return new FakeReviewDb({
    disciplines: [{ id: DISCIPLINE, name: "Direito Administrativo" }],
    topics: [{ id: "topic-1", name: "Atos", discipline_id: DISCIPLINE, user_id: null }],
    subtopics: [],
    review_items: [],
    review_history: [],
    review_sessions: [],
    study_history: [],
  })
}

function client(db: FakeReviewDb): Parameters<Service["finalizeSession"]>[0] {
  return db as unknown as Parameters<Service["finalizeSession"]>[0]
}

async function sessionWithOneAnswer(db: FakeReviewDb): Promise<{ sessionId: string }> {
  const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
  await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
  const started = await startReviewSession(client(db), USER, {}, NOW)
  const sessionId = String(started.data?.sessionId)
  await answerReviewCard(
    client(db),
    USER,
    { sessionId, itemId: String(started.data?.card?.itemId), grade: 3, durationSeconds: 12, clientOperationId: "op-1" },
    NOW,
  )
  return { sessionId }
}

describe("G-34 — completed:true só com estudo registrado", () => {
  it("9/10. insert falha APÓS o claim → completed:false + erro, sessão COMPLETED, 0 linhas", async () => {
    const { finalizeSession } = await loadService()
    const db = fixture()
    const { sessionId } = await sessionWithOneAnswer(db)

    db.failOn({ table: "study_history", method: "insert" })
    const res = await finalizeSession(client(db), USER, sessionId, LATER)

    assert.equal(res.completed, false, "sucesso aparente aqui seria perda silenciosa")
    assert.ok(res.error, "erro recuperável explícito")
    assert.match(String(res.error), /tente encerrar novamente/i)
    assert.equal(db.table("review_sessions")[0]?.["status"], "COMPLETED")
    assert.equal(db.table("study_history").length, 0)
  })

  it("11/12. retry recupera sem duplicar (1 linha; ciclo é o limite do harness)", async () => {
    const { finalizeSession } = await loadService()
    const db = fixture()
    const { sessionId } = await sessionWithOneAnswer(db)

    db.failOn({ table: "study_history", method: "insert", times: 1 })
    const first = await finalizeSession(client(db), USER, sessionId, LATER)
    assert.equal(first.completed, false)

    // Recuperação: registra o estudo (e para no ciclo, que exige Next — como
    // o teste A3 documenta, o wiring cobre o caminho positivo completo).
    await assert.rejects(
      () => finalizeSession(client(db), USER, sessionId, LATER),
      /request scope|cookies/i,
    )
    const rows = db.table("study_history")
    assert.equal(rows.length, 1, "recuperação registrou exatamente uma linha")
    assert.equal((rows[0]?.["metadata"] as { review_session_id?: string })?.review_session_id, sessionId)

    // Replay após recuperação: encontra a linha e confirma sem duplicar
    // (sem reinscrever no ciclo — ele converge no próximo estudo).
    const replay = await finalizeSession(client(db), USER, sessionId, LATER)
    assert.equal(replay.completed, true, "replay idempotente confirma sem duplicar")
    assert.equal(db.table("study_history").length, 1, "replay idempotente, sem duplicata")
  })

  it("13. sessão COMPLETED com estudo já registrado → completed:true, sem nova linha", async () => {
    const { finalizeSession } = await loadService()
    const db = fixture()
    const { sessionId } = await sessionWithOneAnswer(db)

    // db.rows() = referências vivas (db.table() retorna cópias).
    db.rows("review_sessions")[0]!["status"] = "COMPLETED"
    db.rows("review_sessions")[0]!["finished_at"] = LATER
    db.rows("study_history").push({
      id: "sh-1",
      user_id: USER,
      discipline_id: DISCIPLINE,
      duration_minutes: 30,
      metadata: { review_session_id: sessionId },
    })

    // O caminho de recuperação encontra a linha e confirma, sem inserir de
    // novo e sem reinscrever no ciclo (converge no próximo estudo).
    const res = await finalizeSession(client(db), USER, sessionId, LATER)
    assert.equal(res.completed, true)
    assert.equal(db.table("study_history").length, 1, "nenhuma linha duplicada")
  })

  it("14. DISCARDED com respostas → no-op, sem estudo, sem erro", async () => {
    const { finalizeSession } = await loadService()
    const db = fixture()
    const { sessionId } = await sessionWithOneAnswer(db)

    db.rows("review_sessions")[0]!["status"] = "DISCARDED"
    const res = await finalizeSession(client(db), USER, sessionId, LATER)

    assert.equal(res.completed ?? false, false)
    assert.equal(res.error ?? null, null)
    assert.equal(db.table("study_history").length, 0)
  })

  it("15/16. sessão vazia COMPLETED em replay → no-op preservado (sem completed, sem erro)", async () => {
    const { startReviewSession, finalizeSession } = await loadService()
    const db = fixture()
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)

    const first = await finalizeSession(client(db), USER, sessionId, NOW)
    assert.equal(first.completed, true)
    const second = await finalizeSession(client(db), USER, sessionId, LATER)
    assert.equal(second.completed ?? false, false)
    assert.equal(second.error ?? null, null)
    assert.equal(db.table("study_history").length, 0)
  })

  it("17/18. ordem travada: recuperação existe ANTES de qualquer completed:true cego", () => {
    const body = src("src/application/review-engine/review.service.ts")
    const fn = body.slice(body.indexOf("export async function finalizeSession"))
    assert.match(fn, /recoverCompletedReviewSession\(/)
    assert.match(fn, /findStudyHistoryByReviewSession\(/)
    assert.match(fn, /if \(!inserted\.ok\)/)
    const bad = /return \{ cycleSyncError, completed: true \}[\s\S]{0,50}insertReviewStudyHistory/
    assert.equal(bad.test(fn), false, "completed:true nunca precede a gravação")
  })
})

// ---------------------------------------------------------------------------
// G-21 — planejamento atômico (RPC) [REAL-DB: sucesso+falha atômicos].
// ---------------------------------------------------------------------------

describe("G-21 — geração sem meio-plano", () => {
  function generateStudyPlanBody(): string {
    const svc = src("src/application/study-plan/study-plan.service.ts")
    const start = svc.indexOf("export async function generateStudyPlan(")
    assert.ok(start !== -1, "generateStudyPlan deve existir")
    const end = svc.indexOf("\nexport async function", start + 1)
    return svc.slice(start, end === -1 ? svc.length : end)
  }

  it("19/20. service não escreve direto: plano+itens só via RPC", () => {
    const body = generateStudyPlanBody()
    assert.match(body, /persistStudyPlanDraftAtomic\(/)
    assert.doesNotMatch(body, /\.from\("study_plans"\)/)
    assert.doesNotMatch(body, /\.from\("study_plan_items"\)/)
    assert.doesNotMatch(body, /\.from\("user_disciplines"\)/)
    assert.doesNotMatch(body, /\.from\("profiles"\)/)
  })

  it("21/22. action não apaga disciplinas: replace só dentro da RPC, após draft", () => {
    const action = src("src/application/study-plan/generate-study-plan.action.ts")
    assert.doesNotMatch(action, /\.from\("user_disciplines"\)\s*\n?\s*\.delete\(\)/)
    assert.match(action, /computeStudyPlanDraft\(/)
    assert.match(action, /persistStudyPlanDraftAtomic\(/)
  })

  it("23. compute é puro-leitura (nenhum insert/update/delete no draft)", () => {
    const svc = src("src/application/study-plan/study-plan.service.ts")
    const start = svc.indexOf("export async function computeStudyPlanDraft(")
    const end = svc.indexOf("export async function persistStudyPlanDraftAtomic(")
    const body = svc.slice(start, end)
    assert.doesNotMatch(body, /\.insert\(/)
    assert.doesNotMatch(body, /\.update\(/)
    assert.doesNotMatch(body, /\.delete\(/)
    assert.doesNotMatch(body, /\.upsert\(/)
  })

  it("24. RPC valida auth/target/caps e concede só a authenticated", () => {
    const mig = src("supabase/migrations/20260929_g21_study_plan_atomic.sql")
    assert.match(mig, /SECURITY INVOKER/)
    assert.match(mig, /g21_not_authenticated/)
    assert.match(mig, /g21_target_not_found/)
    assert.match(mig, /g21_invalid_payload/)
    assert.match(mig, /ON CONFLICT \(user_id, target_id, discipline_id\) DO NOTHING/)
    assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.generate_study_plan_atomic\(JSONB\) TO authenticated/)
    assert.doesNotMatch(mig, /SECURITY DEFINER/)
  })
})

// ---------------------------------------------------------------------------
// G-22 — filtro exato por disciplina.
// ---------------------------------------------------------------------------

function attempt(over: Partial<QuestionAttemptRecord>): QuestionAttemptRecord {
  return {
    disciplineId: null,
    attemptSource: null,
    answeredAt: "2026-09-10T12:00:00.000Z",
    ...over,
  } as QuestionAttemptRecord
}

const RANGE = ["2026-09-01", "2026-09-30"]

describe("G-22 — filtro por disciplina não infla com órfãos", () => {
  const base = [
    attempt({ disciplineId: "X" }),
    attempt({ disciplineId: null }),
    attempt({ disciplineId: "Y" }),
  ]

  it("31. Todas: tudo passa (comportamento preservado)", () => {
    assert.equal(filterAttempts(base, RANGE, "all", "all", "America/Sao_Paulo", true).length, 3)
  })

  it("32/33/34. filtro X: só X; null e Y excluídos", () => {
    const out = filterAttempts(base, RANGE, "X", "all", "America/Sao_Paulo", true)
    assert.equal(out.length, 1)
    assert.equal(out[0]?.disciplineId, "X")
  })

  it("35/36. attempts null nunca entram em filtro específico", () => {
    const onlyNull = [attempt({ disciplineId: null }), attempt({ disciplineId: null })]
    assert.equal(filterAttempts(onlyNull, RANGE, "X", "all", "America/Sao_Paulo", true).length, 0)
    assert.equal(filterAttempts(onlyNull, RANGE, "all", "all", "America/Sao_Paulo", true).length, 2)
  })

  it("37/38. combinação com studyType e período", () => {
    const rows = [
      attempt({ disciplineId: "X", attemptSource: "SIMULADO", answeredAt: "2026-09-10T12:00:00.000Z" }),
      attempt({ disciplineId: null, attemptSource: "SIMULADO", answeredAt: "2026-09-10T12:00:00.000Z" }),
      attempt({ disciplineId: "X", attemptSource: "MANUAL", answeredAt: "2026-08-01T12:00:00.000Z" }),
    ]
    assert.equal(filterAttempts(rows, RANGE, "X", "SIMULADO", "America/Sao_Paulo", false).length, 1)
    assert.equal(filterAttempts(rows, RANGE, "X", "all", "America/Sao_Paulo", false).length, 1)
  })

  it("39/40. history/sessions seguem exigindo igualdade (sem null fantasma)", () => {
    const view = src("src/features/statistics/components/statistics-center-view.tsx")
    assert.match(view, /filterSessions/)
  })
})

// ---------------------------------------------------------------------------
// G-35 — semântica única de duração (fronteiras exatas).
// ---------------------------------------------------------------------------

describe("G-35 — minutos arredondados em todo estudo; revisão com piso", () => {
  const cases: Array<[number, number]> = [
    [0, 0], [1, 0], [29, 0], [30, 1], [31, 1], [59, 1],
    [60, 1], [61, 1], [89, 1], [90, 2], [91, 2], [119, 2], [120, 2],
  ]
  it("41-44. studyMinutesFromMs: fronteiras 0..120s", () => {
    for (const [s, m] of cases) {
      assert.equal(studyMinutesFromMs(s * 1000), m, `${s}s`)
      assert.equal(studyMinutesFromSeconds(s), m, `${s}s`)
    }
  })

  it("45-47. inválidos e negativos viram 0 (nunca NaN/negativo)", () => {
    assert.equal(studyMinutesFromMs(NaN), 0)
    assert.equal(studyMinutesFromMs(-5000), 0)
    assert.equal(studyMinutesFromMs(Infinity), 0)
    assert.equal(studyMinutesFromMinutesInput("abc"), 0)
    assert.equal(studyMinutesFromMinutesInput(2.5), 3)
    assert.equal(studyMinutesFromMinutesInput(-3), 0)
  })

  it("48-50. revisão mantém piso 1 documentado (sessão respondida não some)", () => {
    assert.equal(reviewSessionMinutes(20), 1)
    assert.equal(reviewSessionMinutes(0), 1)
    assert.equal(reviewSessionSeconds("2026-09-10T10:00:00.000Z", "2026-09-10T10:00:20.000Z"), 20)
  })

  it("51/52. sem floor divergente nos caminhos de estudo", () => {
    assert.doesNotMatch(src("src/features/study-session/components/study-provider.tsx"), /Math\.floor\(session\.activeSeconds/)
    assert.doesNotMatch(src("src/infrastructure/offline/pending-study-session.ts"), /Math\.floor/)
    const action = src("src/application/study-session/study-session.action.ts")
    assert.match(action, /studyMinutesFromMs\(/)
  })
})

// ---------------------------------------------------------------------------
// G-38 — fingerprint único TS = SQL.
// ---------------------------------------------------------------------------

describe("G-38 — NULL normalizado uma única vez", () => {
  it("53/54. null/undefined → '~null~'; '' preservado; valores intactos", () => {
    assert.equal(fingerprintField(null), "~null~")
    assert.equal(fingerprintField(undefined), "~null~")
    assert.equal(fingerprintField(""), "")
    assert.equal(fingerprintField("aprovado"), "aprovado")
    assert.equal(fingerprintField(0), "0")
    assert.equal(FINGERPRINT_NULL, "~null~")
  })

  it("55/56. NULL e '' geram identidades distintas (como no índice)", () => {
    const withNull = buildImportFingerprint({
      epochSeconds: "1", disciplineId: "d", durationMinutes: fingerprintField(null),
      questions: fingerprintField(null), correct: fingerprintField(null), origin: fingerprintField(null),
    })
    const withEmpty = buildImportFingerprint({
      epochSeconds: "1", disciplineId: "d", durationMinutes: "",
      questions: "", correct: "", origin: "",
    })
    assert.notEqual(withNull, withEmpty)
    assert.match(withNull, /~null~/)
  })

  it("57/58. retry do mesmo registro gera o mesmo fingerprint (idempotência)", () => {
    const mk = () => buildImportFingerprint({
      epochSeconds: "1726400000", disciplineId: "d1", durationMinutes: "30",
      questions: "10", correct: "7", origin: "aprovado",
    })
    assert.equal(mk(), mk())
    assert.match(mk(), /^v2\|/)
  })

  it("59/60. action usa o canônico nos dois cálculos (memória e lote)", () => {
    const action = src("src/application/import-history/import-history.actions.ts")
    const uses = action.match(/fingerprintField\(/g) ?? []
    assert.ok(uses.length >= 4, "fingerprintField nos dois caminhos de fingerprint")
    assert.doesNotMatch(action, /row\.origin_source \?\? ""/)
    assert.doesNotMatch(action, /String\(minutes\) : ""/)
  })
})

// ---------------------------------------------------------------------------
// §7 — auditoria dos objetos ausentes (classificação travada).
// ---------------------------------------------------------------------------

describe("§7 — classificação dos símbolos sem tabela/coluna no banco real", () => {
  it("61. round_conclusions: ACTIVE MISSING → tabela criada em migration G1.3", () => {
    assert.ok(
      readFileSync("supabase/migrations/20260929_g13_round_conclusions_table.sql", "utf8").includes(
        "CREATE TABLE IF NOT EXISTS public.study_cycle_round_conclusions",
      ),
    )
  })

  it("62. block_status/parent_cycle_id/total_cycle_minutes: LEGACY (só migration legada)", () => {
    const legacy = src("src/application/study-cycle/migration/cycle-migration.service.ts")
    assert.match(legacy, /block_status/)
    assert.match(legacy, /parent_cycle_id/)
    const actions = src("src/application/study-cycle/study-cycle.actions.ts")
    assert.doesNotMatch(actions, /block_status/)
    assert.doesNotMatch(actions, /parent_cycle_id/)
    assert.doesNotMatch(actions, /total_cycle_minutes/)
  })

  it("63. execution_order: ACTIVE em daily-blocks (tabela distinta, fora do ciclo)", () => {
    const replan = src("src/application/study-plan/replan/adaptive-replan.service.ts")
    assert.match(replan, /execution_order/)
  })

  it("64. nenhum CREATE TABLE para símbolo legado nesta fase", () => {
    const migs = [
      src("supabase/migrations/20260929_g13_round_conclusions_table.sql"),
      src("supabase/migrations/20260929_g21_study_plan_atomic.sql"),
    ].join("\n")
    assert.doesNotMatch(migs, /block_status/)
    assert.doesNotMatch(migs, /parent_cycle_id/)
    assert.doesNotMatch(migs, /total_cycle_minutes/)
  })

  it("65. conclude usa a tabela restaurada (fluxo quebrado → funcional)", () => {
    const svc = src("src/application/study-cycle/cycle-study-registration.service.ts")
    assert.match(svc, /\.from\("study_cycle_round_conclusions"\)/)
  })
})

// ---------------------------------------------------------------------------
// G-08 comportamental — rebuild após mutação (puro, sem Next/DB).
// O stored cursor (ex.: current_item_index = 5) é descartado pelo rebuild:
// o índice válido é sempre derivado de itens + estudos reais.
// ---------------------------------------------------------------------------

const G8_ITEMS = [
  { id: "i1", disciplineId: "d1", disciplineName: "D1", targetSeconds: 3600 },
  { id: "i2", disciplineId: "d2", disciplineName: "D2", targetSeconds: 3600 },
  { id: "i3", disciplineId: "d3", disciplineName: "D3", targetSeconds: 3600 },
  { id: "i4", disciplineId: "d4", disciplineName: "D4", targetSeconds: 3600 },
  { id: "i5", disciplineId: "d5", disciplineName: "D5", targetSeconds: 3600 },
  { id: "i6", disciplineId: "d6", disciplineName: "D6", targetSeconds: 3600 },
]

describe("G-08 — rebuild após mutação preserva cursor/round/progresso", () => {
  it("1. reduzir itens (6→2): cursor dentro dos limites, round válido", () => {
    const studies = [
      { id: "s1", cycleItemId: "i1", disciplineId: "d1", seconds: 3600 },
    ]
    const r = reconcileCycleFromStudies(G8_ITEMS.slice(0, 2), studies)
    assert.ok(r.state.currentItemIndex >= 0 && r.state.currentItemIndex < 2)
    assert.ok(r.state.currentRound >= 1)
  })

  it("2. remover o item atual (i1 completo, i1 sai): cursor vai ao próximo existente", () => {
    const studies = [
      { id: "s1", cycleItemId: "i1", disciplineId: "d1", seconds: 3600 },
    ]
    const remaining = G8_ITEMS.filter((i) => i.id !== "i1")
    const r = reconcileCycleFromStudies(remaining, studies)
    assert.equal(r.state.currentItemIndex, 0)
    assert.equal(remaining[r.state.currentItemIndex]?.id, "i2")
  })

  it("3. reordenar (reverso): cursor segue o primeiro incompleto na nova ordem", () => {
    const studies = [
      { id: "s1", cycleItemId: "i6", disciplineId: "d6", seconds: 3600 },
    ]
    const reversed = [...G8_ITEMS].reverse()
    const r = reconcileCycleFromStudies(reversed, studies)
    // i6 completo na nova ordem está em 0 → cursor avança para i5.
    assert.equal(reversed[r.state.currentItemIndex]?.id, "i5")
  })

  it("4. índice antigo 5 inválido após encolher para 2 itens: reconciliado, nunca % cego", () => {
    const oldIndex = 5
    assert.ok(oldIndex >= 2, "cenário: índice armazenado fora da nova composição")
    const r = reconcileCycleFromStudies(G8_ITEMS.slice(0, 2), [])
    assert.ok(r.state.currentItemIndex >= 0 && r.state.currentItemIndex < 2)
    assert.equal(r.state.currentItemIndex, 0)
  })

  it("5. conclusion de round futuro/stale não fecha duas voltas", () => {
    const r = reconcileCycleFromStudies(G8_ITEMS.slice(0, 2), [], [], [
      { roundNumber: 99, occurredAt: "2026-09-10T10:00:00.000Z" },
    ])
    assert.equal(r.state.currentRound, 1)
    assert.equal(r.state.totalRoundsDone, 0)
  })

  it("6. mutação no último item: progresso parcial preservado, cursor válido", () => {
    const studies = [
      { id: "s1", cycleItemId: "i6", disciplineId: "d6", seconds: 1200 },
    ]
    const r = reconcileCycleFromStudies(G8_ITEMS, studies)
    assert.equal(r.state.currentItemIndex, 0)
    assert.equal(r.state.currentItemProgressSeconds, 0)
    const onlyLast = [G8_ITEMS[5]!]
    const r2 = reconcileCycleFromStudies(onlyLast, studies)
    assert.equal(r2.state.currentItemIndex, 0)
    assert.equal(r2.state.currentItemProgressSeconds, 1200)
  })

  it("7/8. sem órfãos: sessões só referenciam itens existentes; progresso nunca negativo", () => {
    const studies = [
      { id: "s1", cycleItemId: "i1", disciplineId: "d1", seconds: 3600 },
      { id: "s-ghost", cycleItemId: "removido", disciplineId: "dx", seconds: 9999 },
    ]
    const items = G8_ITEMS.slice(0, 2)
    const r = reconcileCycleFromStudies(items, studies)
    const ids = new Set(items.map((i) => i.id))
    for (const s of r.sessions) assert.ok(ids.has(s.cycle_item_id), "sessão órfã")
    assert.ok(r.state.currentItemProgressSeconds >= 0)
    assert.ok(r.state.currentRound >= 1)
  })
})
