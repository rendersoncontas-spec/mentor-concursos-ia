/**
 * Fase F.2 — payload ENXUTO da lista do Histórico.
 *
 * Antes a tela recebia `select *` + disciplina de cada sessão (≈2,8 MB de JSON
 * para 2.797 sessões) só para listar, filtrar e somar. Aqui entram apenas os
 * campos que a lista, os filtros, o agrupamento por dia e os totais usam
 * (mapeados em history-view.tsx e filter-history-sessions.ts):
 *
 * - colunas: id, started_at, duration_minutes, discipline_id, study_type,
 *   technique, origin_source, origin_source_name, import_batch_id
 *   (+ created_at só quando started_at é nulo — é o fallback de ordenação);
 * - do `metadata`, só as chaves exibidas/somadas/filtradas
 *   (HISTORY_LIST_METADATA_KEYS);
 * - a disciplina (id, name, area) vai UMA vez por disciplina num mapa, não
 *   repetida em cada sessão; `unpackHistoryList` remonta o objeto
 *   `disciplines` de cada linha exatamente como antes.
 *
 * A EDIÇÃO não usa este payload: ao clicar em "Editar", a tela busca a linha
 * completa daquela sessão (getHistorySessionForEditAction) — o modal de edição
 * espalha o `metadata` inteiro no update e lê `notes`, então precisa de tudo.
 */

export const HISTORY_LIST_METADATA_KEYS = [
  "focus_percentage",
  "questions_answered",
  "questions_correct",
  "pages_read",
  "imported_seconds",
  "flashcards_reviewed",
  "flashcards_correct",
] as const

export type HistoryListMetadataKey = (typeof HISTORY_LIST_METADATA_KEYS)[number]

/** Colunas pedidas ao PostgREST (metadados via caminho JSON `->`, sem o objeto inteiro). */
export const HISTORY_LIST_SELECT = [
  "id",
  "started_at",
  "created_at",
  "duration_minutes",
  "discipline_id",
  "study_type",
  "technique",
  "origin_source",
  "origin_source_name",
  "import_batch_id",
  ...HISTORY_LIST_METADATA_KEYS.map((k) => `meta_${k}:metadata->${k}`),
  "disciplines ( id, name, area )",
].join(", ")

export interface HistoryListDiscipline {
  id?: string
  name?: string
  area?: string | null
}

/** Linha como vem do PostgREST com HISTORY_LIST_SELECT. */
export type HistoryListDbRow = {
  id: string
  started_at: string | null
  created_at: string | null
  duration_minutes: number | null
  discipline_id: string | null
  study_type: string | null
  technique: string | null
  origin_source: string | null
  origin_source_name: string | null
  import_batch_id: string | null
  disciplines?: HistoryListDiscipline | HistoryListDiscipline[] | null
} & { [K in `meta_${HistoryListMetadataKey}`]?: unknown }

/** Linha enviada ao navegador. */
export interface HistoryListRow {
  id: string
  started_at: string | null
  created_at?: string | null
  duration_minutes: number | null
  discipline_id: string | null
  study_type: string | null
  technique: string | null
  origin_source: string | null
  origin_source_name: string | null
  import_batch_id: string | null
  metadata: Partial<Record<HistoryListMetadataKey, unknown>>
}

export interface HistoryListPayload {
  rows: HistoryListRow[]
  disciplines: Record<string, HistoryListDiscipline>
}

/** Servidor: linhas do PostgREST → payload enxuto (mesma ordem). */
export function packHistoryList(dbRows: readonly HistoryListDbRow[]): HistoryListPayload {
  const disciplines: Record<string, HistoryListDiscipline> = {}
  const rows: HistoryListRow[] = dbRows.map((r) => {
    const disc = Array.isArray(r.disciplines) ? r.disciplines[0] : r.disciplines
    if (r.discipline_id && disc && !disciplines[r.discipline_id]) {
      disciplines[r.discipline_id] = { ...disc }
    }
    const metadata: Partial<Record<HistoryListMetadataKey, unknown>> = {}
    for (const key of HISTORY_LIST_METADATA_KEYS) {
      const value = r[`meta_${key}`]
      if (value !== null && value !== undefined) metadata[key] = value
    }
    const row: HistoryListRow = {
      id: r.id,
      started_at: r.started_at,
      duration_minutes: r.duration_minutes,
      discipline_id: r.discipline_id,
      study_type: r.study_type,
      technique: r.technique,
      origin_source: r.origin_source,
      origin_source_name: r.origin_source_name,
      import_batch_id: r.import_batch_id,
      metadata,
    }
    // created_at só serve de fallback de ordenação quando não há started_at.
    if (!r.started_at) row.created_at = r.created_at
    return row
  })
  return { rows, disciplines }
}

/** Navegador: payload enxuto → linhas no formato que a tela já usa. */
export function unpackHistoryList(payload: HistoryListPayload): Array<
  HistoryListRow & { disciplines: HistoryListDiscipline | null }
> {
  return payload.rows.map((row) => ({
    ...row,
    disciplines: row.discipline_id ? (payload.disciplines[row.discipline_id] ?? null) : null,
  }))
}
