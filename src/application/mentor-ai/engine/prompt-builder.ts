import type { IntelligenceContext } from "@/domain/mentor-ai/mentor-ai.models"

export class PromptBuilder {
  /**
   * Constrói uma representação legível para humanos e para telemetria heurística.
   */
  static buildHuman(context: IntelligenceContext): string {
    return `Você é o assistente inteligente do Nomeia.
Contexto do Aluno:
Versão Snapshot: ${context.snapshotId}

Performance:
Acurácia Geral: ${context.performance.overallAccuracy}%
Pior Disciplina: ${context.performance.weakestDisciplines[0]}

Estudos:
Minutos na semana: ${context.studyHistory.totalMinutes}
Ofensiva: ${context.studyHistory.streak} dias

Revisões:
Atrasadas Críticas: ${context.reviews.criticalOverdue}`
  }

  /**
   * Constrói o contexto denso compactado para economizar tokens em futuras APIs de LLM.
   */
  static buildLLM(context: IntelligenceContext): string {
    // Reduz as chaves e remove formatação
    return JSON.stringify({
      ctxId: context.snapshotId,
      perf: context.performance,
      rev: context.reviews,
      std: context.studyHistory,
    })
  }
}
