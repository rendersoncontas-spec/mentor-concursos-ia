export interface SessionSummary {
  durationMinutes: number
  focusVariation: number
  energyVariation: number
  questionsAnswered: number
  accuracy: number
  reviewsCompleted: number
  igaBefore: number
  igaAfter: number
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
  
  // Revisão
  reviewsCompleted: number
}
