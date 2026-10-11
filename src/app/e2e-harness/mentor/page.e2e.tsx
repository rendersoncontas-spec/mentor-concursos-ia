import type { Metadata } from "next"

import { generateMentorAnalysis, MentorAnalysisMemoryStore } from "@/application/mentor-llm/mentor-analysis.service"
import type { MentorAnalysisResult } from "@/domain/mentor/mentor-ai"
import { FakeMentorLLMProvider } from "@/lib/testing/fake-mentor-llm-provider"
import { pilotScenario } from "@/lib/testing/mentor-pilot-scenarios"

import { MentorHarness } from "./mentor-harness"
import { MENTOR_HARNESS_STATES, type MentorHarnessState } from "./states"

// G2.20 — harness E2E do /mentor: componentes reais, contexto SINTÉTICO, provedor FALSO.
// Só existe com NOMEIA_E2E_HARNESS=1. Nenhuma chamada a LLM, banco ou sessão.
export const metadata: Metadata = { title: "E2E · mentor", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function MentorHarnessPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const s: MentorHarnessState = (MENTOR_HARNESS_STATES as readonly string[]).includes(state ?? "") ? (state as MentorHarnessState) : "valid"
  const scenario = s === "empty" || s === "low" ? s : "high"
  const context = pilotScenario(scenario).build()
  const okResult: MentorAnalysisResult = await generateMentorAnalysis("e2e-harness", context, {
    provider: new FakeMentorLLMProvider([FakeMentorLLMProvider.scenario("VALID_RESPONSE")]),
    config: { timeoutMs: 5_000, maxOutputTokens: 900, maxCallsPerHour: 100, maxCallsPerDay: 100, maxCallsPerDayGlobal: 100, pricing: null },
    store: new MentorAnalysisMemoryStore(),
  })
  return <MentorHarness context={context} state={s} okResult={okResult} />
}
