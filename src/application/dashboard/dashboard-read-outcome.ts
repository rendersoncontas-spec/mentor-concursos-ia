// ============================================================================
// Fase I.8 — helpers puros para o Dashboard não confundir "leitura falhou" com
// "não há dado" (o mesmo princípio de I.5/I.6/I.7/I.8 para Revisões,
// Estatísticas e Ranking, aplicado aqui).
//
// Nenhuma das duas funções toca em Supabase, Next.js ou qualquer client — são
// puras, então dá para testar comportamento (não só "existe no código-fonte")
// sem precisar de um ambiente de integração.
// ============================================================================

/** Resultado de uma leitura: o valor a usar (real ou um default seguro para
 * não quebrar os cálculos a jusante) e se essa leitura falhou. */
export interface ReadOutcome<T> {
  value: T
  failed: boolean
}

/**
 * Envolve uma leitura assíncrona (uma Server Action, um serviço, etc.) que
 * hoje é tratada com `.catch(() => fallback)`. A diferença: em vez de perder a
 * informação de que a leitura falhou, `readOrFlag` devolve os dois — o valor
 * seguro para os cálculos e a flag `failed` para a UI decidir mostrar
 * "indisponível" em vez de tratar o fallback como um zero/vazio real.
 */
export async function readOrFlag<T>(promise: Promise<T>, fallback: T): Promise<ReadOutcome<T>> {
  try {
    const value = await promise
    return { value, failed: false }
  } catch {
    return { value: fallback, failed: true }
  }
}

/**
 * Resolve o resultado de um `.select(...).maybeSingle()` do Supabase.
 *
 * PostgREST não lança exceção em erro de leitura: ele devolve
 * `{ data: null, error }`. Antes desta fase, esse `error` nunca era checado
 * nos dois pontos do Dashboard que usam `maybeSingle()` (`profiles` e
 * `user_targets`) — uma falha de leitura virava silenciosamente "não há
 * perfil"/"não há meta ativa", o mesmo resultado de quando a linha realmente
 * não existe.
 *
 * `resolveMaybeSingle` distingue os três casos:
 *   - erro presente            → `{ value: null, failed: true }`
 *   - sem erro, sem linha      → `{ value: null, failed: false }` (ausência real)
 *   - sem erro, linha presente → `{ value: data, failed: false }`
 */
export function resolveMaybeSingle<T>(
  result: { data: T | null; error: unknown } | null | undefined,
): ReadOutcome<T | null> {
  if (result?.error) {
    return { value: null, failed: true }
  }
  return { value: result?.data ?? null, failed: false }
}
