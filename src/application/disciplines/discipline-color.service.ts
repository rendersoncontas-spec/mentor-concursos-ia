import type { SupabaseClient } from "@supabase/supabase-js"

import { DISCIPLINE_COLOR_PALETTE } from "@/domain/disciplines/discipline-colors"

const PAGE = 1000

/**
 * Busca todas as cores já em uso na tabela global `disciplines`
 * (paginando por causa do limite do PostgREST).
 */
export async function getUsedDisciplineColors(supabase: SupabaseClient): Promise<Set<string>> {
  const used = new Set<string>()
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from("disciplines")
      .select("color_hex")
      .range(offset, offset + PAGE - 1)
    if (!data || data.length === 0) break
    for (const row of data) {
      if (row.color_hex) used.add(row.color_hex as string)
    }
    if (data.length < PAGE) break
    offset += PAGE
  }
  return used
}

/**
 * Escolhe a próxima cor disponível na paleta para uma disciplina nova:
 * - evita repetir cores já utilizadas no contexto global;
 * - se todas estiverem em uso, reutiliza de forma controlada e determinística.
 * - se a coluna `color_hex` ainda não existir no banco, retorna null
 *   (a disciplina é criada sem cor persistida; o fallback determinístico
 *   continua valendo no frontend até a migration ser aplicada).
 */
export async function pickNextDisciplineColor(supabase: SupabaseClient): Promise<string | null> {
  let used: Set<string>
  try {
    used = await getUsedDisciplineColors(supabase)
  } catch {
    return null
  }
  const free = DISCIPLINE_COLOR_PALETTE.find((c) => !used.has(c))
  if (free) return free
  return DISCIPLINE_COLOR_PALETTE[used.size % DISCIPLINE_COLOR_PALETTE.length] ?? null
}
