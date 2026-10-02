/**
 * A1.1 — escapa valor interpolado em filtro `.or()` do PostgREST.
 * Reservados da sintaxe (`,` separa condições; `(`/`)` agrupam) vão em string
 * citada com `"`, e curingas do LIKE (`%`, `_`) recebem escape `\` (escape
 * padrão do LIKE no Postgres). Para UUID válido é transparente; para texto
 * arbitrário vira literal inofensivo. Módulo puro (sem "use server") para
 * ser testável e reutilizável.
 */
export function escapePostgrestOrValue(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
  return `"${escaped}"`
}
