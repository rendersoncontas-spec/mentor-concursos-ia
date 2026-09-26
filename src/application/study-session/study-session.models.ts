export interface SessionSummary {
  durationMinutes: number
  focusVariation: number
  energyVariation: number
  questionsAnswered: number
  accuracy: number
  // Fase I.6 (M6): a contagem de revisões saiu daqui. Era a anotação do campo
  // "Revisões concluídas" do cronômetro, que nada lia e que sugeria ao aluno ter
  // concluído revisões reais — nenhuma era concluída.
  // Fase I.6 (M1): `igaBefore`/`igaAfter` saíram. `igaBefore` era um placeholder
  // fixo em 0 e `igaAfter` vinha do Global Score do Mentor, cujos componentes não
  // eram medidos. O resumo da sessão passa a ter só o que foi medido de verdade.
  mentorResponse: string
}

export interface SessionCompletionPayload {
  sessionId: string
  planId?: string
  disciplineId?: string
  durationMinutes: number
  
  // Feedback
  energyInitial: number
  energyFinal: number
  focusInitial: number
  focusFinal: number
  interrupted: boolean
  
  // Prática
  questionsAnswered: number
  correctAnswers: number
  wrongAnswers: number
}
