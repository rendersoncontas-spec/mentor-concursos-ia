import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" (verificacao estatica do codigo-fonte) para a trava de
 * idempotencia (compare-and-swap) de finalizeSession, adicionada no QA
 * funcional de 2026-09.
 *
 * Contexto do bug encontrado: finalizeSession() lia o status da sessao de
 * revisao (SELECT) e, se "ACTIVE", atualizava para "COMPLETED" (UPDATE) em
 * dois passos separados e nao-atomicos. finalizeSession pode ser chamada
 * duas vezes quase ao mesmo tempo para a MESMA sessao - pelo auto-finalize
 * ao responder o ultimo card (answerReviewCard) e/ou pelo botao explicito
 * "finalizar" (finalizeReviewSessionAction), inclusive de duas abas
 * diferentes (clicar "finalizar" numa aba no exato momento em que a outra
 * aba processa a resposta do ultimo card). As duas chamadas liam status
 * ACTIVE antes de qualquer UPDATE comitar, as duas passavam pela guarda, e
 * as duas inseriam uma linha em study_history para a mesma sessao de
 * revisao - duplicando o tempo de estudo no Historico/Estatisticas/Ciclo.
 * A correcao usa o proprio UPDATE como trava: adiciona .eq("status",
 * "ACTIVE") a condicao do UPDATE e verifica se alguma linha realmente foi
 * afetada antes de prosseguir - a segunda chamada concorrente nao encontra
 * nenhuma linha ACTIVE para atualizar e retorna sem duplicar nada.
 *
 * Por que teste estatico e nao de integracao: projeto nao tem infra de
 * teste com Supabase real (nem transacoes/duas conexoes concorrentes
 * simulaveis) - mesmo motivo documentado em
 * study-provider-context-split.wiring.test.ts.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

const SERVICE_PATH = "src/application/review-engine/review.service.ts"

function extractFinalizeSessionBody(source: string): string {
  const start = source.indexOf("export async function finalizeSession")
  assert.ok(start !== -1, "finalizeSession deve existir")
  const end = source.indexOf("\nexport async function", start + 1)
  return source.slice(start, end === -1 ? source.length : end)
}

describe("finalizeSession: trava de idempotencia via UPDATE condicional (compare-and-swap)", () => {
  it("o UPDATE de status inclui .eq(\"status\", \"ACTIVE\") como condicao (nao so id/user_id)", () => {
    const source = readSource(SERVICE_PATH)
    const body = extractFinalizeSessionBody(source)

    const updateStart = body.indexOf('.update({ status: "COMPLETED"')
    assert.ok(updateStart !== -1, "deve existir o UPDATE de status para COMPLETED")
    const updateChain = body.slice(updateStart, updateStart + 400)

    assert.ok(updateChain.includes('.eq("status", "ACTIVE")'), 'o UPDATE deve incluir .eq("status", "ACTIVE") para so afetar uma sessao ainda ativa')
  })

  it("verifica se o UPDATE realmente afetou uma linha antes de prosseguir (select + checagem de null)", () => {
    const source = readSource(SERVICE_PATH)
    const body = extractFinalizeSessionBody(source)

    const updateStart = body.indexOf('.update({ status: "COMPLETED"')
    const updateChain = body.slice(updateStart, updateStart + 400)
    assert.ok(/\.select\(("id"|'id')\)/.test(updateChain), "o UPDATE deve pedir .select(\"id\") de volta para saber se afetou alguma linha")
    assert.ok(updateChain.includes(".maybeSingle()"), "deve usar .maybeSingle() para obter null quando nenhuma linha foi afetada")

    assert.ok(
      /if\s*\(!claimedSession\)\s*return\s*\{\s*cycleSyncError:\s*null\s*\}/.test(body),
      "deve retornar cedo, sem duplicar o insert em study_history, quando nenhuma linha foi afetada (outra chamada ja finalizou a sessao)",
    )
  })

  it("so grava study_history/reconcilia o ciclo DEPOIS de confirmar que esta chamada venceu a corrida", () => {
    const source = readSource(SERVICE_PATH)
    const body = extractFinalizeSessionBody(source)

    const guardIdx = body.indexOf("if (!claimedSession) return")
    const historyInsertIdx = body.indexOf('supabase.from("study_history").insert(')
    assert.ok(guardIdx !== -1 && historyInsertIdx !== -1, "ambos devem existir")
    assert.ok(guardIdx < historyInsertIdx, "a guarda de idempotencia deve vir ANTES do insert em study_history")
  })
})
