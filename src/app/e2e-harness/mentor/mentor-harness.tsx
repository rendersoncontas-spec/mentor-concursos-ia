"use client"

import { useCallback } from "react"

import type { MentorAnalysisResult } from "@/domain/mentor/mentor-ai"
import type { StudentMentorContext } from "@/domain/mentor/student-mentor-context"
import { MentorAnalysisPanel } from "@/features/mentor/components/mentor-analysis-panel"
import { MentorOverview } from "@/features/mentor/components/mentor-overview"

import type { MentorHarnessState } from "./states"

/** Tempo artificial para o estado "carregando" ficar observável no teste. */
const HARNESS_DELAY_MS = 700

/**
 * G2.20 — /mentor com respostas CONTROLADAS no lugar da Server Action:
 * válida (gerada no servidor pelo provedor falso), indisponível, rejeitada
 * pelo validador, timeout, limite e erro inesperado. Estado "disabled" = IA
 * desligada (o bloco não aparece, como para quem não está no piloto).
 */
export function MentorHarness({ context, state, okResult }: { context: StudentMentorContext; state: MentorHarnessState; okResult: MentorAnalysisResult }) {
  const requestAnalysis = useCallback(async (): Promise<MentorAnalysisResult> => {
    // Contador visível ao teste (prova de que duplo clique não gera 2 pedidos).
    const w = window as unknown as { __mentorRequests?: number }
    w.__mentorRequests = (w.__mentorRequests ?? 0) + 1
    await new Promise((r) => setTimeout(r, HARNESS_DELAY_MS))
    switch (state) {
      case "unavailable":
        return { status: "FAILED", reason: "PROVIDER_ERROR" }
      case "rejected":
        return { status: "FAILED", reason: "INVALID_RESPONSE" }
      case "timeout":
        return { status: "FAILED", reason: "TIMEOUT" }
      case "rate":
        return { status: "RATE_LIMITED", retryAfterSeconds: 20 * 60, scope: "HOUR" }
      case "error":
        throw new Error("falha simulada no harness")
      default:
        return okResult
    }
  }, [state, okResult])

  return (
    <div className="flex flex-col min-h-full">
      <div className="page-container py-5 max-w-4xl">
        <h1 className="sr-only">Mentor de estudos (harness E2E)</h1>
        <MentorOverview
          context={context}
          analysisSlot={state === "disabled" ? undefined : <MentorAnalysisPanel quality={context.contextQuality.level} requestAnalysis={requestAnalysis} />}
        />
      </div>
    </div>
  )
}
