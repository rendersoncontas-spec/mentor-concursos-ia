import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

/**
 * G2.3 — experiência de estudo diário: plano do dia → sessão → progresso.
 *
 * Comportamento real testado onde é puro (pending offline, resolução de
 * tempos); fiação travada por wiring onde há runtime Next/DOM (padrão do
 * repo). Decisões documentadas sem teste: minutos interrompidos contam como
 * tempo estudado (semântica canônica), ordem alfabética das sugestões do
 * plano (contrato pinado), Pass-2 de atribuição livre (intencional).
 */

import { buildPendingStudySession } from "@/infrastructure/offline/pending-study-session"

function readSource(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), "utf-8")
}

describe("G2.3 — dwell da avaliação não infla o salvo (offline placeholder)", () => {
  const HOUR = 3600_000
  const start = Date.now() - HOUR

  function payload(evalStart: number | null) {
    return {
      discipline_id: "d1",
      discipline_name: "Direito Penal",
      studyType: "TEORIA",
      study_source: "FREE",
      sessionStartTime: start,
      sessionTotalPausedMs: 600_000,
      sessionLastPauseStartTime: start + 3000_000,
      planned_minutes: 60,
      ...(evalStart === null ? {} : { evaluation_started_at: evalStart }),
    }
  }

  it("com Encerrar há 10min: pausa exclui o dwell, ativo idêntico", () => {
    const evalStart = start + 3000_000 // pausou aos 50min, avaliou 10min
    const frozen = buildPendingStudySession(payload(evalStart), "op-f", "u1")
    const drifting = buildPendingStudySession(payload(null), "op-f", "u1")
    assert.ok(
      (frozen.paused_minutes ?? 0) < (drifting.paused_minutes ?? 0),
      "placeholder congelado pausa menos que o à deriva",
    )
    assert.equal(frozen.active_minutes, drifting.active_minutes, "ativo não muda com dwell")
    assert.equal(frozen.finished_at, new Date(evalStart).toISOString(), "fim = Encerrar, não save")
  })

  it("Encerrar futuro/inválido cai no agora (sem finished_at no futuro)", () => {
    const bad = buildPendingStudySession(payload(Date.now() + 600_000), "op-b", "u1")
    assert.ok(new Date(bad.finished_at as string).getTime() <= Date.now() + 1000)
    const old = buildPendingStudySession(payload(start - 1000), "op-o", "u1")
    assert.ok(new Date(old.finished_at as string).getTime() <= Date.now() + 1000)
  })
})

describe("G2.3 — entrada do estudo nunca cai em tela vazia silenciosa (wiring)", () => {
  it("page resolve bloco diário → item e redireciona id inválido", () => {
    const source = readSource("src/app/(protected)/dashboard/study-session/page.tsx")
    assert.ok(source.includes('from("study_plan_daily_blocks")'), "fallback bloco diário → item")
    assert.ok(source.includes(".maybeSingle()"), "sem throw em miss (era .single())")
    assert.ok(source.includes('redirect("/planejamento")'), "id fantasma volta ao planejamento")
  })

  it("planning-view: linha manual vira estudo livre honesto", () => {
    const source = readSource("src/features/planejamento/components/planning-view.tsx")
    assert.ok(source.includes("study-session?disciplineId="), "sintético + disciplina = FREE")
    assert.ok(source.includes("isUuid(block.id)"), "só UUID vira planId")
  })

  it("central de estudos atualiza sugestão após salvar (fim do stale 5min)", () => {
    const source = readSource("src/features/study-session/hooks/use-discipline-data.ts")
    assert.ok(source.includes("STUDY_SESSION_SAVED_EVENT"), "escuta o evento canônico")
    assert.ok(source.includes("void load(true)"), "força refresh (dado nunca é server-backed)")
  })
})

describe("G2.3 — dia/plantão e recovery da avaliação (wiring)", () => {
  it("plantão tem estado próprio na visão diária", () => {
    const source = readSource("src/features/planejamento/components/daily-planning-view.tsx")
    assert.ok(source.includes("isDutyDay"), "plantão distinguido do dia livre")
    assert.ok(source.includes("Dia de plantão"), "copy explícita de plantão")
  })

  it("runner congela fim + persiste respostas (reload no meio da avaliação)", () => {
    const source = readSource("src/features/study-session/components/active-session-runner.tsx")
    assert.ok(source.includes("evaluationStartedAtRef"), "instante do Encerrar")
    assert.ok(source.includes("evaluation_started_at: evalStart"), "vai ao payload")
    assert.ok(source.includes("nomeia_eval_inputs"), "respostas sobrevivem a reload")
    assert.ok(source.includes("EVAL_INPUTS_TTL_MS"), "sem ressurreição de outra sessão")
  })

  it("provider/action/pending honram o congelamento", () => {
    const provider = readSource("src/features/study-session/components/study-provider.tsx")
    assert.ok(provider.includes("dwellAwarePausedSeconds"), "snapshot exclui dwell")
    assert.ok(provider.includes("evaluation_started_at"), "campo viaja no payload")
    const action = readSource("src/application/study-session/study-session.action.ts")
    assert.ok(action.includes("evaluationStartedAt"), "servidor congela finished_at/pausa")
    const pending = readSource("src/infrastructure/offline/pending-study-session.ts")
    assert.ok(pending.includes("resolveEndTimeMs"), "placeholder offline congela também")
  })
})
