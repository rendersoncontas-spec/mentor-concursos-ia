import { getBaseAggregations } from "./aggregations"
import { getDisciplineRanking } from "./rankings"
import type { AnalyticsContext, Insight } from "./types"

/**
 * Gera uma lista de Insights processando as métricas atuais através de Heurísticas (pré-IA).
 * No futuro, o Payload do `AnalyticsContext` será serializado para o modelo LLM e a IA retornará este array.
 */
export function getAiInsights(ctx: AnalyticsContext): Insight[] {
  return ctx.getCache("ai_insights", () => {
    const insights: Insight[] = []

    // Failsafe: se houver poucos dados
    if (ctx.history.length < 3) {
      return [
        {
          id: "need_more_data",
          title: "Estufa da Inteligência Vazia",
          description:
            "Complete pelo menos 3 sessões de estudo para que o Nomeia comece a analisar seu padrão de aprendizagem.",
          severity: "LOW",
          score: 0,
        },
      ]
    }

    const aggs = getBaseAggregations(ctx)

    // 1. Heurística de Consistência (Streak)
    if (aggs.consecutiveStreak >= 7) {
      insights.push({
        id: "high_consistency",
        title: "Hábito de Ferro",
        description: `Você está há ${aggs.consecutiveStreak} dias seguidos estudando. Esse é o gatilho principal para retenção de longo prazo. Mantenha o ritmo!`,
        severity: "POSITIVE",
        score: 95,
      })
    } else if (aggs.consecutiveStreak === 0 && aggs.totalSessions > 5) {
      insights.push({
        id: "broken_habit",
        title: "Alerta de Quebra de Ritmo",
        description:
          "Sua frequência de estudos oscilou recentemente. Retome com uma sessão curta hoje para religar o cérebro.",
        severity: "MEDIUM",
        score: 40,
        action: { label: "Estudo Livre de 15m", href: "/dashboard" },
      })
    }

    // 2. Heurística de Foco
    if (aggs.averageFocus !== null) {
      if (aggs.averageFocus < 2.5) {
        insights.push({
          id: "low_focus",
          title: "Atenção Dispersa",
          description:
            "Sua média de foco nas sessões recentes caiu bastante. Tente deixar o celular em outro cômodo ou aplicar técnica Pomodoro.",
          severity: "HIGH",
          score: Math.round((aggs.averageFocus / 5) * 100),
          action: { label: "Ajustar Perfil", href: "/profile" },
        })
      } else if (aggs.averageFocus >= 4.0) {
        insights.push({
          id: "high_focus",
          title: "Hiperfoco Ativado",
          description:
            "Excelente qualidade nas sessões. Você está conseguindo manter distrações sob controle.",
          severity: "POSITIVE",
          score: Math.round((aggs.averageFocus / 5) * 100),
        })
      }
    }

    // 3. Heurística de Burnout (Energia vs Interrupções vs Dificuldade)
    // Se interrupções são altas E energia média é baixa = Risco de Burnout
    const interruptRate = aggs.totalSessions > 0 ? aggs.interruptedSessions / aggs.totalSessions : 0
    if (interruptRate > 0.3 && aggs.averageEnergy !== null && aggs.averageEnergy <= 2) {
      insights.push({
        id: "burnout_risk",
        title: "Risco de Exaustão (Burnout)",
        description:
          "Você está interrompendo muitas sessões e reportando baixa energia. Seu cérebro precisa de repouso. Considere reduzir a meta.",
        severity: "CRITICAL",
        score: 85, // 85% de chance de burnout
        action: { label: "Gerar Cronograma Leve", href: "/study-plan" },
      })
    }

    // 4. Heurística de Foco Disciplinar (Qual ele estuda menos, mas está ativo)
    const ranking = getDisciplineRanking(ctx)
    if (ranking.length >= 3) {
      // Pega o último do ranking (que foi estudado pelo menos uma vez, pois está no ranking)
      const leastStudied = ranking[ranking.length - 1]

      // Se a diferença percentual do top 1 para o último for massiva (> 300%)
      const top1 = ranking[0]
      if (top1 && leastStudied && top1.value > leastStudied.value * 3) {
        insights.push({
          id: "neglected_discipline",
          title: "Disciplina Negligenciada",
          description: `Você estuda ${top1.name} massivamente mais que ${leastStudied.name}. Lembre-se que concursos exigem equilíbrio de edital.`,
          severity: "MEDIUM",
          score: 60,
        })
      }
    }

    // Se estiver tudo neutro e sem insights, colocamos um genérico bom
    if (insights.length === 0) {
      insights.push({
        id: "all_good",
        title: "Ritmo Estável",
        description: "O algoritmo não detectou desvios ou riscos. Continue no planejado.",
        severity: "POSITIVE",
        score: 100,
      })
    }

    // Sort: CRITICAL -> HIGH -> MEDIUM -> LOW -> POSITIVE
    const severityWeight: Record<string, number> = {
      CRITICAL: 5,
      HIGH: 4,
      MEDIUM: 3,
      LOW: 2,
      POSITIVE: 1,
    }

    return insights.sort(
      (a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0),
    )
  })
}
