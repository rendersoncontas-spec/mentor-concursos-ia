import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { buildStudentMentorContext } from "@/application/mentor/student-context.builder"
import type { SessionRecord } from "@/application/study-analytics/engine/stats-engine"
import { EMPTY_DISCIPLINE_IDENTITY } from "@/domain/disciplines/discipline-identity"
import { MENTOR_PROMPT_VERSION, MentorLLMError } from "@/domain/mentor/mentor-ai"
import type { StudentMentorContext } from "@/domain/mentor/student-mentor-context"
import type { SimuladoRecord, SimuladoRecordSubject } from "@/domain/simulados/types"
import { FakeMentorLLMProvider, type FakeStep } from "@/lib/testing/fake-mentor-llm-provider"
import { must } from "@/lib/testing/must"

import { generateMentorAnalysis, MentorAnalysisMemoryStore, MENTOR_LLM_MAX_ATTEMPTS, type MentorLLMLogEvent } from "./mentor-analysis.service"
import { validateMentorAIResponse } from "./mentor-ai-response.validator"
import { buildMentorLLMInput } from "./mentor-llm-input"
import { resolveMentorLLMConfig } from "./mentor-llm.config"
import { getMentorLLMRuntime, isMentorAIEnabled } from "./mentor-llm.runtime"
import { OpenAICompatibleMentorProvider } from "./openai-compatible.provider"

// G2.16 — Mentor com LLM: tudo com provedor FALSO (nenhuma chamada real).

const NOW = new Date("2026-10-06T15:00:00Z")
const CT = "11111111-1111-4111-8111-111111111111"
const PT = "22222222-2222-4222-8222-222222222222"
let seq = 0

function ses(disciplineId: string, minutes: number, day: string, name: string): SessionRecord {
  seq += 1
  return {
    id: `s${seq}`, disciplineId, disciplineName: name, disciplineArea: null, startedAt: `${day}T15:00:00Z`, finishedAt: null,
    durationMinutes: minutes, activeMinutes: null, pausedMinutes: null, completed: true, interrupted: false, focusScore: null,
    energyLevel: null, difficulty: null, studyType: "TEORIA", studySource: "FREE", pagesRead: 0, questionsAnswered: 0,
    questionsCorrect: 0, flashcardsReviewed: 0, topicName: null, focusPercentage: null, plannedMinutes: null, notes: null, focusSound: null,
  }
}
function subj(id: string, q: number, c: number, name: string): SimuladoRecordSubject {
  return { disciplineId: id, disciplineName: name, questionsCount: q, correctCount: c, wrongCount: q - c, blankCount: 0, accuracy: Math.round((c / q) * 1000) / 10 }
}
function rec(id: string, date: string, subjects: SimuladoRecordSubject[]): SimuladoRecord {
  const q = subjects.reduce((s, x) => s + x.questionsCount, 0)
  const c = subjects.reduce((s, x) => s + x.correctCount, 0)
  return {
    id, userId: "u", name: id, examName: "Concurso secreto", roleName: "", simuladoDate: date, source: "TEC", sourceCustom: null,
    exam_board: null, exam_board_custom: null, totalQuestions: q, totalCorrect: c, totalWrong: q - c, totalBlank: 0,
    accuracy: Math.round((c / q) * 1000) / 10, timeSpentSeconds: null, notes: null, scoringRule: "PERCENTUAL", penaltyScore: null,
    subjects, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`,
  }
}

function contextFor(kind: "empty" | "low" | "full", extraMinutes = 0): StudentMentorContext {
  let sessions: SessionRecord[] = []
  if (kind === "full") {
    sessions = [
      ...Array.from({ length: 10 }, (_, i) => ses(CT, 76 + (i === 0 ? extraMinutes : 0), `2026-10-0${(i % 6) + 1}`, "Contabilidade")),
      ...Array.from({ length: 12 }, (_, i) => ses(PT, 60, `2026-09-${String(10 + i).padStart(2, "0")}`, "Português")),
    ]
  } else if (kind === "low") {
    sessions = [ses(CT, 60, "2026-06-01", "Contabilidade")]
  }
  const simulados =
    kind === "full"
      ? [
          rec("s1", "2026-08-10", [subj(CT, 20, 14, "Contabilidade"), subj(PT, 20, 12, "Português")]),
          rec("s2", "2026-09-10", [subj(CT, 20, 13, "Contabilidade"), subj(PT, 20, 15, "Português")]),
          rec("s3", "2026-10-02", [subj(CT, 20, 11, "Contabilidade"), subj(PT, 20, 16, "Português")]),
        ]
      : []
  return buildStudentMentorContext({
    now: NOW,
    stats: {
      sessions, attempts: [], disciplines: [], userDisciplines: [], reviewItems: [], reviewsCompletedLast30: 0,
      activePlan: null, activePlanError: false, weekStartDay: 1, simulados, identity: EMPTY_DISCIPLINE_IDENTITY,
    },
    cycle: { status: "NO_DATA", overview: null },
    profileGoals: { status: "OK", weeklyStudyHours: kind === "full" ? 15 : null, weeklyQuestionsGoal: 100, weeklyStudyDaysGoal: 6 },
    target: { status: "OK", examName: "Concurso secreto", examDate: "2026-12-20" },
    sources: [],
  })
}

/** Resposta válida montada a partir das referências do próprio pedido. */
function validResponse(ctx: StudentMentorContext, confidence: "high" | "medium" | "low" = "medium") {
  const { input } = buildMentorLLMInput(ctx)
  const i1 = must(input.insights[0]).ref
  const declining = input.insights.find((i) => i.type === "DECLINING_DISCIPLINE")
  const cand = must(input.candidates[0])
  const lowCtx = ctx.contextQuality.level === "LOW" || ctx.contextQuality.level === "EMPTY"
  return {
    summary: lowCtx
      ? "A análise ainda é limitada: há poucos registros para uma leitura completa."
      : "Seu estudo recente está consistente e os simulados mostram pontos fortes e uma matéria que pede cuidado.",
    summaryRefs: [i1],
    highlights: [{ insightRef: i1, kind: "INTERPRETATION", text: "Bom ritmo de estudo na semana." }],
    attentionPoints: declining ? [{ insightRef: declining.ref, disciplineRef: declining.disciplineRef, text: "Vale acompanhar de perto esta matéria." }] : [],
    recommendations: [{ id: "rec-1", candidateId: cand.ref, title: "Acompanhar a matéria em queda", explanation: "Pode ajudar revisar os tópicos com mais erros.", evidenceIds: [cand.ref, i1] }],
    confidence,
    // G2.18 (v2): contexto LOW/EMPTY exige insufficientData.
    insufficientData: lowCtx,
  }
}

const RUNTIME = { timeoutMs: 1000, maxOutputTokens: 500, maxCallsPerHour: 3, maxCallsPerDay: 50, maxCallsPerDayGlobal: 500, pricing: null }

function deps(steps: FakeStep[], store = new MentorAnalysisMemoryStore(), clock = { t: NOW.getTime() }) {
  const provider = new FakeMentorLLMProvider(steps)
  const sleeps: number[] = []
  const logs: MentorLLMLogEvent[] = []
  return {
    provider,
    sleeps,
    logs,
    store,
    d: { provider, config: RUNTIME, store, now: () => clock.t, sleep: async (ms: number) => { sleeps.push(ms) }, log: (e: MentorLLMLogEvent) => logs.push(e) },
  }
}

const FULL = contextFor("full")

describe("configuração e flag", () => {
  it("1. desligado por padrão: sem env não há provedor e nada é chamado", async () => {
    assert.equal(getMentorLLMRuntime({}), null)
    assert.equal(isMentorAIEnabled({}), false)
    const r = await generateMentorAnalysis("u1", FULL, { provider: null, config: null, store: new MentorAnalysisMemoryStore() })
    assert.equal(r.status, "DISABLED")
  })

  it("2. ligar exige flag + chave + modelo; base https; limites com teto", () => {
    assert.deepEqual(resolveMentorLLMConfig({ MENTOR_AI_ENABLED: "true" }), { enabled: false, reason: "MISSING_API_KEY" })
    assert.deepEqual(resolveMentorLLMConfig({ MENTOR_AI_ENABLED: "true", MENTOR_AI_API_KEY: "k" }), { enabled: false, reason: "MISSING_MODEL" })
    assert.deepEqual(resolveMentorLLMConfig({ MENTOR_AI_ENABLED: "true", MENTOR_AI_API_KEY: "k", MENTOR_AI_MODEL: "m", MENTOR_AI_BASE_URL: "http://x" }), { enabled: false, reason: "INVALID_BASE_URL" })
    assert.deepEqual(resolveMentorLLMConfig({ MENTOR_AI_ENABLED: "true", MENTOR_AI_PROVIDER: "outro", MENTOR_AI_API_KEY: "k", MENTOR_AI_MODEL: "m" }), { enabled: false, reason: "UNKNOWN_PROVIDER" })
    const on = resolveMentorLLMConfig({ MENTOR_AI_ENABLED: "true", MENTOR_AI_API_KEY: "k", MENTOR_AI_MODEL: "m", MENTOR_AI_TIMEOUT_MS: "999999", MENTOR_AI_MAX_CALLS_PER_HOUR: "0" })
    assert.equal(on.enabled, true)
    if (on.enabled) {
      assert.equal(on.timeoutMs, 30_000)
      assert.equal(on.maxCallsPerHour, 1)
      assert.equal(on.baseUrl, "https://api.openai.com/v1")
    }
    assert.ok(getMentorLLMRuntime({ MENTOR_AI_ENABLED: "true", MENTOR_AI_API_KEY: "k", MENTOR_AI_MODEL: "m" }))
  })
})

describe("chamada e falhas do provedor", () => {
  it("3/15. sucesso: fatos vêm do sistema (com números), texto da IA sem números", async () => {
    const { d, provider } = deps([FakeMentorLLMProvider.ok(validResponse(FULL))])
    const r = await generateMentorAnalysis("u1", FULL, d)
    assert.equal(r.status, "OK")
    if (r.status !== "OK") return
    assert.equal(provider.requests.length, 1)
    assert.match(must(r.analysis.highlights[0]).fact, /\d/, "fato com número do sistema")
    assert.doesNotMatch(JSON.stringify(must(r.analysis.highlights[0]).interpretation), /\d/)
    assert.equal(must(r.analysis.recommendations[0]).basis, must(FULL.recommendations[0]).reason)
    assert.equal(r.promptVersion, MENTOR_PROMPT_VERSION)
  })

  it("4. timeout: falha controlada, sem nova tentativa", async () => {
    const { d, provider } = deps([FakeMentorLLMProvider.fail("TIMEOUT")])
    const r = await generateMentorAnalysis("u1", FULL, d)
    assert.deepEqual(r, { status: "FAILED", reason: "TIMEOUT" })
    assert.equal(provider.requests.length, 1)
  })

  it("5. 429 do provedor: falha, sem nova tentativa", async () => {
    const { d, provider } = deps([FakeMentorLLMProvider.fail("RATE_LIMITED", 429)])
    assert.deepEqual(await generateMentorAnalysis("u1", FULL, d), { status: "FAILED", reason: "PROVIDER_ERROR" })
    assert.equal(provider.requests.length, 1)
  })

  it("6/17. 500: uma nova tentativa com espera; nunca mais que o máximo", async () => {
    const a = deps([FakeMentorLLMProvider.fail("HTTP_5XX", 500), FakeMentorLLMProvider.ok(validResponse(FULL))])
    assert.equal((await generateMentorAnalysis("u1", FULL, a.d)).status, "OK")
    assert.equal(a.provider.requests.length, 2)
    assert.deepEqual(a.sleeps, [800])
    const b = deps([FakeMentorLLMProvider.fail("HTTP_5XX", 503)])
    assert.deepEqual(await generateMentorAnalysis("u2", FULL, b.d), { status: "FAILED", reason: "PROVIDER_ERROR" })
    assert.equal(b.provider.requests.length, MENTOR_LLM_MAX_ATTEMPTS)
  })

  it("4xx e resposta vazia: falha sem nova tentativa", async () => {
    const a = deps([FakeMentorLLMProvider.fail("HTTP_4XX", 400)])
    assert.equal((await generateMentorAnalysis("u1", FULL, a.d)).status, "FAILED")
    assert.equal(a.provider.requests.length, 1)
  })

  it("7/8. JSON inválido e schema inválido: descartados", async () => {
    const a = deps([{ text: "não é json" }])
    assert.deepEqual(await generateMentorAnalysis("u1", FULL, a.d), { status: "FAILED", reason: "INVALID_RESPONSE" })
    const b = deps([FakeMentorLLMProvider.ok({ summary: "ok" })])
    assert.deepEqual(await generateMentorAnalysis("u2", FULL, b.d), { status: "FAILED", reason: "INVALID_RESPONSE" })
  })
})

describe("validação anti-alucinação (contrato do prompt)", () => {
  const { input } = buildMentorLLMInput(FULL)
  const allowed = {
    insightRefs: new Set(input.insights.map((i) => i.ref)),
    candidateRefs: new Set(input.candidates.map((c) => c.ref)),
    disciplineRefs: new Set(input.disciplines.map((d) => d.ref)),
    insightDiscipline: new Map(input.insights.map((i) => [i.ref, i.disciplineRef])),
    quality: FULL.contextQuality.level,
  }
  const base = validResponse(FULL)
  const bad = (patch: (r: ReturnType<typeof validResponse>) => unknown) => validateMentorAIResponse(patch(structuredClone(base)), allowed)

  it("contexto válido → resposta válida", () => {
    assert.equal(validateMentorAIResponse(base, allowed).ok, true)
  })
  it("9. candidateId inventado → rejeitada", () => {
    assert.equal(bad((r) => ({ ...r, recommendations: [{ ...must(r.recommendations[0]), candidateId: "R99" }] })).ok, false)
  })
  it("10. evidenceId inventado → rejeitada", () => {
    assert.equal(bad((r) => ({ ...r, recommendations: [{ ...must(r.recommendations[0]), evidenceIds: ["I77"] }] })).ok, false)
  })
  it("11. disciplina inexistente ou trocada → rejeitada", () => {
    const point = must(base.attentionPoints[0])
    assert.equal(bad((r) => ({ ...r, attentionPoints: [{ ...point, disciplineRef: "D99" }] })).ok, false)
    const other = input.disciplines.find((d) => d.ref !== point.disciplineRef)
    if (other) assert.equal(bad((r) => ({ ...r, attentionPoints: [{ ...point, disciplineRef: other.ref }] })).ok, false)
  })
  it("12. número divergente (algarismo, %, por extenso) → rejeitada", () => {
    assert.equal(bad((r) => ({ ...r, summary: "Você estudou 20 horas nesta semana." })).ok, false)
    assert.equal(bad((r) => ({ ...r, summary: "Seu acerto foi de setenta por cento." })).ok, false)
    assert.equal(bad((r) => ({ ...r, summary: "Você estudou vinte horas nesta semana." })).ok, false)
    assert.equal(bad((r) => ({ ...r, summary: "Acerto de 78% no último." })).ok, false)
  })
  it("causalidade explícita e ação fingida → rejeitadas", () => {
    assert.equal(bad((r) => ({ ...r, summary: "A queda foi causada por pouco estudo e isso causou o resultado." })).ok, false)
    assert.equal(bad((r) => ({ ...r, summary: "Seu desempenho melhorou graças ao ciclo." })).ok, false)
    assert.equal(bad((r) => ({ ...r, summary: "Já agendei suas revisões para amanhã." })).ok, false)
  })
  it("campo inesperado ou texto longo demais → rejeitada (schema estrito)", () => {
    assert.equal(bad((r) => ({ ...r, extra: true })).ok, false)
    assert.equal(bad((r) => ({ ...r, summary: "a".repeat(601) })).ok, false)
    assert.equal(bad((r) => ({ ...r, recommendations: [{ ...must(r.recommendations[0]), userId: "x" }] })).ok, false)
  })
  it("14. poucos dados: confiança alta/média é rejeitada; baixa passa", async () => {
    const low = contextFor("low")
    assert.equal(low.contextQuality.level, "LOW")
    const hi = deps([FakeMentorLLMProvider.ok(validResponse(low, "high"))])
    assert.deepEqual(await generateMentorAnalysis("u1", low, hi.d), { status: "FAILED", reason: "INVALID_RESPONSE" })
    const ok = deps([FakeMentorLLMProvider.ok(validResponse(low, "low"))])
    assert.equal((await generateMentorAnalysis("u1", low, ok.d)).status, "OK")
  })
  it("13. sem dados: não chama o modelo", async () => {
    const empty = contextFor("empty")
    const { d, provider } = deps([FakeMentorLLMProvider.ok(validResponse(FULL))])
    assert.deepEqual(await generateMentorAnalysis("u1", empty, d), { status: "INSUFFICIENT_DATA" })
    assert.equal(provider.requests.length, 0)
  })
})

describe("duplicidade, cache, invalidação e limite", () => {
  it("16/18. duplo clique / duas abas: chamadas simultâneas = 1 chamada ao provedor", async () => {
    const { d, provider } = deps([{ delayMs: 20, text: JSON.stringify(validResponse(FULL)) }])
    const [a, b] = await Promise.all([generateMentorAnalysis("u1", FULL, d), generateMentorAnalysis("u1", FULL, d)])
    assert.equal(provider.requests.length, 1)
    assert.equal(a.status, "OK")
    assert.deepEqual(a, b)
  })

  it("19. cache: mesmos dados → mesma análise sem nova chamada nem consumo do limite", async () => {
    const { d, provider, store } = deps([FakeMentorLLMProvider.ok(validResponse(FULL))])
    await generateMentorAnalysis("u1", FULL, d)
    const again = await generateMentorAnalysis("u1", FULL, d)
    assert.equal(again.status === "OK" && again.cached, true)
    assert.equal(provider.requests.length, 1)
    assert.equal(store.calls.get("u1")?.length, 1)
  })

  it("20. invalidação: dado novo (estudo) muda a chave → nova análise", async () => {
    const { d, provider } = deps([FakeMentorLLMProvider.ok(validResponse(FULL))])
    await generateMentorAnalysis("u1", FULL, d)
    const changed = contextFor("full", 30)
    const r = await generateMentorAnalysis("u1", changed, d)
    assert.equal(r.status === "OK" && r.cached, false)
    assert.equal(provider.requests.length, 2)
  })

  it("cache por aluno: a análise de A nunca serve B", async () => {
    const { d, provider } = deps([FakeMentorLLMProvider.ok(validResponse(FULL))])
    await generateMentorAnalysis("aluno-a", FULL, d)
    await generateMentorAnalysis("aluno-b", FULL, d)
    assert.equal(provider.requests.length, 2)
  })

  it("expira em 30 min", async () => {
    const clock = { t: NOW.getTime() }
    const { d, provider } = deps([FakeMentorLLMProvider.ok(validResponse(FULL))], new MentorAnalysisMemoryStore(), clock)
    await generateMentorAnalysis("u1", FULL, d)
    clock.t += 31 * 60 * 1000
    await generateMentorAnalysis("u1", FULL, d)
    assert.equal(provider.requests.length, 2)
  })

  it("limite por aluno/hora: excedente não chama o provedor", async () => {
    const clock = { t: NOW.getTime() }
    const { d, provider } = deps([FakeMentorLLMProvider.ok(validResponse(FULL))], new MentorAnalysisMemoryStore(), clock)
    for (let i = 0; i < RUNTIME.maxCallsPerHour; i++) {
      await generateMentorAnalysis("u1", contextFor("full", i + 1), d)
    }
    const r = await generateMentorAnalysis("u1", contextFor("full", 99), d)
    assert.equal(r.status, "RATE_LIMITED")
    assert.equal(provider.requests.length, RUNTIME.maxCallsPerHour)
    clock.t += 61 * 60 * 1000
    assert.equal((await generateMentorAnalysis("u1", contextFor("full", 100), d)).status, "OK")
  })
})

describe("privacidade, logs e segurança", () => {
  it("entrada mínima: sem uuid, sem nome do concurso, sem ids de usuário; disciplinas por referência", () => {
    const { input } = buildMentorLLMInput(FULL)
    const json = JSON.stringify(input)
    assert.doesNotMatch(json, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    assert.doesNotMatch(json, /Concurso secreto|userId|email/)
    assert.ok(input.disciplines.every((d) => /^D\d+$/.test(d.ref)))
    assert.ok(json.length < 12_000)
  })

  it("logs só com metadados (sem prompt, resposta ou dados do aluno)", async () => {
    const { d, logs } = deps([FakeMentorLLMProvider.ok(validResponse(FULL))])
    await generateMentorAnalysis("u1", FULL, d)
    const keys = new Set(logs.flatMap((l) => Object.keys(l)))
    for (const k of keys) assert.ok(["provider", "model", "promptVersion", "contextVersion", "contextMs", "outcome", "durationMs", "attempts", "inputChars", "outputChars", "rejectionCount", "finishReason", "inputTokens", "outputTokens", "estimatedCostUsd", "httpStatus", "errorKind", "providerErrorCode", "limitScope", "validationMs", "rejectionCodes", "qualityFlags"].includes(k), k)
    assert.doesNotMatch(JSON.stringify(logs), /Contabilidade|u1/)
  })

  it("adapter: Bearer no header, JSON mode, timeout por AbortController e mapeamento de status — chave nunca no erro", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const make = (status: number, body: unknown = { choices: [{ message: { content: "{}" } }] }) =>
      new OpenAICompatibleMentorProvider({ baseUrl: "https://llm.example/v1", apiKey: "sk-SEGREDO", model: "m" }, (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return new Response(JSON.stringify(body), { status })
      }) as unknown as typeof fetch)
    const req = { system: "s", user: "u", maxOutputTokens: 10, timeoutMs: 1000 }
    assert.deepEqual(await make(200).generate(req), { text: "{}", usage: null, finishReason: null })
    assert.equal(must(calls[0]).url, "https://llm.example/v1/chat/completions")
    assert.equal((must(calls[0]).init.headers as Record<string, string>)["authorization"], "Bearer sk-SEGREDO")
    assert.match(String(must(calls[0]).init.body), /"response_format":\{"type":"json_object"\}/)
    for (const [status, kind] of [[429, "RATE_LIMITED"], [500, "HTTP_5XX"], [401, "HTTP_4XX"]] as const) {
      await assert.rejects(make(status).generate(req), (e: unknown) => e instanceof MentorLLMError && e.kind === kind && !String(e.message).includes("SEGREDO"))
    }
    await assert.rejects(make(200, { choices: [] }).generate(req), (e: unknown) => e instanceof MentorLLMError && e.kind === "EMPTY_RESPONSE")
    const hanging = new OpenAICompatibleMentorProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m" }, ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as unknown as typeof fetch)
    await assert.rejects(hanging.generate({ ...req, timeoutMs: 20 }), (e: unknown) => e instanceof MentorLLMError && e.kind === "TIMEOUT")
  })

  const read = (p: string) => readFileSync(p, "utf8")

  it("action: sem parâmetros do cliente, aluno da sessão, bloqueada em modo suporte, só a action exportada", () => {
    const src = read("src/application/mentor-llm/mentor-analysis.action.ts")
    assert.match(src, /export async function requestMentorAnalysisAction\(\): Promise/)
    assert.match(src, /getEffectiveSessionUser\(supabase\)/)
    assert.match(src, /isSupportMode: user\.isSupportMode/)
    assert.match(src, /SUPPORT_MODE/)
    assert.equal((src.match(/^export /gm) ?? []).length, 1)
    assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/)
  })

  it("segredo nunca chega ao cliente: nenhum NEXT_PUBLIC_ do Mentor; componente cliente não importa config/runtime/provider", () => {
    const cfg = read("src/application/mentor-llm/mentor-llm.config.ts")
    assert.doesNotMatch(cfg, /env\[\s*"NEXT_PUBLIC_/)
    const panel = read("src/features/mentor/components/mentor-analysis-panel.tsx")
    assert.match(panel, /^"use client"/)
    assert.doesNotMatch(panel, /mentor-llm\.config|mentor-llm\.runtime|openai-compatible|MENTOR_AI_/)
    const page = read("src/app/(protected)/mentor/page.tsx")
    assert.match(page, /isMentorAIAvailableForSessionUser\(\)/)
    assert.doesNotMatch(page, /requestMentorAnalysisAction|generateMentorAnalysis/, "nenhuma chamada ao LLM no render")
  })

  it("domínio sem HTTP de fornecedor; nenhum SDK novo", () => {
    for (const f of ["src/domain/mentor/mentor-ai.ts", "src/application/mentor-llm/mentor-analysis.service.ts", "src/application/mentor-llm/mentor-ai-response.validator.ts"]) {
      assert.doesNotMatch(read(f), /fetch\(|https:\/\/|openai|authorization/i, f)
    }
    const pkg = read("package.json")
    assert.doesNotMatch(pkg, /"openai"|"@anthropic-ai|"@google\/generative-ai|"ai":/)
  })

  it("feed antigo aposentado: /dashboard/mentor só redireciona e nada grava mentor_history", () => {
    const page = read("src/app/(protected)/dashboard/mentor/page.tsx")
    assert.match(page, /redirect\("\/mentor"\)/)
    assert.doesNotMatch(page, /^import .*(MentorAIService|createServerClient|mentor-ai)/m)
    assert.match(read("src/application/mentor-ai/config/intelligence.config.ts"), /saveHistory: false/)
  })
})
