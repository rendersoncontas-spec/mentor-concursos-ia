import type { IntelligenceContext } from "@/domain/mentor-ai/mentor-ai.models"

/**
 * Fase I.6 (M1): o prompt também não fala de desempenho. A acurácia geral era 0
 * fixo e a "pior disciplina" saía como `undefined` — o bloco inteiro não tinha
 * consulta por trás e saiu do contrato.
 *
 * Fase I.3: o prompt não fala de revisões. O contexto tinha um bloco de revisão
 * preenchido com zeros fixos (nenhuma consulta o alimentava) e ele entrava aqui
 * como "Atrasadas Críticas: 0" — número inventado chegando ao mentor. O bloco
 * saiu do contrato (mentor-ai.models.ts); se revisões forem integradas ao mentor
 * algum dia, voltam com fonte real.
 */
export class PromptBuilder {
  /**
   * Constrói uma representação legível para humanos e para telemetria heurística.
   */
  static buildHuman(context: IntelligenceContext): string {
    return `Você é o assistente inteligente do Nomeia.
Contexto do Aluno:
Versão Snapshot: ${context.snapshotId}

Estudos:
Minutos na semana: ${context.studyHistory.totalMinutes}
Ofensiva: ${context.studyHistory.streak} dias`
  }

  /**
   * Constrói o contexto denso compactado para economizar tokens em futuras APIs de LLM.
   */
  static buildLLM(context: IntelligenceContext): string {
    // Reduz as chaves e remove formatação
    return JSON.stringify({
      ctxId: context.snapshotId,
      std: context.studyHistory,
    })
  }
}
