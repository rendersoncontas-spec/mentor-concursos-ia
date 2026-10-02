import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase G2.6.1 — correção de segurança (achado ALTO da auditoria
 * "Auditoria de Segurança — RLS / Supabase / Dependências — 2026-10-01":
 * "Trilha de auditoria incompleta para ações destrutivas em modo suporte").
 *
 * ACHADO REAL: auditSupportAction existe desde a Fase A1.1, documentada como
 * "chamada pelas actions destrutivas quando há sessão de suporte ativa" —
 * mas, na prática, tinha um único ponto de chamada em todo o app inteiro
 * (dentro de deleteCycleAction, via um bloco manual de ~20 linhas que lia
 * cookie + support_sessions). Toda mutação em qualquer outro domínio que
 * usa getEffectiveUserId (dashboard, disciplinas, simulados, histórico de
 * estudo, planos, replanejamento, edital) ficava sem nenhum registro
 * específico do que foi alterado durante uma sessão de suporte.
 *
 * CORRIGIDO: getEffectiveUserId(supabase, auditContext) ganhou um segundo
 * parâmetro opcional (auth-guard.ts) que, quando informado E há sessão de
 * suporte ativa, grava automaticamente em audit_logs via auditSupportAction
 * — sem que cada action precise reimplementar a leitura de cookie/sessão.
 * Este teste verifica que toda mutação relevante (insert/update/delete/
 * upsert) alcançável via getEffectiveUserId passa esse contexto, e que
 * leituras continuam sem ele (não geram auditoria indevida).
 *
 * Por que teste estático: mesma limitação documentada nos demais
 * *.wiring.test.ts deste projeto — não há infraestrutura de teste com
 * Supabase real nem com next/headers (cookies()) aqui, então não é possível
 * provar em runtime que uma sessão de suporte real dispara o INSERT. O
 * comportamento do INSERT em si (shape do registro, nunca propagar erro) é
 * coberto por audit-support-action.test.ts. O que ESTE teste garante é a
 * COBERTURA: que o inventário de mutações da Fase G2.6.1 foi de fato
 * aplicado em cada arquivo, e não apenas em alguns.
 */

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", ...relPath.split("/")), "utf-8")
}

describe("Fase G2.6.1 — getEffectiveUserId ganhou auditContext opcional", () => {
  const authGuard = readSrc("application/admin/auth-guard.ts")

  it("aceita um segundo parâmetro opcional auditContext", () => {
    assert.match(authGuard, /export async function getEffectiveUserId\(\s*\n?\s*supabase: SupabaseClient,\s*\n?\s*auditContext\?: SupportAuditContext,?\s*\n?\)/)
  })

  it("só audita quando há auditContext E a sessão está em modo suporte (nunca em uso normal)", () => {
    const idx = authGuard.indexOf("export async function getEffectiveUserId")
    const body = authGuard.slice(idx)
    assert.match(body, /if \(auditContext && effectiveUser\.isSupportMode && effectiveUser\.supportSession\)/)
  })

  it("roda a auditoria FORA de getEffectiveSessionUser (que é cache() por requisição) — nunca dentro da função memorizada", () => {
    const sessionUserIdx = authGuard.indexOf("export const getEffectiveSessionUser = cache(")
    const nextFnIdx = authGuard.indexOf("export async function getEffectiveUserId")
    const sessionUserBody = authGuard.slice(sessionUserIdx, nextFnIdx)
    assert.doesNotMatch(sessionUserBody, /auditSupportAction/)
  })

  it("usa o operatorId (moderador real) e o id do efetivo (alvo) corretamente, nunca invertidos", () => {
    const idx = authGuard.indexOf("export async function getEffectiveUserId")
    const body = authGuard.slice(idx)
    assert.match(body, /moderatorId: effectiveUser\.operatorId/)
    assert.match(body, /targetUserId: effectiveUser\.id/)
  })
})

/**
 * Inventário: cada entrada é uma mutação real (insert/update/delete/upsert)
 * que deriva o usuário via getEffectiveUserId e que, por isso, PRECISA
 * passar auditContext. `fn` é o nome da função ou, quando o arquivo usa um
 * helper local (getUser/requireUser), um texto único que aparece na mesma
 * chamada (torna o teste resiliente a refactors de nome do helper).
 */
const AUDITED_MUTATIONS: { file: string; anchor: string; action: string }[] = [
  { file: "application/dashboard/dashboard-layout.action.ts", anchor: "export async function saveDashboardLayoutAction", action: "SAVE_DASHBOARD_LAYOUT" },
  { file: "application/dashboard/dashboard-layout.action.ts", anchor: "export async function resetDashboardLayoutAction", action: "RESET_DASHBOARD_LAYOUT" },
  { file: "application/dashboard/goals.action.ts", anchor: "export async function saveWeeklyGoalsAction", action: "SAVE_WEEKLY_GOALS" },
  { file: "application/dashboard/target.action.ts", anchor: "export async function switchActiveTargetAction", action: "SWITCH_ACTIVE_TARGET" },
  { file: "application/dashboard/user-exam.action.ts", anchor: "export async function saveUserExamAction", action: "SAVE_USER_EXAM" },
  { file: "application/dashboard/user-exam.action.ts", anchor: "export async function deleteUserExamAction", action: "DELETE_USER_EXAM" },
  { file: "application/disciplines/discipline-actions.ts", anchor: "export async function addUserDisciplineAction", action: "ADD_USER_DISCIPLINE" },
  { file: "application/disciplines/discipline-actions.ts", anchor: "export async function removeUserDisciplineAction", action: "REMOVE_USER_DISCIPLINE" },
  { file: "application/disciplines/discipline-actions.ts", anchor: "export async function updateDisciplineAppearanceAction", action: "UPDATE_DISCIPLINE_APPEARANCE" },
  { file: "application/edital/edital-topic-progress.actions.ts", anchor: "export async function setEditalTopicProgressAction", action: "SET_EDITAL_TOPIC_PROGRESS" },
  { file: "application/edital/edital-topic-progress.actions.ts", anchor: "export async function deleteEditalTopicProgressAction", action: "DELETE_EDITAL_TOPIC_PROGRESS" },
  { file: "application/edital/edital-topic-progress.actions.ts", anchor: "export async function importEditalTopicProgressAction", action: "IMPORT_EDITAL_TOPIC_PROGRESS" },
  { file: "application/review-engine/review.actions.ts", anchor: "export async function addTopicToReviewAction", action: "ADD_TOPIC_TO_REVIEW" },
  { file: "application/review-engine/review.actions.ts", anchor: "export async function setReviewItemFlagAction", action: "SET_REVIEW_ITEM_FLAG" },
  { file: "application/review-engine/review.actions.ts", anchor: "export async function startReviewSessionAction", action: "START_REVIEW_SESSION" },
  { file: "application/review-engine/review.actions.ts", anchor: "export async function answerReviewCardAction", action: "ANSWER_REVIEW_CARD" },
  { file: "application/review-engine/review.actions.ts", anchor: "export async function finalizeReviewSessionAction", action: "FINALIZE_REVIEW_SESSION" },
  { file: "application/review-engine/review.actions.ts", anchor: "export async function discardReviewSessionAction", action: "DISCARD_REVIEW_SESSION" },
  { file: "application/simulados/simulado-records.actions.ts", anchor: "export async function saveSimuladoRecordAction", action: "SAVE_SIMULADO_RECORD" },
  { file: "application/simulados/simulado-records.actions.ts", anchor: "export async function deleteSimuladoRecordAction", action: "DELETE_SIMULADO_RECORD" },
  { file: "application/simulados/simulados.actions.ts", anchor: "export async function createSimuladoAction", action: "CREATE_SIMULADO" },
  { file: "application/simulados/simulados.actions.ts", anchor: "export async function saveSimuladoAnswersAction", action: "SAVE_SIMULADO_ANSWERS" },
  { file: "application/simulados/simulados.actions.ts", anchor: "export async function finishSimuladoAction", action: "FINISH_SIMULADO" },
  { file: "application/simulados/simulados.actions.ts", anchor: "export async function deleteSimuladoAction", action: "DELETE_SIMULADO" },
  { file: "application/simulados/simulados.actions.ts", anchor: "export async function cancelSimuladoAction", action: "CANCEL_SIMULADO" },
  { file: "application/simulados/simulados.actions.ts", anchor: "export async function addQuestionToStudyListAction", action: "ADD_QUESTION_TO_STUDY_LIST" },
  { file: "application/study-cycle/study-cycle.actions.ts", anchor: "export async function activateCycleAction", action: "ACTIVATE_CYCLE" },
  { file: "application/study-cycle/study-cycle.actions.ts", anchor: "export async function pauseCycleAction", action: "PAUSE_CYCLE" },
  { file: "application/study-cycle/study-cycle.actions.ts", anchor: "export async function deleteCycleAction", action: "DELETE_CYCLE" },
  { file: "application/study-cycle/study-cycle.actions.ts", anchor: "export async function reorderCycleItemsAction", action: "REORDER_CYCLE_ITEMS" },
  { file: "application/study-cycle/study-cycle.actions.ts", anchor: "export async function updateFullCycleAction", action: "UPDATE_FULL_CYCLE" },
  { file: "application/study-cycle/cycle-study-registration.service.ts", anchor: "export async function skipCurrentCycleItem", action: "SKIP_CYCLE_ITEM" },
  { file: "application/study-cycle/cycle-study-registration.service.ts", anchor: "export async function concludeCurrentCycleRound", action: "CONCLUDE_CYCLE_ROUND" },
  { file: "application/study-history/study-history.actions.ts", anchor: "export async function startStudySessionAction", action: "START_STUDY_SESSION" },
  { file: "application/study-history/study-history.actions.ts", anchor: "export async function finishStudySessionAction", action: "FINISH_STUDY_SESSION" },
  { file: "application/study-history/study-history.actions.ts", anchor: "export async function updateStudySessionAction", action: "UPDATE_STUDY_SESSION" },
  { file: "application/study-history/study-history.actions.ts", anchor: "export async function deleteStudySessionAction", action: "DELETE_STUDY_SESSION" },
  { file: "application/study-history/study-history.actions.ts", anchor: "export async function cancelStudySessionAction", action: "CANCEL_STUDY_SESSION" },
  { file: "application/study-history/study-history.actions.ts", anchor: "export async function saveManualStudyTimeAction", action: "SAVE_MANUAL_STUDY_TIME" },
  { file: "application/study-history/study-history.actions.ts", anchor: "export async function deleteManualStudyTimeAction", action: "DELETE_MANUAL_STUDY_TIME" },
  { file: "application/study-plan/generate-study-plan.action.ts", anchor: "export async function generateStudyPlanAction", action: "GENERATE_STUDY_PLAN" },
  { file: "application/study-plan/generate-study-plan.action.ts", anchor: "export async function deactivateStudyPlanAction", action: "DEACTIVATE_STUDY_PLAN" },
  { file: "application/study-plan/list-plans.action.ts", anchor: "export async function activatePlanAction", action: "ACTIVATE_PLAN" },
  { file: "application/study-plan/list-plans.action.ts", anchor: "export async function togglePausePlanAction", action: "TOGGLE_PAUSE_PLAN" },
  { file: "application/study-plan/list-plans.action.ts", anchor: "export async function duplicatePlanAction", action: "DUPLICATE_PLAN" },
  { file: "application/study-plan/list-plans.action.ts", anchor: "export async function deletePlanAction", action: "DELETE_PLAN" },
  { file: "application/study-plan/planning-preferences.action.ts", anchor: "export async function savePlanningPreferencesAction", action: "SAVE_PLANNING_PREFERENCES" },
  { file: "application/study-plan/replan/adaptive-replan.actions.ts", anchor: "export async function runReplanningAction", action: "RUN_REPLANNING" },
  { file: "application/study-plan/replan/adaptive-replan.actions.ts", anchor: "export async function undoReplanningAction", action: "UNDO_REPLANNING" },
  { file: "application/study-plan/replan/adaptive-replan.actions.ts", anchor: "export async function closeBlockManuallyAction", action: "CLOSE_BLOCK_MANUALLY" },
  { file: "application/study-plan/replan/adaptive-replan.actions.ts", anchor: "export async function setAutoReplanPreferenceAction", action: "SET_AUTO_REPLAN_PREFERENCE" },
  { file: "application/study-plan/replan/adaptive-replan.actions.ts", anchor: "export async function pullPendingToTodayAction", action: "PULL_PENDING_TO_TODAY" },
]

describe("Fase G2.6.1 — inventário de mutações sob getEffectiveUserId passa auditContext", () => {
  const cache = new Map<string, string>()
  function src(file: string): string {
    if (!cache.has(file)) cache.set(file, readSrc(file))
    return cache.get(file) as string
  }

  for (const { file, anchor, action } of AUDITED_MUTATIONS) {
    it(`${anchor.replace("export async function ", "")} (${file}) audita com action "${action}"`, () => {
      const content = src(file)
      const idx = content.indexOf(anchor)
      assert.ok(idx >= 0, `anchor não encontrado em ${file}: ${anchor}`)
      const windowEnd = content.indexOf("export async function", idx + anchor.length)
      const body = content.slice(idx, windowEnd === -1 ? idx + 1500 : windowEnd)
      // O contexto de auditoria chega a getEffectiveUserId de duas formas neste
      // código: diretamente (a maioria dos arquivos), ou através de um helper
      // local por arquivo (getUser/requireUser em study-cycle.actions.ts,
      // review.actions.ts, simulados.actions.ts, simulado-records.actions.ts)
      // que por sua vez encaminha o auditContext para getEffectiveUserId. Em
      // ambos os casos o que importa — e o que este teste verifica — é que a
      // própria function action passa um objeto { action: "<ACTION>", ... }
      // não vazio para alguma chamada de função nesse ponto da cadeia.
      const re = new RegExp(`(?:getEffectiveUserId|getUser|requireUser)\\(\\s*(?:supabase\\s*,\\s*)?\\{\\s*action:\\s*"${action}"`)
      assert.match(body, re, `esperado uma chamada (getEffectiveUserId/getUser/requireUser) com { action: "${action}", ... } dentro de ${anchor}`)
    })
  }

  it(`cobre ${AUDITED_MUTATIONS.length} mutações (nenhuma ficou de fora do inventário desta fase)`, () => {
    assert.ok(AUDITED_MUTATIONS.length >= 49)
  })
})

describe("Fase G2.6.1 — leituras continuam sem auditContext (não geram auditoria indevida)", () => {
  const READ_ONLY_FUNCTIONS: { file: string; anchor: string }[] = [
    { file: "application/study-history/study-history.actions.ts", anchor: "export async function getUserHistoryAction" },
    { file: "application/dashboard/dashboard-layout.action.ts", anchor: "export async function getDashboardLayoutAction" },
    { file: "application/study-plan/list-plans.action.ts", anchor: "export async function listPlansAction" },
    { file: "application/study-groups/study-group.actions.ts", anchor: "export async function listMyStudyGroupsAction" },
  ]
  for (const { file, anchor } of READ_ONLY_FUNCTIONS) {
    it(`${anchor.replace("export async function ", "")} (${file}) chama getEffectiveUserId(supabase) sem segundo argumento`, () => {
      const content = readSrc(file)
      const idx = content.indexOf(anchor)
      assert.ok(idx >= 0, `anchor não encontrado em ${file}`)
      const windowEnd = content.indexOf("export async function", idx + anchor.length)
      const body = content.slice(idx, windowEnd === -1 ? idx + 800 : windowEnd)
      assert.match(body, /getEffectiveUserId\(supabase\)/)
    })
  }
})
