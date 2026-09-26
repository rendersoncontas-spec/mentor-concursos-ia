// ============================================================================
// Regra ÚNICA de duração de uma sessão de revisão (Fase I.6, achado M8).
//
// O problema que isto resolve: a gravação usava `Math.max(1, Math.round(s/60))` e
// o resumo na tela usava `Math.max(0, Math.round(ms/60000))`. Uma sessão de 20
// segundos gravava 1 minuto em `study_history` (e no ciclo, e nas estatísticas) e
// mostrava "0 min" para o aluno — duas verdades para a mesma sessão.
//
// Unidade oficial do produto: `study_history.duration_minutes` é minuto inteiro,
// arredondado (é o que `study-session.action.ts` faz no fluxo do cronômetro).
// Aqui mantemos exatamente a semântica que o armazenamento já tinha para revisão:
// uma sessão que aconteceu conta pelo menos 1 minuto. Registrar 0 seria pior —
// perderia tempo de estudo real e o ciclo não receberia nada.
//
// O mesmo valor sai desta função para os dois lados: o que é gravado é o que o
// aluno vê. Nenhuma fórmula duplicada.
// ============================================================================

/** Segundos decorridos da sessão. Nunca negativo; datas inválidas viram 0. */
export function reviewSessionSeconds(startedAtIso: string, nowIso: string): number {
  const started = new Date(startedAtIso).getTime()
  const now = new Date(nowIso).getTime()
  if (!Number.isFinite(started) || !Number.isFinite(now)) return 0
  return Math.max(0, Math.round((now - started) / 1000))
}

/**
 * Minutos da sessão, na unidade do `study_history`: minuto inteiro arredondado,
 * com piso de 1 — uma sessão respondida não vale zero minuto de estudo.
 *
 * Use SEMPRE esta função: na gravação do estudo, no resumo mostrado ao aluno e em
 * qualquer número derivado da duração da sessão.
 */
export function reviewSessionMinutes(totalSeconds: number): number {
  if (!Number.isFinite(totalSeconds)) return 1
  return Math.max(1, Math.round(totalSeconds / 60))
}
