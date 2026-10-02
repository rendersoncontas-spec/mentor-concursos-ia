// ============================================================================
// G1.4 — CONCORRÊNCIA: guardas contra duplicação/double-advance.
//
// Bug comprovado (G1.4, banco real, transação com rollback):
// `activatePlanAction`/`togglePausePlanAction` faziam archive-all +
// activate-one em 2 escritas sem transação; o interleave A1,B1,A2,B2
// terminava com 2 planos ACTIVE (n_active=2, sem guard no catálogo).
// Correção: índice único parcial + RPC com archive-before-insert
// (migration 20260929_g14_single_active_plan.sql; mesmo interleave agora
// retorna 23505). Demais itens: guardas verificadas no banco real
// (UNIQUEs parciais, CAS, ON CONFLICT) — ver relatório G1.4.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

function src(path: string): string {
  return readFileSync(path, "utf8")
}

const G14 = src("supabase/migrations/20260929_g14_single_active_plan.sql")

describe("G1.4 — single ACTIVE garantido no banco (bug comprovado)", () => {
  it("1. índice único parcial existe na migration", () => {
    assert.match(G14, /CREATE UNIQUE INDEX IF NOT EXISTS uq_study_plans_single_active/)
    assert.match(G14, /ON public\.study_plans \(user_id\)/)
    assert.match(G14, /WHERE active IS TRUE/)
  })

  it("2. RPC arquiva ANTES de inserir (ordem compatível com o índice)", () => {
    const body = G14.slice(G14.indexOf("CREATE OR REPLACE FUNCTION"))
    const archiveAt = body.indexOf("SET active = false, status = 'ARCHIVED'")
    const insertAt = body.indexOf("INSERT INTO public.study_plans (")
    assert.ok(archiveAt !== -1 && insertAt !== -1, "ambos os blocos existem")
    assert.ok(archiveAt < insertAt, "archive-before-insert (antes era o inverso)")
  })

  it("3. RPC continua transacional única, INVOKER, sem DEFINER", () => {
    assert.match(G14, /SECURITY INVOKER/)
    assert.doesNotMatch(G14, /SECURITY DEFINER/)
    assert.doesNotMatch(G14, /COMMIT/)
    assert.match(G14, /GRANT EXECUTE ON FUNCTION public\.generate_study_plan_atomic\(JSONB\) TO authenticated/)
  })

  it("4. nenhuma estrutura legada ressuscitada nesta fase", () => {
    assert.doesNotMatch(G14, /block_status/)
    assert.doesNotMatch(G14, /parent_cycle_id/)
    assert.doesNotMatch(G14, /total_cycle_minutes/)
  })
})

describe("G1.4 — guardas de idempotência intactas (verificadas no banco real)", () => {
  it("5. conclude/skip usam upsert idempotente (UNIQUE + ON CONFLICT)", () => {
    const svc = src("src/application/study-cycle/cycle-study-registration.service.ts")
    assert.match(svc, /onConflict: "cycle_id,round_number", ignoreDuplicates: true/)
    assert.match(svc, /onConflict: "cycle_item_id,round_number", ignoreDuplicates: true/)
  })

  it("6. finalize de review mantém CAS (claim só em ACTIVE)", () => {
    const svc = src("src/application/review-engine/review.service.ts")
    assert.match(svc, /\.eq\("status", "ACTIVE"\)/)
    assert.match(svc, /recoverCompletedReviewSession\(/)
  })

  it("7. save de sessão trata conflito de operation_id sem duplicar ciclo", () => {
    const idem = src("src/application/study-session/study-session-idempotency.ts")
    assert.match(idem, /study_history_client_operation_id_idx/)
    assert.match(idem, /23505/)
  })

  it("8. activate continua 2-step no app — corrida agora falha honesta (23505), não duplica", () => {
    const action = src("src/application/study-plan/list-plans.action.ts")
    assert.match(action, /\.update\(\{ active: false, status: "ARCHIVED" \}\)/)
    assert.match(action, /\.update\(\{\s*active: true, status: "ACTIVE" \}\)/)
  })
})
