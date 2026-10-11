import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { FakeMentorLLMProvider } from "@/lib/testing/fake-mentor-llm-provider"
import { PILOT_NOW, pilotScenario } from "@/lib/testing/mentor-pilot-scenarios"
import { must } from "@/lib/testing/must"

import { generateMentorAnalysis, getMentorLLMMetrics, MentorAnalysisMemoryStore, type MentorLLMLogEvent } from "./mentor-analysis.service"
import type { MentorRejection } from "./mentor-ai-response.validator"
import {
  classifyOutcome,
  classifyRejection,
  compareVersions,
  percentile,
  pilotDecision,
  summarizeVersion,
  type PilotCallRow,
} from "./mentor-pilot-report"

// G2.19 — análise do piloto (determinística) e preparação do piloto real. Sem chamada real.

function row(over: Partial<PilotCallRow>): PilotCallRow {
  return {
    scenario: "high", promptVersion: "mentor-v2", status: "OK", failReason: null, outcome: "success", cached: false, providerMs: 1000,
    validationMs: 2, inputTokens: null, outputTokens: null, costUsd: null, rejections: [], assessment: null, ...over,
  }
}
const rej = (code: MentorRejection["code"], field = "summary", message = "x"): MentorRejection => ({ code, field, message })

describe("G2.19 — classificação das rejeições (categorias da diretiva)", () => {
  const cases: [MentorRejection, string][] = [
    [rej("NUMBER"), "NUMBER_OUTPUT"],
    [rej("DATE"), "NUMBER_OUTPUT"],
    [rej("QUANTITY"), "NUMBER_OUTPUT"],
    [rej("SCHEMA", "confidence", "invalid_value"), "INVALID_SCHEMA"],
    [rej("CAUSALITY"), "CAUSALITY"],
    [rej("SUSPICIOUS_CONTENT"), "PROMPT_INJECTION"],
    [rej("PRETEND_ACTION"), "PROMPT_INJECTION"],
    [rej("INVISIBLE_CHARS"), "PROMPT_INJECTION"],
    [rej("DISCIPLINE_MISMATCH", "attentionPoints.0"), "UNSUPPORTED_DISCIPLINE"],
    [rej("REF_OUT_OF_BLOCK", "highlights.0", "disciplina D3 não pertence a este bloco"), "UNSUPPORTED_DISCIPLINE"],
    [rej("EVIDENCE_MISMATCH", "recommendations.0"), "INVALID_EVIDENCE"],
    [rej("REF_UNKNOWN", "recommendations.0", "evidenceId inexistente (I88)"), "INVALID_EVIDENCE"],
    [rej("REF_DUPLICATE", "recommendations.0.evidenceIds", "referência repetida (R1)"), "INVALID_EVIDENCE"],
    [rej("REF_UNKNOWN", "recommendations.0", "candidateId inexistente (R40)"), "INVALID_RECOMMENDATION"],
    [rej("REF_DUPLICATE", "recommendations.candidateId", "referência repetida (R1)"), "INVALID_RECOMMENDATION"],
    [rej("REF_UNKNOWN", "attentionPoints.0", "disciplineRef inexistente (D9)"), "UNSUPPORTED_DISCIPLINE"],
    [rej("REF_UNKNOWN", "highlights.0", "insightRef inexistente (I77)"), "INVALID_REFERENCE"],
    [rej("REF_MALFORMED", "summary", "referência alterada (D01)"), "UNSUPPORTED_DISCIPLINE"],
    [rej("REF_AS_NUMBER", "summary", "referência usada como número (I2)"), "INVALID_REFERENCE"],
    [rej("CONTRADICTS_FACT"), "OTHER"],
    [rej("NO_DATA_CLAIM"), "OTHER"],
    [rej("CONFIDENCE", "confidence"), "OTHER"],
  ]
  for (const [r, expected] of cases) {
    it(`${r.code} (${r.message}) → ${expected}`, () => assert.equal(classifyRejection(r), expected))
  }
  it("desfechos sem validador: truncated → TRUNCATED, invalid_json → INVALID_SCHEMA, low_value → OTHER", () => {
    assert.equal(classifyOutcome("truncated"), "TRUNCATED")
    assert.equal(classifyOutcome("invalid_json"), "INVALID_SCHEMA")
    assert.equal(classifyOutcome("low_value"), "OTHER")
    assert.equal(classifyOutcome("success"), null)
  })
})

describe("G2.19 — métricas por versão (null quando não há dado)", () => {
  it("percentis só com amostras suficientes", () => {
    assert.equal(percentile([5, 1], 50, 3), null)
    assert.equal(percentile([300, 100, 200], 50, 3), 200)
    assert.equal(percentile(Array.from({ length: 20 }, (_, i) => (i + 1) * 100), 95, 20), 1900)
    assert.equal(percentile(Array.from({ length: 19 }, (_, i) => i), 95, 20), null)
  })

  it("resumo: chamadas, sucesso, rejeição, cache, teto, latência, tokens e custo", () => {
    const rows = [
      row({ scenario: "a", providerMs: 1000, inputTokens: 900, outputTokens: 300, costUsd: 0.001 }),
      row({ scenario: "b", providerMs: 3000, status: "FAILED", failReason: "INVALID_RESPONSE", outcome: "rejected", rejections: [rej("NUMBER"), rej("CAUSALITY")] }),
      row({ scenario: "c", providerMs: 2000, status: "FAILED", failReason: "INVALID_RESPONSE", outcome: "truncated" }),
      row({ scenario: "d", providerMs: 15000, status: "FAILED", failReason: "TIMEOUT", outcome: "timeout", validationMs: null }),
      row({ scenario: "a", cached: true, providerMs: null, outcome: "cache_hit" }),
      row({ scenario: "e", status: "SKIPPED_BUDGET", providerMs: null, outcome: null }),
      row({ scenario: "a", promptVersion: "mentor-v1" }),
    ]
    const s = summarizeVersion(rows, "mentor-v2")
    assert.equal(s.providerCalls, 4)
    assert.equal(s.success, 1)
    assert.equal(s.failures, 3)
    assert.equal(s.timeouts, 1)
    assert.equal(s.rejected, 2)
    assert.equal(s.rejectionRate, 0.667, "rejeitadas / respondidas (timeout não conta)")
    assert.equal(s.cacheHits, 1)
    assert.equal(s.skippedBudget, 1)
    assert.equal(s.latencyAvgMs, 5250)
    assert.equal(s.latencyP50Ms, 2000)
    assert.equal(s.latencyP95Ms, null, "poucas amostras")
    assert.equal(s.inputTokensAvg, 900)
    assert.equal(s.costTotalUsd, 0.001)
    assert.deepEqual(s.rejectionsByCategory, { NUMBER_OUTPUT: 1, CAUSALITY: 1, TRUNCATED: 1 })
    const empty = summarizeVersion([], "mentor-v1")
    assert.equal(empty.rejectionRate, null)
    assert.equal(empty.latencyAvgMs, null)
    assert.equal(empty.inputTokensAvg, null)
    assert.equal(empty.costTotalUsd, null, "sem preço configurado → null, nunca 0 inventado")
  })
})

describe("G2.19 — tabela v1 × v2 e decisão", () => {
  const ok = (v: string, scenario: string, over: Partial<PilotCallRow> = {}) => row({ promptVersion: v, scenario, ...over })
  const fail = (v: string, scenario: string) => row({ promptVersion: v, scenario, status: "FAILED", failReason: "INVALID_RESPONSE", outcome: "rejected", rejections: [rej("NUMBER")] })
  const scores = (spec: number) => ({ flags: [], scores: { FAITHFULNESS: 1, NON_CAUSALITY: 1, DATA_GROUNDING: 1, SPECIFICITY: spec, ACTIONABILITY: 1, UNCERTAINTY_HANDLING: 1, CLARITY: 1, USEFULNESS: null } })

  it("segurança primeiro: a versão rejeitada perde; ambas falhando empatam; teto → sem dados", () => {
    const t = compareVersions([
      ok("mentor-v1", "a"), fail("mentor-v2", "a"),
      fail("mentor-v1", "b"), ok("mentor-v2", "b"),
      fail("mentor-v1", "c"), fail("mentor-v2", "c"),
      ok("mentor-v1", "d"), row({ promptVersion: "mentor-v2", scenario: "d", status: "SKIPPED_BUDGET", providerMs: null }),
    ])
    assert.deepEqual(t.map((x) => x.winner), ["mentor-v1", "mentor-v2", "empate", "sem dados"])
    assert.match(must(t[0]).v2, /NUMBER_OUTPUT/)
  })

  it("ambas OK: qualidade heurística decide; depois latência (só com diferença real); depois tokens", () => {
    const q = compareVersions([ok("mentor-v1", "q", { assessment: scores(0.5) }), ok("mentor-v2", "q", { assessment: scores(1) })])
    assert.equal(must(q[0]).winner, "mentor-v2")
    const noise = compareVersions([ok("mentor-v1", "n", { providerMs: 2 }), ok("mentor-v2", "n", { providerMs: 0 })])
    assert.equal(must(noise[0]).winner, "empate", "diferença de milissegundos não decide")
    const lat = compareVersions([ok("mentor-v1", "l", { providerMs: 4000 }), ok("mentor-v2", "l", { providerMs: 2000 })])
    assert.equal(must(lat[0]).winner, "mentor-v2")
    const tok = compareVersions([ok("mentor-v1", "t", { inputTokens: 1000, outputTokens: 200 }), ok("mentor-v2", "t", { inputTokens: 2000, outputTokens: 200 })])
    assert.equal(must(tok[0]).winner, "mentor-v1")
  })

  it("decisão: sem chamadas → indefinida; v2 rejeitando muito mais → rever; equivalentes → manter v2", () => {
    const none = summarizeVersion([], "mentor-v1")
    assert.equal(pilotDecision(none, none, []).keepV2, null)
    const v1 = summarizeVersion([ok("mentor-v1", "a"), ok("mentor-v1", "b"), ok("mentor-v1", "c")], "mentor-v1")
    const v2bad = summarizeVersion([fail("mentor-v2", "a"), fail("mentor-v2", "b"), ok("mentor-v2", "c")], "mentor-v2")
    assert.equal(pilotDecision(v1, v2bad, []).keepV2, false)
    const v2 = summarizeVersion([ok("mentor-v2", "a"), ok("mentor-v2", "b"), ok("mentor-v2", "c")], "mentor-v2")
    assert.equal(pilotDecision(v1, v2, []).keepV2, true)
  })
})

describe("G2.19 — tempos separados e rejeição estruturada no serviço", () => {
  const CFG = { timeoutMs: 1000, maxOutputTokens: 500, maxCallsPerHour: 100, maxCallsPerDay: 100, maxCallsPerDayGlobal: 1000, pricing: null }
  it("validationMs vai no log (separado de durationMs do provedor e de contextMs) e soma nas métricas", async () => {
    const logs: MentorLLMLogEvent[] = []
    const before = getMentorLLMMetrics().validationSamples
    const provider = new FakeMentorLLMProvider([FakeMentorLLMProvider.scenario("VALID_RESPONSE")])
    await generateMentorAnalysis("u", pilotScenario("high").build(), {
      provider, config: CFG, store: new MentorAnalysisMemoryStore(), now: () => PILOT_NOW.getTime(), log: (e) => logs.push(e), contextMs: 42,
    })
    const ev = must(logs[0])
    assert.equal(ev.outcome, "success")
    assert.equal(typeof ev.validationMs, "number")
    assert.equal(ev.contextMs, 42)
    assert.equal(ev.durationMs, 0, "relógio injetado: provedor medido à parte")
    assert.equal(getMentorLLMMetrics().validationSamples, before + 1)
  })

  it("onRejected recebe as rejeições estruturadas (código + campo), sem o texto da resposta", async () => {
    let got: MentorRejection[] = []
    const provider = new FakeMentorLLMProvider([FakeMentorLLMProvider.scenario("INVENTED_NUMBER")])
    await generateMentorAnalysis("u", pilotScenario("high").build(), {
      provider, config: CFG, store: new MentorAnalysisMemoryStore(), onRejected: (_r, rj) => { got = rj ?? [] },
    })
    assert.ok(got.some((r) => r.code === "NUMBER" && r.field === "summary"))
    assert.doesNotMatch(JSON.stringify(got), /72|14h20/)
  })
})

describe("G2.19 — script do piloto preparado para o real", () => {
  const script = readFileSync("scripts/mentor-ai-pilot.ts", "utf8")
  it("--check confere a configuração sem mostrar valores; real sem configuração não chama nada", () => {
    assert.match(script, /process\.argv\.includes\("--check"\)/)
    assert.match(script, /\$\{present \? "definido" : "ausente"\}/)
    assert.doesNotMatch(script, /out\([^)]*process\.env\[/, "nunca imprime valor de variável")
    assert.match(script, /piloto real cancelado — configuração incompleta/)
  })
  it("v1 e v2 intercaladas por cenário (cobertura igual se o teto acabar); teto não vira erro do provedor", () => {
    assert.match(script, /for \(const s of PILOT_SCENARIOS\) \{\n\s+const ctx = s\.build\(\)\n\s+for \(const version of versions\) await run\("cenario"/)
    assert.match(script, /SKIPPED_BUDGET/)
    assert.match(script, /const HARD_MAX_CALLS = 30/)
  })
  it("relatório traz resumo por versão, tabela v1 × v2 e decisão marcada como provisória/ensaio", () => {
    assert.match(script, /summarizeVersion/)
    assert.match(script, /compareVersions/)
    assert.match(script, /pilotDecision/)
    assert.match(script, /\| Caso \| V1 \| V2 \| Vencedor \| Motivo \|/)
    assert.match(script, /ENSAIO — não vale como evidência/)
  })
})
