// ─────────────────────────────────────────────────────────────────────────────
// BUG CRÍTICO + AUTOMAÇÃO DEFINITIVA DO CICLO
//
// Estes testes não recalculam o ciclo (isso já é coberto por
// cycle-reconciliation.engine.test.ts) — eles travam a ARQUITETURA: garantem,
// lendo o código-fonte real, que toda mutação real de study_history (INSERT,
// UPDATE ou DELETE), não importa a origem, continua chamando o mecanismo
// central único (registerStudyToCycle / registerStudiesToCycleBatch) e nunca
// esconde uma falha de sincronização atrás de um catch silencioso. Sem este
// teste, alguém poderia remover a chamada de sincronização de uma dessas
// funções no futuro e nenhum outro teste perceberia — o bug relatado pelo
// usuário (exclusão no Histórico não sincronizava o ciclo) é exatamente esse
// tipo de regressão silenciosa.
// ─────────────────────────────────────────────────────────────────────────────

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = process.cwd()

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8")
}

/** Extrai o corpo de uma função (declaração `function` ou método de classe
 * `static async nome(`), por balanceamento real de parênteses/chaves — nunca
 * pelo primeiro "{" que aparecer, pois tipos inline nos parâmetros
 * (`feedback: { ... }`) e no tipo de retorno (`Promise<{ ... }>`) têm suas
 * próprias chaves antes do corpo da função sequer começar. */
function extractFunction(source: string, functionName: string): string {
  const defRegex = new RegExp(
    "(?:export\\s+)?(?:default\\s+)?(?:static\\s+)?(?:async\\s+)?function\\s+" +
      functionName +
      "\\s*\\(|(?:static\\s+)?async\\s+" +
      functionName +
      "\\s*\\(",
  )
  const match = defRegex.exec(source)
  assert.notEqual(match, null, `função ${functionName} não encontrada no arquivo`)
  const start = (match as RegExpExecArray).index
  const parenStart = source.indexOf("(", start)
  assert.notEqual(parenStart, -1, `lista de parâmetros de ${functionName} não encontrada`)

  // 1) Balanceia parênteses para achar o fim da lista de parâmetros — chaves
  // de tipos inline nos parâmetros não afetam essa contagem.
  let parenDepth = 0
  let i = parenStart
  for (; i < source.length; i++) {
    if (source[i] === "(") parenDepth++
    else if (source[i] === ")") {
      parenDepth--
      if (parenDepth === 0) {
        i++
        break
      }
    }
  }

  // 2) Entre o fim dos parâmetros e o corpo real pode haver uma anotação de
  // tipo de retorno (`: Promise<{ ... }>`). Rastreia profundidade de `<>`
  // para pular chaves que estejam DENTRO de um genérico — a chave do corpo
  // da função é a primeira que aparece fora de qualquer `<...>`.
  let angleDepth = 0
  let braceStart = -1
  for (; i < source.length; i++) {
    if (source[i] === "<") angleDepth++
    else if (source[i] === ">") angleDepth = Math.max(0, angleDepth - 1)
    else if (source[i] === "{" && angleDepth === 0) {
      braceStart = i
      break
    }
  }
  assert.notEqual(braceStart, -1, `corpo de ${functionName} não encontrado`)

  // 3) Balanceia chaves a partir do corpo real para achar o fechamento.
  let depth = 0
  let j = braceStart
  for (; j < source.length; j++) {
    if (source[j] === "{") depth++
    else if (source[j] === "}") {
      depth--
      if (depth === 0) {
        j++
        break
      }
    }
  }
  return source.slice(start, j)
}

/** Só nos importa um catch silencioso quando ele esconde especificamente o
 * resultado da sincronização do ciclo — outras chamadas best-effort no mesmo
 * corpo (ex.: reconcileWeeklyPlan) são de outro subsistema e não violam a
 * Parte 9, que fala em "erro crítico do ciclo". Por isso a checagem olha só a
 * janela de código logo após a chamada de sincronização do ciclo. */
function assertCycleSyncNotSilentlyCaught(body: string, callName: string, label: string) {
  const callIndex = body.indexOf(`${callName}(`)
  assert.notEqual(callIndex, -1, `${label} não encontrou a chamada de ${callName}`)
  const window = body.slice(callIndex, callIndex + 200)
  assert.equal(
    /\.catch\(/.test(window),
    false,
    `${label} não pode esconder a falha de ${callName}() atrás de um .catch() silencioso (Parte 9) — o resultado precisa ser verificado (result.success) e o erro propagado`,
  )
}

// ── study-history.actions.ts: todo mutador real de study_history precisa
// chamar registerStudyToCycle() e nunca engolir o erro de sincronização. ────
const studyHistoryActions = readSource("src/application/study-history/study-history.actions.ts")

for (const fn of [
  "startStudySessionAction",
  "finishStudySessionAction",
  "updateStudySessionAction",
  "deleteStudySessionAction",
  "cancelStudySessionAction",
  "saveManualStudyTimeAction",
  "deleteManualStudyTimeAction",
]) {
  test(`study-history.actions.ts: ${fn} sincroniza o ciclo automaticamente`, () => {
    const body = extractFunction(studyHistoryActions, fn)
    assert.match(
      body,
      /registerStudyToCycle\(/,
      `${fn} precisa chamar registerStudyToCycle() após mutar study_history (Parte 4/5)`,
    )
    assertCycleSyncNotSilentlyCaught(body, "registerStudyToCycle", fn)
  })
}

// ── import-history.actions.ts: import em lote e exclusão de importações
// (única e "excluir tudo") também precisam do rebuild central. ─────────────
const importActions = readSource("src/application/import-history/import-history.actions.ts")

for (const fn of ["importHistoryChunkAction", "deleteImportBatchAction", "deleteAllImportedAction"]) {
  test(`import-history.actions.ts: ${fn} sincroniza o ciclo automaticamente`, () => {
    const body = extractFunction(importActions, fn)
    assert.match(
      body,
      /registerStudiesToCycleBatch\(/,
      `${fn} precisa chamar registerStudiesToCycleBatch() após mutar study_history (Parte 12)`,
    )
    assertCycleSyncNotSilentlyCaught(body, "registerStudiesToCycleBatch", fn)
  })
}

// ── Revisões (FSRS) inserem em study_history ao finalizar e não podem
// depender de Recalcular (Parte 13). ────────────────────────────────────────
test("review.service.ts: finalizeSession sincroniza o ciclo automaticamente", () => {
  const source = readSource("src/application/review-engine/review.service.ts")
  const body = extractFunction(source, "finalizeSession")
  assert.match(body, /registerStudyToCycle\(/)
  assertCycleSyncNotSilentlyCaught(body, "registerStudyToCycle", "finalizeSession")
})

// ── Cronômetro/registro manual via "Centro Inteligente de Estudos". ────────
test("study-session.action.ts: saveStudySessionAction sincroniza o ciclo automaticamente", () => {
  const source = readSource("src/application/study-session/study-session.action.ts")
  const body = extractFunction(source, "saveStudySessionAction")
  assert.match(body, /registerStudyToCycle\(/)
  assertCycleSyncNotSilentlyCaught(body, "registerStudyToCycle", "saveStudySessionAction")
})

// ── SessionOrchestrator: ponto único de finalização de sessão do fluxo
// "inteligente" — falha de ciclo deve propagar (throw), nunca ser escondida.
test("session-orchestrator.ts: finalizeSession sincroniza o ciclo e propaga falhas", () => {
  const source = readSource("src/application/study-session/session-orchestrator.ts")
  const body = extractFunction(source, "finalizeSession")
  assert.match(body, /registerStudyToCycle\(/)
  assert.match(
    body,
    /if\s*\(\s*!cycleResult\.success\s*\)\s*\{\s*throw/,
    "finalizeSession precisa propagar (throw) uma falha de sincronização do ciclo, nunca escondê-la",
  )
})

// ── O motor de reconciliação continua sendo a única autoridade: nenhuma
// função paralela de soma/subtração incremental deve existir (Parte 8/19). ──
test("cycle-study-registration.service.ts: não existem funções paralelas de soma/subtração incremental", () => {
  const source = readSource("src/application/study-cycle/cycle-study-registration.service.ts")
  assert.equal(/function\s+(add|delete|subtract|increment|decrement)CycleProgress/i.test(source), false)
})

// ── O botão "Recalcular" só pode desaparecer da UI depois de comprovado que
// a sincronização automática funciona; a FUNÇÃO de reconciliação central
// precisa continuar existindo para recuperação/manutenção (Parte 11). ──────
test("cycle-study-registration.service.ts: rebuildActiveCycleProgress continua exportada para uso administrativo/recovery", () => {
  const source = readSource("src/application/study-cycle/cycle-study-registration.service.ts")
  assert.match(source, /export\s+(async\s+)?function\s+rebuildActiveCycleProgress/)
})
