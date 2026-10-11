import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { MENTOR_PROMPT_VERSION, MentorLLMError } from "@/domain/mentor/mentor-ai"
import type { StudentMentorContext } from "@/domain/mentor/student-mentor-context"
import { FakeMentorLLMProvider, type FakeStep } from "@/lib/testing/fake-mentor-llm-provider"
import { PILOT_NOW, PILOT_SCENARIOS, pilotScenario } from "@/lib/testing/mentor-pilot-scenarios"
import { must } from "@/lib/testing/must"
import { CLIENT_WATCHDOG_MS, rateLimitText } from "@/features/mentor/lib/mentor-analysis-texts"

import {
  estimateCostUsd,
  generateMentorAnalysis,
  getMentorLLMMetrics,
  MentorAnalysisMemoryStore,
  MENTOR_LLM_RETRY_BACKOFF_MS,
  type MentorLLMLogEvent,
  type MentorLLMRuntimeConfig,
} from "./mentor-analysis.service"
import { MENTOR_SYSTEM_PROMPT, MENTOR_SYSTEM_PROMPTS } from "./mentor-ai.prompt"
import { buildAllowedRefs, validateMentorAIResponse } from "./mentor-ai-response.validator"
import { buildMentorLLMInput, MAX_LLM_INPUT_CHARS } from "./mentor-llm-input"
import { parsePilotUserIds, resolveMentorAIAccess, resolveMentorLLMConfig } from "./mentor-llm.config"
import { getMentorAIAccess, getMentorLLMRuntime } from "./mentor-llm.runtime"
import { OpenAICompatibleMentorProvider } from "./openai-compatible.provider"

// G2.17 — piloto controlado. Tudo com provedor FALSO ou fetch falso (nenhuma chamada real).

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const ON = { MENTOR_AI_ENABLED: "true", MENTOR_AI_API_KEY: "sk-SEGREDO", MENTOR_AI_MODEL: "modelo-x" }
const CFG: MentorLLMRuntimeConfig = { timeoutMs: 1000, maxOutputTokens: 500, maxCallsPerHour: 10, maxCallsPerDay: 20, maxCallsPerDayGlobal: 100, pricing: null }
const HIGH = pilotScenario("high").build()
const read = (p: string) => readFileSync(p, "utf8")

function valid(ctx: StudentMentorContext, over: Record<string, unknown> = {}) {
  const { input } = buildMentorLLMInput(ctx)
  const i1 = must(input.insights[0]).ref
  const c1 = must(input.candidates[0]).ref
  const low = ctx.contextQuality.level === "LOW"
  return {
    summary: "Seu momento mostra consistência e um ponto que pede cuidado.",
    summaryRefs: [i1],
    highlights: [{ insightRef: i1, kind: "INTERPRETATION", text: "Vale observar este ponto com calma." }],
    attentionPoints: [],
    recommendations: [{ id: "rec-1", candidateId: c1, title: "Próximo passo", explanation: "Pode ajudar priorizar este ponto.", evidenceIds: [c1] }],
    confidence: low ? "low" : "medium",
    insufficientData: low,
    ...over,
  }
}

function setup(steps: FakeStep[], config: MentorLLMRuntimeConfig = CFG, store = new MentorAnalysisMemoryStore(), clock = { t: PILOT_NOW.getTime() }) {
  const provider = new FakeMentorLLMProvider(steps)
  const logs: MentorLLMLogEvent[] = []
  const sleeps: number[] = []
  return {
    provider, logs, sleeps, store, clock,
    d: { provider, config, store, now: () => clock.t, sleep: async (ms: number) => { sleeps.push(ms) }, log: (e: MentorLLMLogEvent) => logs.push(e) },
  }
}

describe("G2.17 — piloto: flag, allowlist, suporte, kill switch", () => {
  it("piloto desligado por padrão: sem env ninguém tem acesso", () => {
    assert.equal(getMentorLLMRuntime({}), null)
    assert.deepEqual(getMentorAIAccess({ id: A, isSupportMode: false }, {}), { allowed: false, reason: "FLAG_OFF" })
  })

  it("flag ligada sem allowlist: ninguém usa (não existe modo 'todos')", () => {
    assert.deepEqual(getMentorAIAccess({ id: A, isSupportMode: false }, ON), { allowed: false, reason: "NOT_IN_PILOT" })
  })

  it("usuário autorizado × não autorizado; uuids inválidos ignorados; maiúsculas normalizadas", () => {
    const env = { ...ON, MENTOR_AI_PILOT_USER_IDS: `${A.toUpperCase()}, nao-e-uuid ; ${"x".repeat(36)}` }
    assert.deepEqual(getMentorAIAccess({ id: A, isSupportMode: false }, env), { allowed: true })
    assert.deepEqual(getMentorAIAccess({ id: B, isSupportMode: false }, env), { allowed: false, reason: "NOT_IN_PILOT" })
    assert.deepEqual([...parsePilotUserIds(env.MENTOR_AI_PILOT_USER_IDS)], [A])
  })

  it("modo suporte bloqueia mesmo para aluno da allowlist; sem sessão = bloqueado", () => {
    const env = { ...ON, MENTOR_AI_PILOT_USER_IDS: A }
    assert.deepEqual(getMentorAIAccess({ id: A, isSupportMode: true }, env), { allowed: false, reason: "SUPPORT_MODE" })
    assert.deepEqual(getMentorAIAccess(null, env), { allowed: false, reason: "NOT_AUTHENTICATED" })
  })

  it("kill switch: MENTOR_AI_ENABLED=false derruba o acesso na hora (configuração relida a cada pedido)", () => {
    const env: Record<string, string> = { ...ON, MENTOR_AI_PILOT_USER_IDS: A }
    assert.equal(getMentorAIAccess({ id: A, isSupportMode: false }, env).allowed, true)
    env["MENTOR_AI_ENABLED"] = "false"
    assert.deepEqual(getMentorAIAccess({ id: A, isSupportMode: false }, env), { allowed: false, reason: "FLAG_OFF" })
    assert.equal(getMentorLLMRuntime(env), null)
    assert.equal(resolveMentorAIAccess(resolveMentorLLMConfig(env), { id: A, isSupportMode: false }).allowed, false)
  })

  it("provedor real configurado: padrões conservadores do piloto, estilo de API e preço opcional", () => {
    const cfg = resolveMentorLLMConfig({ ...ON })
    assert.ok(cfg.enabled)
    if (cfg.enabled) {
      assert.equal(cfg.maxCallsPerHour, 4)
      assert.equal(cfg.maxCallsPerDay, 12)
      assert.equal(cfg.maxCallsPerDayGlobal, 60)
      assert.equal(cfg.timeoutMs, 15_000)
      assert.equal(cfg.apiStyle, "classic")
      assert.equal(cfg.pricing, null)
    }
    const r = must(getMentorLLMRuntime({ ...ON, MENTOR_AI_API_STYLE: "reasoning", MENTOR_AI_PRICE_INPUT_PER_MTOK: "0.4", MENTOR_AI_PRICE_OUTPUT_PER_MTOK: "1.6", MENTOR_AI_MAX_CALLS_PER_DAY: "9999" }))
    assert.equal(r.provider.name, "openai-compatible")
    assert.equal(r.provider.model, "modelo-x")
    assert.deepEqual(r.config.pricing, { inputPerMTok: 0.4, outputPerMTok: 1.6 })
    assert.equal(r.config.maxCallsPerDay, 100, "teto do teto")
    // preço incompleto → custo desconhecido (nunca inventado)
    const half = must(getMentorLLMRuntime({ ...ON, MENTOR_AI_PRICE_INPUT_PER_MTOK: "0.4" }))
    assert.equal(half.config.pricing, null)
  })

  it("wiring: action resolve o aluno no servidor e usa a allowlist; página só monta o bloco para quem pode", () => {
    const action = read("src/application/mentor-llm/mentor-analysis.action.ts")
    assert.match(action, /export async function requestMentorAnalysisAction\(\): Promise/)
    assert.match(action, /getMentorAIAccess\(user \? \{ id: user\.id, isSupportMode: user\.isSupportMode \} : null\)/)
    assert.equal((action.match(/^export /gm) ?? []).length, 1)
    const availability = read("src/application/mentor-llm/mentor-ai-availability.ts")
    assert.doesNotMatch(availability, /^"use server"/m, "não pode virar Server Action exposta")
    assert.match(availability, /getEffectiveSessionUser\(supabase\)/)
    const page = read("src/app/(protected)/mentor/page.tsx")
    assert.match(page, /aiAvailable \? <MentorAnalysisPanel/)
    assert.doesNotMatch(page, /requestMentorAnalysisAction|generateMentorAnalysis/)
  })
})

describe("G2.17 — adapter real (fetch falso)", () => {
  const req = { system: "s", user: "u", maxOutputTokens: 321, timeoutMs: 1000 }
  const fakeFetch = (status: number, body: unknown, calls: RequestInit[] = []) =>
    (async (_url: string, init: RequestInit) => {
      calls.push(init)
      return new Response(JSON.stringify(body), { status })
    }) as unknown as typeof fetch

  it("estilo classic × reasoning: parâmetros de tokens e temperature", () => {
    const classic = new OpenAICompatibleMentorProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m" }).buildBody(req)
    assert.equal(classic["max_tokens"], 321)
    assert.equal(classic["temperature"], 0.2)
    const reasoning = new OpenAICompatibleMentorProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m", apiStyle: "reasoning" }).buildBody(req)
    assert.equal(reasoning["max_completion_tokens"], 321)
    assert.equal("max_tokens" in reasoning, false)
    assert.equal("temperature" in reasoning, false)
    assert.doesNotMatch(JSON.stringify(reasoning), /"k"/)
  })

  it("usage e finish_reason lidos quando o fornecedor informa; ausentes → null", async () => {
    const withUsage = new OpenAICompatibleMentorProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m" },
      fakeFetch(200, { choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 812, completion_tokens: 240 } }))
    assert.deepEqual(await withUsage.generate(req), { text: "{}", usage: { inputTokens: 812, outputTokens: 240 }, finishReason: "stop" })
    const bare = new OpenAICompatibleMentorProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m" }, fakeFetch(200, { choices: [{ message: { content: "{}" } }] }))
    assert.deepEqual(await bare.generate(req), { text: "{}", usage: null, finishReason: null })
  })

  it("erro HTTP guarda só o código curto do fornecedor — nunca a mensagem livre nem a chave", async () => {
    const p = new OpenAICompatibleMentorProvider({ baseUrl: "https://x/v1", apiKey: "sk-SEGREDO", model: "m" },
      fakeFetch(400, { error: { message: "Unsupported parameter: 'max_tokens' ... seu prompt: Contabilidade", type: "invalid_request_error", param: "max_tokens", code: "unsupported_parameter" } }))
    await assert.rejects(p.generate(req), (e: unknown) => {
      assert.ok(e instanceof MentorLLMError)
      assert.equal(e.kind, "HTTP_4XX")
      assert.equal(e.status, 400)
      assert.equal(e.detail, "invalid_request_error:unsupported_parameter:max_tokens")
      assert.doesNotMatch(`${e.message}|${e.detail}`, /SEGREDO|Contabilidade|Unsupported/)
      return true
    })
  })

  it("timeout cobre também a leitura do corpo (corpo lento vira TIMEOUT)", async () => {
    const slowBody = ((_u: string, init: RequestInit) =>
      Promise.resolve({
        status: 200,
        json: () => new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
      })) as unknown as typeof fetch
    const p = new OpenAICompatibleMentorProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m" }, slowBody)
    await assert.rejects(p.generate({ ...req, timeoutMs: 20 }), (e: unknown) => e instanceof MentorLLMError && e.kind === "TIMEOUT")
  })

  it("conteúdo vazio com finish_reason length (raciocínio gastou o teto) → EMPTY_RESPONSE com o motivo", async () => {
    const p = new OpenAICompatibleMentorProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m" }, fakeFetch(200, { choices: [{ message: { content: "" }, finish_reason: "length" }] }))
    await assert.rejects(p.generate(req), (e: unknown) => e instanceof MentorLLMError && e.kind === "EMPTY_RESPONSE" && e.detail === "length")
  })
})

describe("G2.17 — serviço: limites, retry, cache, dedupe, custo", () => {
  it("limite diário por aluno: nega sem chamar o provedor e sem consumir cota", async () => {
    const cfg = { ...CFG, maxCallsPerHour: 10, maxCallsPerDay: 2 }
    const { d, provider, clock } = setup([FakeMentorLLMProvider.ok(valid(HIGH))], cfg)
    const ctxs = [HIGH, pilotScenario("reviews-overdue").build(), pilotScenario("simulados-only").build()]
    assert.equal((await generateMentorAnalysis(A, must(ctxs[0]), d)).status, "OK")
    clock.t += 2 * 60 * 60 * 1000
    assert.notEqual((await generateMentorAnalysis(A, must(ctxs[1]), d)).status, "RATE_LIMITED")
    clock.t += 2 * 60 * 60 * 1000
    const r = await generateMentorAnalysis(A, must(ctxs[2]), d)
    assert.equal(r.status, "RATE_LIMITED")
    if (r.status === "RATE_LIMITED") assert.equal(r.scope, "DAY")
    assert.equal(provider.requests.length, 2)
    assert.equal(d.store.calls.get(A)?.length, 2, "negar não consome cota")
  })

  it("limite global por dia: segundo aluno bloqueado (trava de custo)", async () => {
    const cfg = { ...CFG, maxCallsPerDayGlobal: 1 }
    const { d, provider } = setup([FakeMentorLLMProvider.ok(valid(HIGH))], cfg)
    assert.equal((await generateMentorAnalysis(A, HIGH, d)).status, "OK")
    const r = await generateMentorAnalysis(B, HIGH, d)
    assert.equal(r.status, "RATE_LIMITED")
    if (r.status === "RATE_LIMITED") assert.equal(r.scope, "GLOBAL")
    assert.equal(provider.requests.length, 1)
  })

  it("429 do fornecedor não é contornado com retry; 5xx tem 1 nova tentativa com espera", async () => {
    const t429 = setup([FakeMentorLLMProvider.fail("RATE_LIMITED", 429)])
    assert.deepEqual(await generateMentorAnalysis(A, HIGH, t429.d), { status: "FAILED", reason: "PROVIDER_ERROR" })
    assert.equal(t429.provider.requests.length, 1)
    assert.deepEqual(t429.sleeps, [])
    const t500 = setup([FakeMentorLLMProvider.fail("HTTP_5XX", 503), FakeMentorLLMProvider.ok(valid(HIGH))])
    assert.equal((await generateMentorAnalysis(A, HIGH, t500.d)).status, "OK")
    assert.equal(t500.provider.requests.length, 2)
    assert.deepEqual(t500.sleeps, [MENTOR_LLM_RETRY_BACKOFF_MS])
  })

  it("saída cortada (finish_reason length) é descartada, contada e não vai para o cache", async () => {
    const before = getMentorLLMMetrics().truncated
    const { d, logs, store } = setup([FakeMentorLLMProvider.ok(valid(HIGH), { finishReason: "length" })])
    assert.deepEqual(await generateMentorAnalysis(A, HIGH, d), { status: "FAILED", reason: "INVALID_RESPONSE" })
    assert.equal(getMentorLLMMetrics().truncated, before + 1)
    assert.equal(must(logs[0]).outcome, "truncated")
    assert.equal(store.cache.size, 0)
  })

  it("tokens e custo: somam só o que o fornecedor informou; custo só com preço configurado", async () => {
    const m0 = getMentorLLMMetrics()
    const usage = { inputTokens: 1000, outputTokens: 200 }
    const priced = setup([FakeMentorLLMProvider.ok(valid(HIGH), { usage })], { ...CFG, pricing: { inputPerMTok: 1, outputPerMTok: 4 } })
    await generateMentorAnalysis(A, HIGH, priced.d)
    assert.equal(must(priced.logs[0]).estimatedCostUsd, 0.0018)
    assert.equal(must(priced.logs[0]).inputTokens, 1000)
    const m1 = getMentorLLMMetrics()
    assert.equal(m1.inputTokens - m0.inputTokens, 1000)
    assert.equal(m1.outputTokens - m0.outputTokens, 200)
    assert.equal(estimateCostUsd(usage, null), null)
    assert.equal(estimateCostUsd({ inputTokens: null, outputTokens: 5 }, { inputPerMTok: 1, outputPerMTok: 1 }), null)
    const unpriced = setup([FakeMentorLLMProvider.ok(valid(HIGH))])
    await generateMentorAnalysis(A, HIGH, unpriced.d)
    assert.equal(must(unpriced.logs[0]).estimatedCostUsd, null)
    assert.equal(must(unpriced.logs[0]).inputTokens, null)
  })

  it("cache: 1ª chamada vai ao provedor, 2ª não; contexto alterado → nova análise; outro aluno não recebe a análise", async () => {
    const { d, provider } = setup([FakeMentorLLMProvider.ok(valid(HIGH))])
    assert.equal((await generateMentorAnalysis(A, HIGH, d)).status, "OK")
    const again = await generateMentorAnalysis(A, HIGH, d)
    assert.ok(again.status === "OK" && again.cached)
    assert.equal(provider.requests.length, 1)
    const changed = { ...HIGH, disciplines: HIGH.disciplines.map((x, i) => (i === 0 ? { ...x, studyMinutesLast28: (x.studyMinutesLast28 ?? 0) + 30 } : x)) }
    await generateMentorAnalysis(A, changed, d)
    assert.equal(provider.requests.length, 2, "dado novo → nova chave")
    await generateMentorAnalysis(B, HIGH, d)
    assert.equal(provider.requests.length, 3, "cache é por aluno")
  })

  it("dedupe: duas chamadas simultâneas (duas abas / reload) → uma ida ao provedor", async () => {
    const { d, provider } = setup([{ text: JSON.stringify(valid(HIGH)), delayMs: 20 }])
    const [a, b] = await Promise.all([generateMentorAnalysis(A, HIGH, d), generateMentorAnalysis(A, HIGH, d)])
    assert.equal(a.status, "OK")
    assert.equal(b.status, "OK")
    assert.equal(provider.requests.length, 1)
    assert.equal(d.store.calls.get(A)?.length, 1, "a segunda não gasta cota")
  })

  it("fallback: toda falha vira status (nunca exceção) e nada vai para o cache", async () => {
    const steps: FakeStep[][] = [
      [FakeMentorLLMProvider.fail("TIMEOUT")], [FakeMentorLLMProvider.fail("RATE_LIMITED", 429)], [FakeMentorLLMProvider.fail("HTTP_5XX", 500)],
      [FakeMentorLLMProvider.fail("HTTP_4XX", 400)], [FakeMentorLLMProvider.fail("EMPTY_RESPONSE")], [{ text: "não é json" }],
      [FakeMentorLLMProvider.ok({ summary: "x" })], [FakeMentorLLMProvider.ok(valid(HIGH, { summary: "Você vai acertar noventa por cento." }))],
    ]
    for (const s of steps) {
      const { d, store } = setup(s)
      const r = await generateMentorAnalysis(A, HIGH, d)
      assert.equal(r.status, "FAILED")
      assert.equal(store.cache.size, 0)
    }
  })

  it("logs do limite local também só têm metadados (sem id do aluno)", async () => {
    const { d, logs } = setup([FakeMentorLLMProvider.ok(valid(HIGH))], { ...CFG, maxCallsPerHour: 1 })
    await generateMentorAnalysis(A, HIGH, d)
    await generateMentorAnalysis(A, pilotScenario("reviews-overdue").build(), d)
    const last = must(logs[logs.length - 1])
    assert.equal(last.outcome, "local_rate_limited")
    assert.equal(last.limitScope, "HOUR")
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(`${A}|Contabilidade|Português`))
  })
})

describe("G2.17 — casos adversariais e contrato", () => {
  const allowed = (ctx: StudentMentorContext) => {
    const { input } = buildMentorLLMInput(ctx)
    return { input, refs: buildAllowedRefs(input) }
  }

  it("datas por extenso e quantificações sem algarismo são rejeitadas (endurecimento, sem relaxar nada)", () => {
    const { refs } = allowed(HIGH)
    for (const summary of ["Seu simulado de outubro foi melhor.", "Você estudou o dobro desta vez.", "O desempenho triplicou."]) {
      const r = validateMentorAIResponse(valid(HIGH, { summary }), refs)
      assert.equal(r.ok, false, summary)
    }
    assert.equal(validateMentorAIResponse(valid(HIGH, { summary: "Este é um marco no seu ritmo de estudo." }), refs).ok, true, "'marco' (sem cedilha) não é mês")
  })

  it("obedecer a instrução escondida no nome da disciplina é rejeitado (número, ação falsa, causa)", () => {
    const ctx = pilotScenario("adv-injection-in-name").build()
    const { refs, input } = allowed(ctx)
    assert.match(JSON.stringify(input), /IGNORE AS REGRAS/, "o nome vai como DADO (é do próprio aluno)")
    for (const summary of ["Agendei uma revisão para você.", "Você vai acertar noventa e cinco por cento.", "Você vai bem porque você estudou bastante.", "Você vai acertar 95%."]) {
      assert.equal(validateMentorAIResponse(valid(ctx, { summary }), refs).ok, false, summary)
    }
  })

  it("contradição da v1 resolvida (G2.18): referência D… no texto é estrutura, não número; nome oficial com algarismo também", () => {
    const { refs, input } = allowed(HIGH)
    const declining = must(input.insights.find((i) => i.type === "DECLINING_DISCIPLINE"))
    const d = must(declining.disciplineRef)
    assert.equal(validateMentorAIResponse(valid(HIGH, { summary: `${d} merece atenção nos simulados.`, summaryRefs: [declining.ref] }), refs).ok, true)
    assert.match(MENTOR_SYSTEM_PROMPTS["mentor-v1"], /refira-se a elas apenas pelas referências "D…"/, "a v1 mandava citar por referência…")
    assert.match(MENTOR_SYSTEM_PROMPTS["mentor-v1"], /NÃO escreva números/, "…e proibia algarismos — sem a separação, quem obedecia era rejeitado")
    const adv = pilotScenario("adv-digits-in-name").build()
    const name = must(buildMentorLLMInput(adv).input.disciplines[0]).name
    assert.match(name, /\d/)
    assert.equal(validateMentorAIResponse(valid(adv, { summary: `Atenção a ${name}.` }), allowed(adv).refs).ok, true)
  })

  it("G2.18: mentor-v2 promovida; v1 segue disponível para comparação; versões não se misturam no cache", async () => {
    // (G2.17 deixava a v2 só como candidata; a G2.18 a promoveu com justificativa — docs/mentor-v2-evaluation.md.)
    assert.equal(MENTOR_PROMPT_VERSION, "mentor-v2")
    assert.equal(MENTOR_SYSTEM_PROMPT, MENTOR_SYSTEM_PROMPTS["mentor-v2"])
    const v1 = MENTOR_SYSTEM_PROMPTS["mentor-v1"]
    const { d, provider } = setup([FakeMentorLLMProvider.scenario("VALID_RESPONSE")])
    const r2 = await generateMentorAnalysis(A, HIGH, d)
    const r1 = await generateMentorAnalysis(A, HIGH, { ...d, promptVersion: "mentor-v1" })
    assert.equal(provider.requests.length, 2, "v1 e v2 têm chaves de cache diferentes")
    assert.equal(must(provider.requests[1]).system, v1)
    assert.match(must(provider.requests[1]).user, /"promptVersion":"mentor-v1"/)
    assert.ok(r2.status === "OK" && r2.promptVersion === "mentor-v2")
    assert.ok(r1.status === "OK" && r1.promptVersion === "mentor-v1")
  })

  it("teto da entrada nunca deixa 'D…' órfão (antes a resposta correta era rejeitada)", () => {
    const huge = "Matéria com nome muito longo ".repeat(40)
    const ctx: StudentMentorContext = { ...HIGH, disciplines: HIGH.disciplines.map((x) => ({ ...x, name: `${x.name} ${huge}` })) }
    const { input, refs } = buildMentorLLMInput(ctx)
    assert.ok(JSON.stringify(input).length <= MAX_LLM_INPUT_CHARS || input.disciplines.length === 0)
    const present = new Set(input.disciplines.map((x) => x.ref))
    for (const x of [...input.insights, ...input.candidates]) if (x.disciplineRef) assert.ok(present.has(x.disciplineRef), x.disciplineRef)
    assert.deepEqual([...refs.disciplines.keys()].sort(), [...present].sort())
  })

  it("privacidade dos cenários do piloto: sem uuid, id de aluno, e-mail ou concurso no que vai ao provedor", () => {
    for (const s of PILOT_SCENARIOS) {
      const json = JSON.stringify(buildMentorLLMInput(s.build()).input)
      assert.doesNotMatch(json, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, s.id)
      assert.doesNotMatch(json, /Concurso secreto|userId|email|"u"/, s.id)
    }
  })
})

describe("G2.17 — UI, script de piloto e kill switch", () => {
  it("UI: vigia no cliente acima do pior caso do servidor; textos sem detalhe técnico", () => {
    assert.ok(CLIENT_WATCHDOG_MS > 2 * 30_000 + MENTOR_LLM_RETRY_BACKOFF_MS)
    assert.match(rateLimitText("HOUR", 600), /por hora.*cerca de 10 min/)
    assert.match(rateLimitText("DAY", 7200), /de hoje.*cerca de 2 h/)
    assert.match(rateLimitText("GLOBAL", 10), /limite de uso de hoje/)
    assert.match(read("src/features/mentor/lib/mentor-analysis-texts.ts"), /Seus dados continuam disponíveis na visão determinística do Mentor\./)
    const panel = read("src/features/mentor/components/mentor-analysis-panel.tsx")
    assert.match(panel, /Promise\.race\(\[requestAnalysis\(\), watchdog\]\)/)
    assert.match(panel, /requestAnalysis = requestMentorAnalysisAction/, "produção usa sempre a Server Action")
    assert.doesNotMatch(panel, /HTTP|429|500|schema|JSON|MENTOR_AI_/)
  })

  it("script de piloto: teto duro, contextos sintéticos, sem escrita no banco; resultados fora do git", () => {
    const script = read("scripts/mentor-ai-pilot.ts")
    assert.match(script, /const HARD_MAX_CALLS = 30/)
    assert.match(script, /mentor-pilot-scenarios/)
    assert.doesNotMatch(script, /createClient|supabase|\.(insert|update|upsert|delete)\(/i)
    assert.doesNotMatch(script, /MENTOR_AI_API_KEY[^\n]*out\(|apiKey\)/)
    assert.match(read(".gitignore"), /^\/pilot-runs\/$/m)
  })

  it("nenhum segredo do Mentor é público; feed antigo segue só redirecionando", () => {
    for (const f of ["src/application/mentor-llm/mentor-llm.config.ts", "src/application/mentor-llm/mentor-ai-availability.ts", "src/app/(protected)/mentor/page.tsx"]) {
      assert.doesNotMatch(read(f), /NEXT_PUBLIC_MENTOR|env\[\s*"NEXT_PUBLIC_/, f)
    }
    assert.match(read("src/app/(protected)/dashboard/mentor/page.tsx"), /redirect\("\/mentor"\)/)
    assert.match(read("src/application/mentor-ai/config/intelligence.config.ts"), /saveHistory: false/)
  })
})
