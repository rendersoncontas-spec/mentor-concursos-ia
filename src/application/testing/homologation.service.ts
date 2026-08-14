import type { SupabaseClient } from "@supabase/supabase-js"

import { generateStudyPlan } from "@/application/study-plan/study-plan.service"
import { SessionOrchestrator } from "@/application/study-session/session-orchestrator"

export interface HomologationResult {
  step: string
  status: "SUCCESS" | "FAILED" | "PENDING"
  message: string
  details?: unknown
}

/**
 * Serviço exclusivo para ambiente de testes / homologação.
 * Executa fluxos sistêmicos completos para garantir a sanidade de dados e arquitetura.
 */
export class HomologationService {
  /**
   * Fluxo 1: Criação -> Cronograma -> Sessão -> Analytics/Mentor
   */
  static async runFlow1_FullCycle(
    supabase: SupabaseClient,
    userId: string,
  ): Promise<HomologationResult[]> {
    const logs: HomologationResult[] = []

    try {
      // 1. Gerar Cronograma
      logs.push({
        step: "Gerar Cronograma",
        status: "PENDING",
        message: "Iniciando geração de cronograma",
      })
      const plan = await generateStudyPlan(supabase, userId, "homologation_test")

      if (!plan)
        throw new Error("Falha ao gerar cronograma. O usuário possui disciplinas cadastradas?")
      logs[logs.length - 1] = {
        step: "Gerar Cronograma",
        status: "SUCCESS",
        message: "Cronograma gerado com sucesso",
        details: { planId: plan.id },
      }

      // 2. Simular Resolução de Sessão Perfeita
      logs.push({
        step: "Executar Sessão Orchestrator",
        status: "PENDING",
        message: "Iniciando sessão simulada",
      })
      const sessionResult = await SessionOrchestrator.finalizeSession(supabase, userId, {
        sessionId: `test-session-${Date.now()}`,
        durationMinutes: 45,
        energyInitial: 4,
        energyFinal: 5,
        focusInitial: 3,
        focusFinal: 5,
        interrupted: false,
        questionsAnswered: 20,
        correctAnswers: 18, // 90% Acerto
        wrongAnswers: 2,
        reviewsCompleted: 5,
      })
      logs[logs.length - 1] = {
        step: "Executar Sessão Orchestrator",
        status: "SUCCESS",
        message: "Sessão salva com sucesso via Orchestrator",
        details: sessionResult,
      }

      // 3. Validar IGA e Mentor
      logs.push({
        step: "Validar Mentor",
        status: "PENDING",
        message: "Verificando se o Mentor respondeu",
      })
      if (!sessionResult.mentorResponse) throw new Error("Mentor não gerou resposta após a sessão.")
      logs[logs.length - 1] = {
        step: "Validar Mentor",
        status: "SUCCESS",
        message: "Mentor respondeu com sucesso",
        details: { iga: sessionResult.igaAfter, msg: sessionResult.mentorResponse },
      }
    } catch (e: unknown) {
      logs.push({
        step: "Falha Crítica",
        status: "FAILED",
        message: e instanceof Error ? e.message : "Erro desconhecido",
      })
    }

    return logs
  }

  /**
   * Teste Isolado do Mentor: Energia 5 vs Energia 2
   */
  static async runTest_MentorEnergyDifference(
    supabase: SupabaseClient,
    userId: string,
  ): Promise<HomologationResult[]> {
    const logs: HomologationResult[] = []

    try {
      // Sessão A: Energia 5
      logs.push({
        step: "Sessão A (Energia 5)",
        status: "PENDING",
        message: "Gerando feedback para energia máxima",
      })
      const resA = await SessionOrchestrator.finalizeSession(supabase, userId, {
        sessionId: `test-session-A-${Date.now()}`,
        durationMinutes: 30,
        energyInitial: 5,
        energyFinal: 5,
        focusInitial: 5,
        focusFinal: 5,
        interrupted: false,
        questionsAnswered: 10,
        correctAnswers: 10,
        wrongAnswers: 0,
        reviewsCompleted: 0,
      })
      const msgA = resA.mentorResponse
      logs[logs.length - 1] = {
        step: "Sessão A (Energia 5)",
        status: "SUCCESS",
        message: "Feedback gerado",
        details: { msg: msgA },
      }

      // Sessão B: Energia 2
      logs.push({
        step: "Sessão B (Energia 2)",
        status: "PENDING",
        message: "Gerando feedback para energia mínima",
      })
      const resB = await SessionOrchestrator.finalizeSession(supabase, userId, {
        sessionId: `test-session-B-${Date.now()}`,
        durationMinutes: 30,
        energyInitial: 2,
        energyFinal: 2,
        focusInitial: 2,
        focusFinal: 2,
        interrupted: true,
        questionsAnswered: 10,
        correctAnswers: 2,
        wrongAnswers: 8,
        reviewsCompleted: 0,
      })
      const msgB = resB.mentorResponse
      logs[logs.length - 1] = {
        step: "Sessão B (Energia 2)",
        status: "SUCCESS",
        message: "Feedback gerado",
        details: { msg: msgB },
      }

      // Validação
      logs.push({
        step: "Comparação de Respostas",
        status: "PENDING",
        message: "Verificando se o Mentor diferenciou os cenários",
      })
      if (msgA === msgB) {
        throw new Error(
          "O sistema respondeu com a mesma mensagem para perfis de energia completamente opostos!",
        )
      }
      logs[logs.length - 1] = {
        step: "Comparação de Respostas",
        status: "SUCCESS",
        message: "O sistema reconheceu a diferença de energia/foco e gerou textos distintos.",
      }
    } catch (e: unknown) {
      if (logs.length > 0) {
        const lastLog = logs[logs.length - 1]
        if (lastLog) {
          logs[logs.length - 1] = {
            step: lastLog.step,
            status: "FAILED",
            message: e instanceof Error ? e.message : "Erro desconhecido",
          }
        }
      } else {
        logs.push({
          step: "Início do Teste",
          status: "FAILED",
          message: e instanceof Error ? e.message : "Erro desconhecido",
        })
      }
    }

    return logs
  }
}
