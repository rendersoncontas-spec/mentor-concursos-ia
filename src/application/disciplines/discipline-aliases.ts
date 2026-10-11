import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * G2.14 — listas de seleção sem aliases duplicados.
 *
 * Um alias comprovado (linha com `canonical_discipline_id`) é a MESMA matéria
 * que a canônica: oferecer os dois como opções independentes só leva o aluno
 * a espalhar dados novos em duas linhas. Nas listas de ESCOLHA do catálogo
 * global, o alias sai; a canônica fica. Nada é apagado: registros antigos no
 * alias continuam lá (e as análises os somam pela identidade).
 *
 * Fail-open: sem a coluna (migration G2.12 pendente) ou com erro na leitura, a
 * lista volta completa — nunca some disciplina por falha.
 */
export async function loadCatalogAliasIds(supabase: SupabaseClient): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("disciplines")
      .select("id")
      .not("canonical_discipline_id", "is", null)
      .limit(1000)
    if (error || !data) return new Set()
    return new Set((data as { id: string }[]).map((r) => r.id))
  } catch {
    return new Set()
  }
}

/**
 * Tira da lista as linhas-alias. `keep` = ids que precisam continuar visíveis
 * mesmo sendo alias (ex.: já fazem parte do plano do aluno).
 */
export function hideCatalogAliases<T extends { id: string }>(
  rows: T[],
  aliasIds: ReadonlySet<string>,
  keep: Iterable<string> = [],
): T[] {
  if (aliasIds.size === 0) return rows
  const keepSet = new Set(keep)
  return rows.filter((row) => !aliasIds.has(row.id) || keepSet.has(row.id))
}
