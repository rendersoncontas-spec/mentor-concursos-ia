import type { SupabaseClient } from "@supabase/supabase-js"

import {
  buildDisciplineIdentity,
  EMPTY_DISCIPLINE_IDENTITY,
  type DisciplineCatalogEntry,
  type DisciplineIdentitySnapshot,
  type PersonalDisciplineName,
} from "@/domain/disciplines/discipline-identity"

/** Ids por consulta `in (...)` (limite prático de URL do PostgREST). */
const ID_BATCH = 100

function isMissingColumn(error: { message?: unknown; code?: unknown } | null | undefined, column: string): boolean {
  if (!error) return false
  const message = String(error.message ?? "")
  return error.code === "42703" || error.code === "PGRST204" || (message.includes(column) && message.includes("does not exist"))
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

async function readCatalog(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{ rows: DisciplineCatalogEntry[]; error: string | null }> {
  const rows: DisciplineCatalogEntry[] = []
  let withCanonical = true
  for (const batch of chunks(ids, ID_BATCH)) {
    let data: Record<string, unknown>[] | null = null
    if (withCanonical) {
      const res = await supabase.from("disciplines").select("id, name, canonical_discipline_id").in("id", batch)
      if (res.error && isMissingColumn(res.error, "canonical_discipline_id")) {
        // Migration G2.12 ainda não aplicada: identidade = o próprio id.
        withCanonical = false
      } else if (res.error) {
        return { rows: [], error: "Não foi possível carregar as matérias." }
      } else {
        data = (res.data ?? []) as Record<string, unknown>[]
      }
    }
    if (!withCanonical) {
      const res = await supabase.from("disciplines").select("id, name").in("id", batch)
      if (res.error) return { rows: [], error: "Não foi possível carregar as matérias." }
      data = (res.data ?? []) as Record<string, unknown>[]
    }
    for (const r of data ?? []) {
      const canonical = r["canonical_discipline_id"]
      rows.push({
        id: String(r["id"]),
        name: String(r["name"] ?? ""),
        canonicalDisciplineId: typeof canonical === "string" && canonical ? canonical : null,
      })
    }
  }
  return { rows, error: null }
}

/**
 * G2.12 — identidade canônica das disciplinas que aparecem nos dados de UM
 * usuário (sessões de estudo, matérias de simulados...).
 *
 * Custo fixo e pequeno: 1 leitura do catálogo pelos ids (em lotes), +1 para
 * as linhas canônicas que ainda não vieram, +1 para os `custom_name` do
 * próprio usuário. Nada de comparação de nomes aqui (sem fuzzy, sem O(n²)): a
 * identidade é a relação gravada em `disciplines.canonical_discipline_id`.
 *
 * Compatível com o banco sem a migration G2.12 (coluna ausente → cada id é a
 * própria identidade) e sem as colunas G1.1 (`custom_name` ausente → nome
 * global).
 */
export async function loadDisciplineIdentity(
  supabase: SupabaseClient,
  userId: string,
  disciplineIds: Iterable<string>,
): Promise<{ data: DisciplineIdentitySnapshot; error: string | null }> {
  const ids = [...new Set([...disciplineIds].filter((id) => typeof id === "string" && id.length > 0))].sort()
  if (ids.length === 0) return { data: EMPTY_DISCIPLINE_IDENTITY, error: null }

  const first = await readCatalog(supabase, ids)
  if (first.error) return { data: EMPTY_DISCIPLINE_IDENTITY, error: first.error }
  const catalog = [...first.rows]

  const loaded = new Set(catalog.map((r) => r.id))
  const missingRoots = [
    ...new Set(
      catalog.map((r) => r.canonicalDisciplineId).filter((id): id is string => !!id && !loaded.has(id)),
    ),
  ].sort()
  if (missingRoots.length > 0) {
    const roots = await readCatalog(supabase, missingRoots)
    if (roots.error) return { data: EMPTY_DISCIPLINE_IDENTITY, error: roots.error }
    catalog.push(...roots.rows)
  }

  // Preferência pessoal do PRÓPRIO usuário (nunca de outro): custom_name.
  const personal: PersonalDisciplineName[] = []
  const allIds = [...new Set(catalog.map((r) => r.id))].sort()
  for (const batch of chunks(allIds, ID_BATCH)) {
    const res = await supabase
      .from("user_disciplines")
      .select("discipline_id, custom_name")
      .eq("user_id", userId)
      .in("discipline_id", batch)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
    if (res.error) {
      if (isMissingColumn(res.error, "custom_name")) break
      // Nome pessoal é cosmético: sem ele, vale o nome global.
      console.error("[loadDisciplineIdentity] custom_name indisponível:", res.error)
      break
    }
    for (const r of (res.data ?? []) as Record<string, unknown>[]) {
      personal.push({
        disciplineId: String(r["discipline_id"]),
        customName: typeof r["custom_name"] === "string" ? (r["custom_name"] as string) : null,
      })
    }
  }

  return { data: buildDisciplineIdentity({ catalog, personal }), error: null }
}
