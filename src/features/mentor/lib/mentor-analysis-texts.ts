/**
 * G2.17 — textos e tempos do painel "Análise do Mentor" (módulo puro, sem
 * servidor: testável e importável pelo componente cliente).
 */

/** Maior que o pior caso do servidor (2 tentativas × timeout máx. 30 s + espera). */
export const CLIENT_WATCHDOG_MS = 75_000

export const MENTOR_ANALYSIS_FALLBACK_TEXT =
  "Não foi possível gerar a análise agora. Seus dados continuam disponíveis na visão determinística do Mentor."

function waitText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return minutes < 60 ? `cerca de ${minutes} min` : `cerca de ${Math.ceil(minutes / 60)} h`
}

export function rateLimitText(scope: "HOUR" | "DAY" | "GLOBAL", retryAfterSeconds: number): string {
  if (scope === "GLOBAL") return "A análise por IA atingiu o limite de uso de hoje. Tente de novo mais tarde; o restante do Mentor segue disponível."
  if (scope === "DAY") return `Você atingiu o limite de análises de hoje. Tente de novo em ${waitText(retryAfterSeconds)}.`
  return `Você atingiu o limite de análises por hora. Tente de novo em ${waitText(retryAfterSeconds)}.`
}
