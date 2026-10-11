/**
 * G2.17–G2.19 — script do PILOTO CONTROLADO do Mentor IA (uso local, pelo operador).
 *
 * Roda o fluxo REAL do serviço (generateMentorAnalysis + validador + qualidade
 * + cache + deduplicação + limites) sobre contextos SINTÉTICOS (nenhum dado de
 * aluno) e grava em pilot-runs/ (ignorado pelo git) o resultado, o resumo
 * v1 × v2 e a planilha de avaliação humana.
 *
 *   Conferir configuração (sem chamar nada, sem mostrar valores):
 *     npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --check
 *   Ensaio (provedor falso, sem rede, sem custo):
 *     npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --prompt=both --max-calls=5
 *   Real (exige MENTOR_AI_ENABLED=true, MENTOR_AI_API_KEY e MENTOR_AI_MODEL):
 *     npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --real --prompt=both --max-calls=20
 *
 * Teto duro de chamadas reais por execução (--max-calls, máx. 30; cada nova
 * tentativa conta). As versões rodam INTERCALADAS (v1, v2 por cenário): se o
 * teto acabar, as duas ficam com a mesma cobertura. Nunca imprime a chave.
 * Não escreve no banco. Não usa dados reais de aluno.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  generateMentorAnalysis,
  getMentorLLMMetrics,
  MentorAnalysisMemoryStore,
  type MentorLLMLogEvent,
  type MentorLLMRuntimeConfig,
} from "@/application/mentor-llm/mentor-analysis.service"
import { assessMentorResponse, crossContextRepetition, type MentorQualityAssessment } from "@/application/mentor-llm/mentor-ai-quality"
import { buildMentorUserMessage, MENTOR_SYSTEM_PROMPTS } from "@/application/mentor-llm/mentor-ai.prompt"
import {
  buildAllowedRefs,
  parseMentorAIText,
  validateMentorAIResponse,
  type MentorRejection,
} from "@/application/mentor-llm/mentor-ai-response.validator"
import { buildMentorLLMInput } from "@/application/mentor-llm/mentor-llm-input"
import { resolveMentorLLMConfig } from "@/application/mentor-llm/mentor-llm.config"
import { getMentorLLMRuntime } from "@/application/mentor-llm/mentor-llm.runtime"
import {
  compareVersions,
  pilotDecision,
  summarizeVersion,
  type PilotCallRow,
} from "@/application/mentor-llm/mentor-pilot-report"
import {
  MENTOR_PROMPT_VERSION,
  MentorLLMError,
  type MentorAIResponse,
  type MentorAnalysisResult,
  type MentorLLMGeneration,
  type MentorLLMProvider,
  type MentorLLMRequest,
  type MentorPromptVersion,
  type MentorRichText,
} from "@/domain/mentor/mentor-ai"
import type { StudentMentorContext } from "@/domain/mentor/student-mentor-context"
import { buildValidMentorResponse, FakeMentorLLMProvider, type FakeMentorScenario } from "@/lib/testing/fake-mentor-llm-provider"
import { PILOT_SCENARIOS, pilotScenario } from "@/lib/testing/mentor-pilot-scenarios"

const HARD_MAX_CALLS = 30
const PILOT_USER = "pilot-script" // só chave de cache/limite local; nunca enviado ao provedor
const BUDGET_EXHAUSTED = "pilot_budget_exhausted"

const out = (line = "") => process.stdout.write(`${line}\n`)
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]

const real = process.argv.includes("--real")
const checkOnly = process.argv.includes("--check")
const promptArg = arg("prompt") ?? MENTOR_PROMPT_VERSION
const versions: MentorPromptVersion[] = promptArg === "both" ? ["mentor-v1", "mentor-v2"] : [promptArg as MentorPromptVersion]
if (!versions.every((v) => v === "mentor-v1" || v === "mentor-v2")) throw new Error(`--prompt inválido: ${promptArg}`)
const maxCalls = Math.min(HARD_MAX_CALLS, Math.max(1, Number(arg("max-calls") ?? 12) || 12))

const CONFIG_VARS = [
  "MENTOR_AI_ENABLED", "MENTOR_AI_PROVIDER", "MENTOR_AI_BASE_URL", "MENTOR_AI_API_KEY", "MENTOR_AI_MODEL", "MENTOR_AI_API_STYLE",
  "MENTOR_AI_TIMEOUT_MS", "MENTOR_AI_MAX_OUTPUT_TOKENS", "MENTOR_AI_PRICE_INPUT_PER_MTOK", "MENTOR_AI_PRICE_OUTPUT_PER_MTOK",
] as const
const REQUIRED = new Set(["MENTOR_AI_ENABLED", "MENTOR_AI_API_KEY", "MENTOR_AI_MODEL"])

/** Conferência da configuração: diz o que existe, nunca o valor de segredo. */
function preflight(): boolean {
  out("Configuração do Mentor IA (valores não são exibidos):")
  for (const v of CONFIG_VARS) {
    const present = (process.env[v] ?? "").trim() !== ""
    out(`  ${v}: ${present ? "definido" : "ausente"}${!present && REQUIRED.has(v) ? "  ← obrigatório" : ""}`)
  }
  const cfg = resolveMentorLLMConfig(process.env)
  if (!cfg.enabled) {
    const why: Record<string, string> = {
      FLAG_OFF: "MENTOR_AI_ENABLED não é \"true\"",
      MISSING_API_KEY: "falta MENTOR_AI_API_KEY",
      MISSING_MODEL: "falta MENTOR_AI_MODEL",
      UNKNOWN_PROVIDER: "MENTOR_AI_PROVIDER diferente de \"openai-compatible\"",
      INVALID_BASE_URL: "MENTOR_AI_BASE_URL precisa começar com https://",
    }
    out(`Resultado: DESLIGADO — ${why[cfg.reason] ?? cfg.reason}. O piloto real NÃO roda. Ver docs/mentor-ai-production-runbook.md §1.`)
    return false
  }
  out(`Resultado: PRONTO — modelo ${cfg.model} · host ${new URL(cfg.baseUrl).host} · estilo ${cfg.apiStyle} · timeout ${cfg.timeoutMs} ms · saída ≤ ${cfg.maxOutputTokens} tokens · preço ${cfg.pricing ? "configurado" : "não configurado (custo = null)"}`)
  return true
}

interface CallRecord {
  durationMs: number
  text: string | null
  usage: MentorLLMGeneration["usage"] | null
  finishReason: string | null
  error: string | null
}

/** Conta e registra cada chamada ao provedor; para ao atingir o teto. */
class RecordingProvider implements MentorLLMProvider {
  readonly records: CallRecord[] = []
  constructor(private readonly inner: MentorLLMProvider, readonly budget: { left: number }) {}
  get name() { return this.inner.name }
  get model() { return this.inner.model }
  async generate(req: MentorLLMRequest): Promise<MentorLLMGeneration> {
    if (this.budget.left <= 0) throw new MentorLLMError("HTTP_4XX", null, BUDGET_EXHAUSTED)
    this.budget.left -= 1
    const started = Date.now()
    try {
      const g = await this.inner.generate(req)
      this.records.push({ durationMs: Date.now() - started, text: g.text, usage: g.usage ?? null, finishReason: g.finishReason ?? null, error: null })
      return g
    } catch (e) {
      const err = e instanceof MentorLLMError ? `${e.kind}${e.status ? `:${e.status}` : ""}${e.detail ? `:${e.detail}` : ""}` : "UNKNOWN"
      this.records.push({ durationMs: Date.now() - started, text: null, usage: null, finishReason: null, error: err })
      throw e
    }
  }
}

interface RunRow extends PilotCallRow {
  section: string
  quality: string
  detail: string
  providerCalls: number
  rejectionReasons: string[]
  rawResponse: string | null
  analysis: Extract<MentorAnalysisResult, { status: "OK" }>["analysis"] | null
}

function detailOf(r: MentorAnalysisResult): string {
  if (r.status === "FAILED") return r.reason
  if (r.status === "RATE_LIMITED") return `${r.scope}:${r.retryAfterSeconds}s`
  if (r.status === "OK") return r.cached ? "cache" : "novo"
  return ""
}

function emptyRow(section: string, scenario: string, version: string, quality: string, status: string, detail: string): RunRow {
  return {
    section, scenario, promptVersion: version, quality, status, detail, failReason: null, outcome: null, cached: false, providerMs: null,
    validationMs: null, inputTokens: null, outputTokens: null, costUsd: null, rejections: [], assessment: null, providerCalls: 0,
    rejectionReasons: [], rawResponse: null, analysis: null,
  }
}

async function main() {
  const ready = preflight()
  if (checkOnly) {
    process.exitCode = ready ? 0 : 1
    return
  }
  const runtime = real ? getMentorLLMRuntime(process.env) : null
  if (real && !runtime) {
    out("ERRO: piloto real cancelado — configuração incompleta (acima). Nenhuma chamada foi feita.")
    process.exitCode = 1
    return
  }
  // Ensaio: provedor falso que monta respostas válidas a partir do próprio pedido.
  const baseProvider = runtime?.provider ?? new FakeMentorLLMProvider([FakeMentorLLMProvider.scenario("VALID_RESPONSE")])
  const baseConfig: MentorLLMRuntimeConfig = runtime?.config ?? {
    timeoutMs: 15_000, maxOutputTokens: 900, maxCallsPerHour: 30, maxCallsPerDay: 100, maxCallsPerDayGlobal: 100, pricing: null,
  }
  // Limites do script: altos o bastante para os cenários; o teto real é --max-calls.
  const config: MentorLLMRuntimeConfig = { ...baseConfig, maxCallsPerHour: 30, maxCallsPerDay: 100, maxCallsPerDayGlobal: 100 }
  const v0: MentorPromptVersion = versions[0] ?? MENTOR_PROMPT_VERSION
  const budget = { left: maxCalls }
  const provider = new RecordingProvider(baseProvider, budget)
  const logs: MentorLLMLogEvent[] = []
  const rows: RunRow[] = []

  out(`Mentor IA — piloto ${real ? "REAL" : "ENSAIO (provedor falso)"} · provedor=${provider.name} · modelo=${provider.model} · prompt=${versions.join("+")} · teto=${maxCalls} chamadas`)

  async function run(section: string, scenario: string, ctx: StudentMentorContext, version: MentorPromptVersion, store: MentorAnalysisMemoryStore, cfg = config) {
    if (budget.left <= 0 && section !== "cache") {
      rows.push(emptyRow(section, scenario, version, ctx.contextQuality.level, "SKIPPED_BUDGET", "teto de chamadas atingido"))
      return
    }
    const before = provider.records.length
    const logBefore = logs.length
    let reasons: string[] = []
    let rejections: MentorRejection[] = []
    const r = await generateMentorAnalysis(PILOT_USER, ctx, {
      provider, config: cfg, store, promptVersion: version, log: (e) => logs.push(e),
      onRejected: (rs, rj) => {
        reasons = rs
        rejections = rj ?? []
      },
    })
    const callRecords = provider.records.slice(before)
    const rec = callRecords[callRecords.length - 1]
    const ev = logs.slice(logBefore).find((e) => e.outcome !== "cache_hit") ?? logs[logs.length - 1]
    const budgetHit = callRecords.length === 0 && ev?.providerErrorCode === BUDGET_EXHAUSTED
    let assessment: MentorQualityAssessment | null = null
    if (r.status === "OK" && rec?.text) {
      try {
        const parsed = { summaryRefs: [], ...(parseMentorAIText(rec.text) as object) } as unknown as MentorAIResponse
        assessment = assessMentorResponse(parsed, buildMentorLLMInput(ctx, version).input)
      } catch {
        assessment = null
      }
    }
    const cached = r.status === "OK" && r.cached
    rows.push({
      section, scenario, promptVersion: version, quality: ctx.contextQuality.level,
      status: budgetHit ? "SKIPPED_BUDGET" : r.status, detail: budgetHit ? "teto de chamadas atingido" : detailOf(r),
      failReason: r.status === "FAILED" && !budgetHit ? r.reason : null, outcome: cached ? "cache_hit" : (ev?.outcome ?? null), cached,
      providerMs: cached || callRecords.length === 0 ? null : (ev?.durationMs ?? null), validationMs: cached ? null : (ev?.validationMs ?? null),
      inputTokens: cached ? null : (rec?.usage?.inputTokens ?? null), outputTokens: cached ? null : (rec?.usage?.outputTokens ?? null),
      costUsd: cached ? null : (ev?.estimatedCostUsd ?? null), rejections, assessment, providerCalls: callRecords.length,
      rejectionReasons: reasons, rawResponse: rec?.text ?? (rec?.error ? `ERRO ${rec.error}` : null), analysis: r.status === "OK" ? r.analysis : null,
    })
  }

  // A — cenários: v1 e v2 INTERCALADOS no mesmo contexto (cobertura igual se o teto acabar).
  const stores = new Map(versions.map((v) => [v, new MentorAnalysisMemoryStore()]))
  for (const s of PILOT_SCENARIOS) {
    const ctx = s.build()
    for (const version of versions) await run("cenario", s.id, ctx, version, stores.get(version) ?? new MentorAnalysisMemoryStore())
  }
  // B + C — cache: mesmo contexto (hit, sem chamada) e contexto alterado (miss).
  const high = pilotScenario("high").build()
  const changed: StudentMentorContext = {
    ...high,
    disciplines: high.disciplines.map((d, i) => (i === 0 ? { ...d, studyMinutesLast28: (d.studyMinutesLast28 ?? 0) + 30 } : d)),
  }
  for (const version of versions) await run("cache", "high (repetido)", high, version, stores.get(version) ?? new MentorAnalysisMemoryStore())
  for (const version of versions) await run("cache-miss", "high (novo estudo)", changed, version, stores.get(version) ?? new MentorAnalysisMemoryStore())

  // D — duas chamadas simultâneas com o mesmo contexto → uma ida ao provedor.
  if (budget.left > 0) {
    const store = new MentorAnalysisMemoryStore()
    const ctx = pilotScenario("medium").build()
    const before = provider.records.length
    const [a, b] = await Promise.all([
      generateMentorAnalysis(PILOT_USER, ctx, { provider, config, store, promptVersion: v0, log: (e) => logs.push(e) }),
      generateMentorAnalysis(PILOT_USER, ctx, { provider, config, store, promptVersion: v0, log: (e) => logs.push(e) }),
    ])
    rows.push({ ...emptyRow("dedupe", "medium ×2 simultâneo", v0, ctx.contextQuality.level, `${a.status}/${b.status}`, `chamadas ao provedor: ${provider.records.length - before}`), providerCalls: provider.records.length - before })
  } else {
    rows.push(emptyRow("dedupe", "medium ×2 simultâneo", v0, "MEDIUM", "SKIPPED_BUDGET", "teto de chamadas atingido"))
  }

  // E — limite por hora = 1 → a segunda análise (outro contexto) não chama o provedor.
  {
    const store = new MentorAnalysisMemoryStore()
    const tight = { ...config, maxCallsPerHour: 1 }
    await run("rate-limit", "low (1ª)", pilotScenario("low").build(), v0, store, tight)
    await run("rate-limit", "high (2ª, deve bloquear)", pilotScenario("high").build(), v0, store, tight)
  }

  // Métricas do piloto ANTES das falhas forçadas (que usam o provedor falso).
  const metrics = getMentorLLMMetrics()
  const callRows = rows.filter((r) => r.section === "cenario" || r.section === "cache" || r.section === "cache-miss")
  const summaries = versions.map((v) => summarizeVersion(callRows, v))
  const comparison = versions.length === 2 ? compareVersions(rows.filter((r) => r.section === "cenario")) : []
  const s1 = summaries.find((s) => s.promptVersion === "mentor-v1")
  const s2 = summaries.find((s) => s.promptVersion === "mentor-v2")
  const decision = s1 && s2 ? pilotDecision(s1, s2, comparison) : null

  // F — falhas forçadas (provedor falso, sem custo) — todas devem virar FAILED.
  const FAULTS: FakeMentorScenario[] = [
    "INVALID_JSON", "INVALID_SCHEMA", "INVENTED_REFERENCE", "INVENTED_NUMBER", "CAUSALITY", "PROMPT_INJECTION",
    "GENERIC_LOW_VALUE", "HUGE_OUTPUT", "EMPTY_OUTPUT", "TIMEOUT", "HTTP_429", "HTTP_500", "TRUNCATED",
  ]
  for (const name of FAULTS) {
    const fake = new FakeMentorLLMProvider([FakeMentorLLMProvider.scenario(name)])
    const r = await generateMentorAnalysis(PILOT_USER, pilotScenario("high").build(), {
      provider: fake, config, store: new MentorAnalysisMemoryStore(), sleep: async () => undefined,
    })
    rows.push({ ...emptyRow("falha-forcada", name, MENTOR_PROMPT_VERSION, "HIGH", r.status, detailOf(r)), providerCalls: fake.requests.length })
  }

  // Tamanho e tempo (sem rede): entrada, mensagem, prompt e validação de uma resposta válida.
  const sizes = versions.flatMap((version) =>
    PILOT_SCENARIOS.map((sc) => {
      const ctx = sc.build()
      const t0 = performance.now()
      const { input } = buildMentorLLMInput(ctx, version)
      const t1 = performance.now()
      const user = buildMentorUserMessage(input)
      const t2 = performance.now()
      validateMentorAIResponse(buildValidMentorResponse(input), buildAllowedRefs(input))
      const t3 = performance.now()
      return {
        version, scenario: sc.id, inputChars: JSON.stringify(input).length, userMessageChars: user.length,
        systemPromptChars: MENTOR_SYSTEM_PROMPTS[version].length, disciplines: input.disciplines.length, insights: input.insights.length,
        candidates: input.candidates.length, buildMs: round3(t1 - t0), serializeMs: round3(t2 - t1), validateMs: round3(t3 - t2),
      }
    }),
  )
  const repetition = versions.map((version) => ({
    version,
    pairs: crossContextRepetition(rows.filter((r) => r.section === "cenario" && r.promptVersion === version && r.analysis).map((r) => ({
      id: r.scenario, summary: plain(r.analysis?.summary ?? []),
    }))),
  }))

  // Saída
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dir = join("pilot-runs", `${stamp}-${real ? "real" : "dry"}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, "results.json"),
    JSON.stringify(
      { mode: real ? "real" : "dry", provider: provider.name, model: provider.model, versions, maxCalls, providerCalls: provider.records.length, metrics, summaries, comparison, decision, sizes, repetition, rows, logs },
      null,
      2,
    ),
  )
  writeFileSync(join(dir, "evaluation.md"), evaluationSheet(rows, real, provider.model, summaries, comparison, decision))

  out()
  out("seção | cenário | prompt | qualidade | status | detalhe | chamadas | provedor ms | validação ms | tokens in/out")
  for (const r of rows) {
    out(`${r.section} | ${r.scenario} | ${r.promptVersion} | ${r.quality} | ${r.status} | ${r.detail} | ${r.providerCalls} | ${r.providerMs ?? "-"} | ${r.validationMs ?? "-"} | ${r.inputTokens ?? "n/d"}/${r.outputTokens ?? "n/d"}${r.rejectionReasons.length ? ` | rejeição: ${r.rejectionReasons.join("; ")}` : ""}`)
  }
  out()
  for (const s of summaries) out(`resumo ${s.promptVersion}: ${JSON.stringify(s)}`)
  if (comparison.length > 0) {
    out("caso | v1 | v2 | vencedor (provisório) | motivo")
    for (const c of comparison) out(`${c.scenario} | ${c.v1} | ${c.v2} | ${c.winner} | ${c.reason}`)
  }
  if (decision) out(`decisão automática (sem avaliação humana${real ? "" : "; ENSAIO — não vale como evidência"}): ${decisionLabel(decision.keepV2)} — ${decision.reasons.join("; ")}`)
  for (const rep of repetition) out(`repetição entre contextos (${rep.version}): ${rep.pairs.length === 0 ? "nenhum par ≥ 0,8" : `${rep.pairs.length} pares`}`)
  out(`chamadas ao provedor: ${provider.records.length}/${maxCalls}`)
  out(`arquivos: ${join(dir, "results.json")} e ${join(dir, "evaluation.md")}`)
}

function plain(parts: MentorRichText): string {
  return parts
    .map((p) => {
      if (p.kind === "text") return p.value
      if (p.kind === "discipline") return `**${p.name}**`
      return "[dado]"
    })
    .join("")
}

function decisionLabel(keepV2: boolean | null): string {
  if (keepV2 === null) return "indefinida"
  return keepV2 ? "manter v2" : "rever v2"
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

const RUBRIC = [
  "FAITHFULNESS — fiel aos dados?", "CLARITY — clara?", "SPECIFICITY — específica (não genérica)?", "USEFULNESS — útil? (só humano)",
  "ACTIONABILITY — acionável?", "UNCERTAINTY_HANDLING — respeitou a incerteza?", "NON_CAUSALITY — sem causa inventada?", "DATA_GROUNDING — tudo apoiado em fato?",
]

function evaluationSheet(
  rows: RunRow[],
  real: boolean,
  model: string,
  summaries: ReturnType<typeof summarizeVersion>[],
  comparison: ReturnType<typeof compareVersions>,
  decision: ReturnType<typeof pilotDecision> | null,
): string {
  const lines = [
    `# Avaliação humana — piloto ${real ? "real" : "ensaio"} (${model})`,
    "",
    "Contextos sintéticos (sem dado de aluno). Marque cada item; não use outro LLM para avaliar. Rubrica: docs/mentor-ai-evaluation.md.",
    "",
    "## Resumo por versão",
    "",
    "| versão | chamadas | sucesso | falhas | timeouts | rejeitadas | taxa rejeição | cache | latência média / p50 / p95 (ms) | validação média (ms) | tokens médios in/out | custo total (USD) |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...summaries.map((s) => `| ${s.promptVersion} | ${s.providerCalls} | ${s.success} | ${s.failures} | ${s.timeouts} | ${s.rejected} | ${s.rejectionRate ?? "n/d"} | ${s.cacheHits} | ${s.latencyAvgMs ?? "n/d"} / ${s.latencyP50Ms ?? "n/d"} / ${s.latencyP95Ms ?? "n/d"} | ${s.validationAvgMs ?? "n/d"} | ${s.inputTokensAvg ?? "n/d"} / ${s.outputTokensAvg ?? "n/d"} | ${s.costTotalUsd ?? "null"} |`),
    "",
    ...summaries.map((s) => `- Rejeições ${s.promptVersion} por categoria: ${Object.keys(s.rejectionsByCategory).length === 0 ? "nenhuma" : JSON.stringify(s.rejectionsByCategory)}`),
    "",
  ]
  if (comparison.length > 0) {
    lines.push("## v1 × v2 (vencedor PROVISÓRIO — falta a nota humana de utilidade)", "", "| Caso | V1 | V2 | Vencedor | Motivo |", "|---|---|---|---|---|")
    for (const c of comparison) lines.push(`| ${c.scenario} | ${c.v1} | ${c.v2} | ${c.winner} | ${c.reason} |`)
    lines.push("")
  }
  if (decision) lines.push(`**Decisão automática${real ? "" : " (ENSAIO — não vale como evidência)"}:** ${decisionLabel(decision.keepV2)} — ${decision.reasons.join("; ")}`, "")
  const answered = rows.filter((r) => r.section === "cenario" && r.providerCalls > 0)
  for (const r of answered) {
    lines.push(`## ${r.scenario} · ${r.promptVersion} · ${r.quality} → ${r.status}${r.detail ? ` (${r.detail})` : ""}`, "")
    if (r.analysis) {
      lines.push(`- **Resumo (IA):** ${plain(r.analysis.summary)}`, `- **Confiança:** ${r.analysis.confidence}`)
      for (const f of r.analysis.summaryFacts) lines.push(`  - apoio: ${f}`)
      for (const h of r.analysis.highlights) lines.push(`- **Fato:** ${h.fact} → **IA:** ${plain(h.interpretation)}`)
      for (const a of r.analysis.attentionPoints) lines.push(`- **Atenção — fato:** ${a.fact} → **IA:** ${plain(a.text)}`)
      for (const s of r.analysis.recommendations) lines.push(`- **Sugestão:** ${plain(s.title)} — base: ${s.basis} → **IA:** ${plain(s.suggestion)}`)
      if (r.assessment) {
        lines.push("", `Pontuação automática (heurística, 0–1): ${Object.entries(r.assessment.scores).map(([k, v]) => `${k}=${v ?? "humano"}`).join(" · ")}`)
        if (r.assessment.flags.length > 0) lines.push(`Sinais: ${r.assessment.flags.join(", ")}`)
      }
      lines.push("", "| dimensão | 0 | 1 | 2 | nota |", "|---|---|---|---|---|", ...RUBRIC.map((q) => `| ${q} | [ ] | [ ] | [ ] | |`))
    } else {
      lines.push(`- Rejeitada/falhou. Motivos: ${r.rejectionReasons.join("; ") || "-"}`, "", "```", (r.rawResponse ?? "").slice(0, 2000), "```")
      lines.push("", "- Causa provável (preencher): [ ] modelo violou regra · [ ] prompt ambíguo · [ ] validador rígido demais (investigar, NÃO relaxar sem motivo)")
    }
    lines.push("")
  }
  return lines.join("\n")
}

main().catch((e: unknown) => {
  out(`ERRO inesperado: ${e instanceof Error ? e.name : "desconhecido"}`)
  process.exitCode = 1
})
