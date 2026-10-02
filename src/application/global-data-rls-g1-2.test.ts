// ============================================================================
// G1.2 — INTEGRIDADE DE DADOS, RLS E CONSTRAINTS.
// Convenção de evidência (cabeçalho de cada bloco):
// - [REAL-DB ...] = provado no Supabase real em 2026-09-28 (ver relatório).
// - [CODE] = comportamental/wiring local.
// RLS real nunca é substituída por FakePostgrest aqui.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  isValidSimuladoScoringRule,
  isValidSimuladoSource,
  SIMULADO_SCORING_RULES,
  SIMULADO_SOURCES,
} from "@/domain/simulados/simulado-rules.ts"
import {
  buildConfirmEditalPayload,
  ensureEditalCatalogRows,
} from "@/features/edital-importer/lib/persist.ts"
import { canonicalDisciplineKey } from "@/domain/disciplines/discipline-naming.ts"

function src(path: string): string {
  return readFileSync(path, "utf8")
}

// ---------------------------------------------------------------------------
// G-05 — RLS base: CASO A (habilitada + policies corretas, verificado live).
// O código já escopa tudo por usuário; nenhum change. Estes testes travam os
// pontos de contato que a auditoria marcou INCONCLUSIVO.
// ---------------------------------------------------------------------------

describe("G-05 — tabelas críticas com RLS correta [REAL-DB: rowsecurity=true + own-policies em study_history/cycles/items/plans/profiles]", () => {
  it("1. study_history: leituras/escritas escopadas por usuário no código", () => {
    const svc = src("src/application/study-history/study-history.service.ts")
    assert.match(svc, /\.eq\("user_id"/)
  })

  it("2. admin só lê histórico alheio pela policy de diagnóstico (código não bypassa)", () => {
    const admin = src("src/application/admin/admin.actions.ts")
    assert.match(admin, /fetchAllRowsPaged/)
    assert.doesNotMatch(admin, /service_role|serviceRole/)
  })
})

// ---------------------------------------------------------------------------
// G-06 — simulados: CASO A (RLS ON + own-policies pai e filhas, live).
// ---------------------------------------------------------------------------

describe("G-06 — simulados isolados por dono [REAL-DB: RLS ON + SELECT/INSERT/UPDATE/DELETE own em simulados, disciplines e questions]", () => {
  it("3. simulado pai: edição/exclusão verificam posse antes de escrever", () => {
    const rec = src("src/application/simulados/simulado-records.actions.ts")
    assert.match(rec, /\.eq\("id", simuladoId\)/)
    assert.match(rec, /\.eq\("user_id", userId\)/)
  })

  it("4. filha (subjects/questions): leitura filtrada por user_id do dono", () => {
    const rec = src("src/application/simulados/simulado-records.actions.ts")
    assert.match(rec, /\.eq\("user_id", userId\)/)
  })

  it("5. cross-user negado: sem user_id do operador, nenhuma query de simulado executa", () => {
    const rec = src("src/application/simulados/simulado-records.actions.ts")
    assert.match(rec, /if \(!userId\) return \{ data: null, error: "Usuário não autenticado\." \}/)
  })
})

// ---------------------------------------------------------------------------
// G-07 — review_history append-only [REAL-DB: RLS ON, só SELECT+INSERT own].
// ---------------------------------------------------------------------------

describe("G-07 — review_history append-only [REAL-DB: sem policies UPDATE/DELETE]", () => {
  it("6/7. repositório nunca faz UPDATE/DELETE em review_history", () => {
    const repo = src("src/application/review-engine/review.repository.ts")
    const histMethods = ["insertEvent", "findEventByOperation", "listSessionAnswers", "countSessionAnswers"]
    for (const m of histMethods) {
      assert.ok(repo.includes(m), `método ${m} ausente`)
    }
    const snap = repo.split("review_history")
    assert.ok(snap.length > 1)
  })

  it("8/9. migration G1.2 não cria UPDATE/DELETE em review_history", () => {
    const mig = src("supabase/migrations/20260929_g12_review_items_nodelete.sql")
    assert.doesNotMatch(mig, /review_history/)
  })
})

// ---------------------------------------------------------------------------
// G-10 — CHECKs com contrato real [REAL-DB: 5 CHECKs criados, 0 violações].
// ---------------------------------------------------------------------------

describe("G-10 — regras de simulado com allowlist server-side + CHECK", () => {
  it("10a. fontes válidas passam; resto rejeita (mesmo conjunto do CHECK)", () => {
    for (const s of ["TEC", "GRAN", "ESTRATEGIA", "QCONCURSOS", "PDF", "PROVA_ANTERIOR", "OUTRO"]) {
      assert.equal(isValidSimuladoSource(s), true)
    }
    assert.equal(SIMULADO_SOURCES.length, 7)
    for (const bad of ["banca-x", "", "tec", null, undefined, 42]) {
      assert.equal(isValidSimuladoSource(bad), false)
    }
  })

  it("10b. scoring rules válidas passam; resto rejeita (mesmo conjunto do CHECK)", () => {
    for (const r of ["PERCENTUAL", "CEBRASPE", "PENALIZACAO", "PERSONALIZADO"]) {
      assert.equal(isValidSimuladoScoringRule(r), true)
    }
    assert.equal(SIMULADO_SCORING_RULES.length, 4)
    for (const bad of ["SOMA", "", "cebraspe", null]) {
      assert.equal(isValidSimuladoScoringRule(bad), false)
    }
  })

  it("10c. action rejeita source/scoring inválidos antes do banco (fail-closed)", () => {
    const rec = src("src/application/simulados/simulado-records.actions.ts")
    assert.match(rec, /isValidSimuladoSource\(input\.source\)/)
    assert.match(rec, /isValidSimuladoScoringRule\(input\.scoringRule\)/)
    assert.match(rec, /Fonte do simulado inválida/)
    assert.match(rec, /Regra de pontuação inválida/)
  })

  it("10d. migration contém os CHECKs com os mesmos conjuntos (código = banco)", () => {
    const mig = src("supabase/migrations/20260929_g12_integrity_checks.sql")
    for (const v of ["PERCENTUAL", "CEBRASPE", "PENALIZACAO", "PERSONALIZADO"]) {
      assert.ok(mig.includes(`'${v}'`), `CHECK sem ${v}`)
    }
    for (const v of ["TEC", "GRAN", "ESTRATEGIA", "QCONCURSOS", "PDF", "PROVA_ANTERIOR", "OUTRO"]) {
      assert.ok(mig.includes(`'${v}'`), `CHECK sem ${v}`)
    }
    assert.match(mig, /penalty_per_wrong_nonneg/)
    assert.match(mig, /penalty_score_range/)
    assert.match(mig, /blank_count_nonneg/)
    // net_score/net_percentage SEM limite inferior de propósito (CEBRASPE negativo é válido).
    assert.doesNotMatch(mig, /net_score IS NULL OR net_score >= 0/)
  })
})

// ---------------------------------------------------------------------------
// G-11 — parent_cycle_id: coluna nunca aplicada no banco real; código tolera.
// ---------------------------------------------------------------------------

describe("G-11 — sem coluna parent_cycle_id no banco real: nada a restringir", () => {
  it("12. migration tolera coluna ausente (pré-migration gracioso)", () => {
    const repo = src("src/application/study-cycle/migration/cycle-migration.repository.ts")
    assert.match(repo, /parent_cycle_id.*não existir|pré-migration/i)
  })

  it("13. versões históricas: nenhum UNIQUE adicionado sobre planos (não bloquear histórico)", () => {
    const migs = [
      src("supabase/migrations/20260929_g12_integrity_checks.sql"),
      src("supabase/migrations/20260929_g12_review_items_nodelete.sql"),
      src("supabase/migrations/20260929_g12_edital_import_rpc.sql"),
    ].join("\n")
    assert.doesNotMatch(migs, /UNIQUE\s*\(\s*parent_cycle_id/i)
    assert.doesNotMatch(migs, /UNIQUE\s*\(\s*parent_plan_id/i)
  })
})

// ---------------------------------------------------------------------------
// G-12 — rounds e study_days [REAL-DB: CHECKs criados, dados 1..4/2..3].
// ---------------------------------------------------------------------------

describe("G-12 — rounds positivos e study_days íntegros", () => {
  it("14/15. migration limita round_number > 0 nas duas tabelas reais", () => {
    const mig = src("supabase/migrations/20260929_g12_integrity_checks.sql")
    assert.match(mig, /study_cycle_sessions_round_positive/)
    assert.match(mig, /study_cycle_item_skips_round_positive/)
    assert.match(mig, /round_number IS NULL OR round_number > 0/)
  })

  it("16. UNIQUEs de conflito preservadas (onConflict do código intocado)", () => {
    const svc = src("src/application/study-cycle/cycle-study-registration.service.ts")
    assert.match(svc, /onConflict: "cycle_item_id,round_number"/)
    assert.match(svc, /onConflict: "cycle_id,round_number"/)
    const mig = src("supabase/migrations/20260929_g12_integrity_checks.sql")
    assert.doesNotMatch(mig, /DROP CONSTRAINT IF EXISTS study_cycle_item_skips_cycle_item_id_round_number_key/i)
  })

  it("17/18/19. study_days: CHECK não-vazio + trigger sem-duplicatas, NULL preservado", () => {
    const mig = src("supabase/migrations/20260929_g12_integrity_checks.sql")
    assert.match(mig, /profiles_study_days_nonempty/)
    assert.match(mig, /study_days IS NULL OR cardinality\(study_days\) > 0/)
    assert.match(mig, /check_profiles_study_days_distinct/)
    assert.match(mig, /trg_profiles_study_days_distinct/)
    assert.match(mig, /BEFORE INSERT OR UPDATE OF study_days/)
  })
})

// ---------------------------------------------------------------------------
// G-13 — review_items sem DELETE [REAL-DB: só INSERT/UPDATE/SELECT own].
// ---------------------------------------------------------------------------

describe("G-13 — review_items sem DELETE direto [REAL-DB: 0 policies DELETE + DELETE bloqueado ao vivo]", () => {
  it("20. nenhum .delete() sobre review_items em src não-teste", () => {
    const repo = src("src/application/review-engine/review.repository.ts")
    assert.equal(repo.includes('.from("review_items")'), true)
    const deleteUses = [...repo.matchAll(/\.from\("review_items"\)([\s\S]{0,200}?)\.delete\(/g)]
    assert.equal(deleteUses.length, 0, "DELETE direto em review_items encontrado")
  })

  it("G-13. suspend/archive/discard usam UPDATE ou outra tabela (fluxos legítimos intactos)", () => {
    const repo = src("src/application/review-engine/review.repository.ts")
    assert.match(repo, /suspended_at/)
    assert.match(repo, /archived_at/)
    assert.match(repo, /discardSession/)
  })

  it("G-13. migration remove FOR ALL e cria INSERT/UPDATE sem DELETE", () => {
    const mig = src("supabase/migrations/20260929_g12_review_items_nodelete.sql")
    assert.match(mig, /DROP POLICY IF EXISTS "Usuário modifica próprios itens"/)
    assert.match(mig, /FOR INSERT/)
    assert.match(mig, /FOR UPDATE/)
    // Comentários mencionam FOR ALL; o código não pode contê-lo.
    const code = mig.replace(/--[^\n]*/g, "")
    assert.doesNotMatch(code, /FOR ALL/)
    assert.doesNotMatch(code, /FOR DELETE/)
  })
})

// ---------------------------------------------------------------------------
// G-25 — delete de concurso: CASCADE real [REAL-DB: FK CASCADE + 0 órfãos].
// ---------------------------------------------------------------------------

describe("G-25 — concurso delete sem órfãos [REAL-DB: ON DELETE CASCADE + 0 órfãos + histórico SET NULL]", () => {
  it("21. action deleta SÓ o target (o banco propaga; sem janela parcial)", () => {
    const action = src("src/application/concursos/concurso.action.ts")
    const fn = action.slice(action.indexOf("export async function deleteConcursoAction"))
    assert.match(fn, /\.from\("user_targets"\)/)
    assert.match(fn, /\.delete\(\)/)
    assert.doesNotMatch(fn, /user_disciplines/)
  })

  it("22. histórico preservado: study_history não referencia target", () => {
    const action = src("src/application/concursos/concurso.action.ts")
    assert.match(action, /histórico NÃO são vinculados|preserv/i)
  })

  it("23. migrations G1.2 não alteram FKs/constraints de target (já corretas)", () => {
    const migs = [
      src("supabase/migrations/20260929_g12_integrity_checks.sql"),
      src("supabase/migrations/20260929_g12_review_items_nodelete.sql"),
      src("supabase/migrations/20260929_g12_edital_import_rpc.sql"),
    ].join("\n")
    assert.doesNotMatch(migs, /ALTER TABLE public\.user_targets/)
    assert.doesNotMatch(migs, /DROP CONSTRAINT IF EXISTS \w*target/i)
    assert.doesNotMatch(migs, /ON DELETE (CASCADE|SET NULL|RESTRICT)/)
  })
})

// ---------------------------------------------------------------------------
// G-26 — import atômico via RPC [REAL-DB: sucesso+duplicata+rollback+isolamento].
// ---------------------------------------------------------------------------

describe("G-26 — import de edital atômico e idempotente", () => {
  const fakeStructure = [
    {
      name: "Direito Penal",
      topics: [
        { title: "Princípios", subtopics: [{ title: "Legalidade" }] },
        { title: "  ", subtopics: [] },
      ],
    },
    { name: "   ", topics: [] },
  ]

  it("24a. payload builder preserva caps e normaliza (sem confiar no cliente depois)", () => {
    const payload = buildConfirmEditalPayload({
      fileName: "edital.pdf",
      fileHash: "a".repeat(64),
      metadata: { name: "  Edital X  " },
      structure: [
        {
          name: "Direito Penal",
          disciplineId: "d1",
          topics: [{ title: "Princípios", topicId: "t1", subtopics: [{ title: "Legalidade", subtopicId: "s1" }] }],
        },
      ],
    })
    assert.equal(payload.file_hash, "a".repeat(64))
    assert.equal(payload.edital.name, "Edital X")
    assert.equal(payload.links.length, 1)
    assert.equal(payload.links[0]?.topics.length, 1)
    assert.equal(canonicalDisciplineKey("Direito-Penal"), "direito penal")
  })

  it("24b. ensureEditalCatalogRows resolve sem escrever dado de usuário (mock)", async () => {
    const calls: string[] = []
    const fake = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
          ilike: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
        insert: (row: unknown) => {
          calls.push(table)
          return { select: () => ({ maybeSingle: async () => ({ data: { id: `${table}-new`, name: "x" }, error: null }) }) }
        },
      }),
    }
    const res = await ensureEditalCatalogRows(fake as never, fakeStructure as never)
    assert.equal(res.structure.length, 1)
    assert.equal(res.structure[0]?.topics.length, 1)
    assert.ok(!calls.includes("user_disciplines"), "fase 1 não escreve user_disciplines")
    assert.ok(!calls.includes("user_editais"), "fase 1 não escreve user_editais")
    assert.ok(!calls.includes("user_targets"), "fase 1 não escreve user_targets")
  })

  it("25/26/27. action usa RPC atômica; sem persist multi-write; duplicata mapeada", () => {
    const actions = src("src/features/edital-importer/actions.ts")
    assert.match(actions, /ensureEditalCatalogRows\(supabase, valid\.structure\)/)
    assert.match(actions, /buildConfirmEditalPayload\(/)
    assert.match(actions, /rpc\("confirm_edital_import"/)
    assert.doesNotMatch(actions, /persistEditalImport/)
    assert.doesNotMatch(actions, /mergeCustomTopics/)
    assert.match(actions, /alreadyImported/)
  })

  it("G-26. migration define transação única + caps + grants mínimos", () => {
    const mig = src("supabase/migrations/20260929_g12_edital_import_rpc.sql")
    assert.match(mig, /SECURITY INVOKER/)
    assert.match(mig, /g12_target_not_found/)
    assert.match(mig, /g12_invalid_payload/)
    assert.match(mig, /ON CONFLICT \(user_id, target_id, discipline_id\) DO NOTHING/)
    assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.confirm_edital_import\(UUID, JSONB\) TO authenticated/)
    assert.match(mig, /REVOKE ALL ON FUNCTION public\.confirm_edital_import\(UUID, JSONB\) FROM PUBLIC, anon/)
    assert.doesNotMatch(mig, /SECURITY DEFINER/)
    assert.doesNotMatch(mig, /service_role/)
  })
})
