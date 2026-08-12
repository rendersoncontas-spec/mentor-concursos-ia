import type { QuestionAttempt } from "@/domain/questions/types"

/**
 * Motor Heurístico de Performance Score
 * Calcula uma nota holística de 0 a 100 para uma tentativa, pesando as variáveis solicitadas.
 * 
 * @param attempt A tentativa atual
 * @param previousAttempts As tentativas anteriores desta mesma questão pelo usuário
 * @param questionDifficulty Nível de dificuldade da questão (1 a 5)
 * @param estimatedTime Tempo médio estimado para esta questão (segundos)
 */
export function calculatePerformanceScore(
  attempt: QuestionAttempt,
  previousAttempts: { correct: boolean }[],
  questionDifficulty: number = 3,
  estimatedTime: number = 60
): number {
  let score = 0
  
  // 1. BASE: Acerto vs Erro
  if (attempt.correct) {
    score += 50
  } else {
    // Erro, mas damos uns pontinhos de incentivo pela tentativa dependendo da confiança
    score += 10
  }

  // 2. TEMPO DE RESPOSTA (Time Penalty / Bonus)
  const timeRatio = attempt.response_time_seconds / estimatedTime
  if (attempt.correct) {
    if (timeRatio < 0.5) score += 15 // Muito rápido
    else if (timeRatio <= 1.0) score += 10 // No tempo
    else if (timeRatio > 2.0) score -= 5 // Demorou demais
  } else {
    if (timeRatio < 0.2) score -= 10 // Chutou rápido sem ler
  }

  // 3. CONFIANÇA (Confidence Calibration)
  const conf = attempt.confidence_level || 3
  if (attempt.correct) {
    if (conf >= 4) score += 15 // Certeza absoluta
    if (conf <= 2) score -= 5 // Insegurança mesmo acertando
  } else {
    if (conf >= 4) score -= 15 // Excesso de confiança em erro (Pior cenário de aprendizado)
    if (conf <= 2) score += 5 // Sabia que não sabia (Bom para calibração)
  }

  // 4. DIFICULDADE (Difficulty Multiplier)
  if (attempt.correct) {
    // Acertou algo muito difícil = Bônus maior
    score += (questionDifficulty - 1) * 3 
  } else {
    // Errou algo muito fácil = Punição maior
    if (questionDifficulty === 1) score -= 10
  }

  // 5. HISTÓRICO PRÉVIO (Spaced Repetition Impact)
  const previousErrors = previousAttempts.filter(a => !a.correct).length
  if (attempt.correct && previousErrors > 0) {
    // Finalmente acertou algo que errava antes! Grande Bônus!
    score += previousErrors * 5
  } else if (!attempt.correct && previousAttempts.length > 0 && previousAttempts[0]?.correct) {
    // Errou algo que já tinha acertado = Sinal vermelho! Punição.
    score -= 15
  }

  // Clamp entre 0 e 100
  return Math.max(0, Math.min(100, Math.round(score)))
}
