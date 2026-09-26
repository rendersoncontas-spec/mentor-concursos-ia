export interface IntelligenceContext {
  version: "1.0.0"
  generatedAt: Date
  snapshotId: string
  userId: string

  // Fase I.6 (achado M1): NÃO existe bloco de performance aqui.
  //
  // Ele era montado no IntelligenceHub com acurácia geral 0 e listas vazias, sem
  // nenhuma consulta por trás, e chegava ao prompt do mentor como "Acurácia
  // Geral: 0%" e "Pior Disciplina: undefined". Mesmo tratamento dado ao bloco de
  // revisões na Fase I.3: o campo sai enquanto não houver medição real. Quando
  // houver, volta junto com a consulta que o alimenta.

  // Fase I.3: NÃO existe bloco de revisões aqui.
  //
  // Existia um bloco de revisões (atrasadas, atrasadas críticas e itens do dia)
  // preenchido com zeros fixos no IntelligenceHub — nenhuma consulta alimentava
  // esses números, e eles chegavam ao prompt do mentor como se fossem medidos
  // ("Atrasadas Críticas: 0" mesmo com a fila de revisões cheia).
  //
  // Como as revisões vivem somente na própria área (decisão D6), a correção foi
  // remover o campo em vez de inventar uma integração: o mentor não fala de
  // revisões, em vez de falar delas com números falsos. Se um dia isso entrar no
  // roadmap, o campo volta junto com a consulta real que o preenche — nunca
  // antes dela.

  // Histórico de Estudos (Últimos 7 dias)
  studyHistory: {
    totalMinutes: number
    averageEnergy: number
    averageFocus: number
    daysStudied: number
    streak: number
  }

  // Plano e Metas
  goals: {
    /**
     * Meta semanal de horas do aluno. `null` = ele não configurou nenhuma.
     *
     * Fase I.6 (achado M2): aqui havia 20 como valor inicial, então quem nunca
     * definiu meta aparecia para o mentor com "meta semanal: 20h" — um número
     * que o aluno nunca escolheu. Ausência agora é ausência.
     */
    weeklyHoursTarget: number | null
    examId?: string
  }
}

// Fase I.6 (achado M1): o "Global Score" (IGA) foi REMOVIDO.
//
// Ele era a média de cinco componentes em que três — desempenho, retenção e
// questões — eram a mesma `overallAccuracy`, fixa em 0 no IntelligenceHub; a
// tendência era sempre "STABLE" e a confiança, 85 fixo. Nada disso era medido, e
// o conjunto inteiro (com o componente batizado de "retention", que não tinha
// nenhuma relação com revisões) era persistido em `mentor_history` a cada sessão.
//
// A Fase H já havia deixado de exibi-lo na tela justamente por isso. Agora ele
// também deixa de existir no contrato e de ser gravado. Não foi substituído por
// outro score: quando houver medição real de desempenho, um índice pode voltar
// com base nela — nunca antes.

export interface Insight {
  code: string // Ex: "CRITICAL_BURNOUT"
  value?: number | string | boolean
  priority: number // 0 a 100 (ajuda o Prioritizer)
  severity: "LOW" | "HIGH" | "CRITICAL"
  type: "ACTION" | "ALERT" | "EVOLUTION" | "MOTIVATION"
  sourceModule: string
  message?: string // Tradução em pt-BR preenchida pelo ExplanationEngine
}
