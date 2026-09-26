// ============================================================================
// Repositório de Revisões — a ÚNICA camada que conhece as colunas do banco.
//
// Serviço, actions e UI falam só em tipos de domínio. Toda consulta filtra por
// user_id (além da RLS) e tem limite explícito: nada aqui pode trazer milhares
// de linhas (as contagens usam `head: true`, sem carregar linha alguma).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"

import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"

import type {
  ReviewCounts,
  ReviewItem,
  ReviewMemory,
  ReviewSessionSummary,
  ReviewSourceType,
  ReviewState,
} from "@/domain/reviews/models"
import type { ReviewScheduleEvent } from "@/domain/reviews/review-scheduler"

export type Supabase = SupabaseClient

/** Erro de violação de unicidade no Postgres. */
const UNIQUE_VIOLATION = "23505"

/**
 * REGRA DESTA CAMADA (Fase I.5, achados A2/A3 da auditoria): consulta que FALHOU
 * devolve `null` — nunca `0`, nunca `[]`.
 *
 * Antes, `countActive` devolvia 0 e as listas devolviam `[]` quando o PostgREST
 * respondia erro. O aluno via "Para revisar agora: 0" e "Você não tem revisões
 * agendadas" com o botão de revisar desabilitado, sem nenhuma diferença entre
 * "não há nada" e "não deu para ler". Pior: no encerramento da sessão, uma falha
 * ao ler as respostas fazia o estudo real não ser gravado.
 *
 * `null` significa "a consulta não respondeu" e obriga quem chama a decidir o que
 * fazer; zero e lista vazia voltam a significar só uma coisa: o banco respondeu
 * que não há dados.
 */

export const ITEM_COLUMNS =
  "id, user_id, discipline_id, source_type, source_id, review_stage, stability_score, difficulty, scheduled_days, learning_steps, review_count, lapses_count, last_review_at, next_review_at, suspended_at, archived_at, created_at, updated_at"

/** Teto de itens exibidos por seção da página (a fila não carrega tudo). */
export const LIST_LIMIT = 50

/**
 * Teto de ids por consulta `in (...)`: mantém a leitura abaixo do corte de
 * 1.000 linhas do PostgREST sem depender dele. Acima disso a consulta é
 * dividida pelo chamador (é o caso do catálogo, que pagina de verdade).
 */
const LIST_IN_LIMIT = 900

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/**
 * Regra ÚNICA de "item ativo de revisão": não suspenso e não arquivado.
 *
 * Fase I.3: esta é a definição que a fila de Revisões sempre usou, agora
 * exportada para ser a única fonte da regra. Quem contar itens de revisão em
 * qualquer outro lugar do app (hoje, as Estatísticas) aplica esta função em vez
 * de repetir os filtros à mão — foi essa repetição que fez as Estatísticas
 * contarem como pendente um tópico que o aluno já havia suspendido.
 *
 * Suspenso e arquivado continuam visíveis nas suas próprias listas (`listFlagged`),
 * que por definição filtram o contrário e por isso não usam esta função.
 */
export function activeReviewItemsOnly<Q extends { is(column: string, value: null): Q }>(query: Q): Q {
  return query.is("suspended_at", null).is("archived_at", null)
}

export function mapItemRow(row: Record<string, unknown>): ReviewItem {
  const memory: ReviewMemory = {
    state: (text(row["review_stage"]) || "NEW") as ReviewState,
    stability: num(row["stability_score"], 0),
    difficulty: num(row["difficulty"], 0),
    scheduledDays: num(row["scheduled_days"], 0),
    learningSteps: Math.round(num(row["learning_steps"], 0)),
    reps: Math.round(num(row["review_count"], 0)),
    lapses: Math.round(num(row["lapses_count"], 0)),
    lastReviewAt: nullableText(row["last_review_at"]),
    dueAt: text(row["next_review_at"]) || text(row["created_at"]),
  }
  return {
    id: text(row["id"]),
    userId: text(row["user_id"]),
    disciplineId: text(row["discipline_id"]),
    sourceType: text(row["source_type"]) as ReviewSourceType,
    sourceId: text(row["source_id"]),
    memory,
    suspendedAt: nullableText(row["suspended_at"]),
    archivedAt: nullableText(row["archived_at"]),
    createdAt: text(row["created_at"]),
    updatedAt: text(row["updated_at"]),
  }
}

/** Colunas de memória gravadas a cada resposta. */
function memoryColumns(memory: ReviewMemory, nowIso: string): Record<string, unknown> {
  return {
    review_stage: memory.state,
    stability_score: memory.stability,
    difficulty: memory.difficulty,
    scheduled_days: memory.scheduledDays,
    learning_steps: memory.learningSteps,
    review_count: memory.reps,
    lapses_count: memory.lapses,
    last_review_at: memory.lastReviewAt,
    next_review_at: memory.dueAt,
    updated_at: nowIso,
  }
}

// ─── Origem do conteúdo (tópico/subtópico do edital) ─────────────────────────

export interface EditalSource {
  disciplineId: string
  title: string
  parentTitle: string | null
}

/**
 * Valida a origem contra a hierarquia REAL e devolve a disciplina dona do
 * conteúdo (nunca se confia na disciplina enviada pelo cliente):
 *   EDITAL_TOPIC     → topics.id     → topics.discipline_id
 *   EDITAL_SUBTOPIC  → subtopics.id  → subtopics.topic_id → topics.discipline_id
 * Um tópico personalizado de outro usuário não é visível (RLS de `topics`),
 * então a consulta simplesmente não o encontra.
 */
export async function resolveEditalSource(
  supabase: Supabase,
  sourceType: ReviewSourceType,
  sourceId: string,
): Promise<EditalSource | null> {
  if (sourceType === "EDITAL_TOPIC") {
    const { data } = await supabase
      .from("topics")
      .select("id, name, discipline_id")
      .eq("id", sourceId)
      .maybeSingle()
    if (!data) return null
    return { disciplineId: text(data["discipline_id"]), title: text(data["name"]), parentTitle: null }
  }

  const { data: sub } = await supabase
    .from("subtopics")
    .select("id, name, topic_id")
    .eq("id", sourceId)
    .maybeSingle()
  if (!sub) return null
  const { data: parent } = await supabase
    .from("topics")
    .select("id, name, discipline_id")
    .eq("id", text(sub["topic_id"]))
    .maybeSingle()
  if (!parent) return null
  return {
    disciplineId: text(parent["discipline_id"]),
    title: text(sub["name"]),
    parentTitle: text(parent["name"]),
  }
}

// ─── Itens ───────────────────────────────────────────────────────────────────

export async function findItemBySource(
  supabase: Supabase,
  userId: string,
  sourceType: ReviewSourceType,
  sourceId: string,
): Promise<ReviewItem | null> {
  const { data } = await supabase
    .from("review_items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .maybeSingle()
  return data ? mapItemRow(data as Record<string, unknown>) : null
}

export async function findItemById(
  supabase: Supabase,
  userId: string,
  itemId: string,
): Promise<ReviewItem | null> {
  const { data } = await supabase
    .from("review_items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("id", itemId)
    .maybeSingle()
  return data ? mapItemRow(data as Record<string, unknown>) : null
}

export interface InsertItemInput {
  userId: string
  disciplineId: string
  sourceType: ReviewSourceType
  sourceId: string
  memory: ReviewMemory
  nowIso: string
}

/** Insere o item. `duplicate` quando o aluno já tinha esse conteúdo em revisão. */
export async function insertItem(
  supabase: Supabase,
  input: InsertItemInput,
): Promise<{ item: ReviewItem | null; duplicate: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from("review_items")
    .insert({
      user_id: input.userId,
      discipline_id: input.disciplineId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      ...memoryColumns(input.memory, input.nowIso),
      created_at: input.nowIso,
    })
    .select(ITEM_COLUMNS)
    .maybeSingle()

  if (error) {
    const duplicate = (error as { code?: string }).code === UNIQUE_VIOLATION
    return { item: null, duplicate, error: duplicate ? null : error.message }
  }
  return { item: data ? mapItemRow(data as Record<string, unknown>) : null, duplicate: false, error: null }
}

/**
 * Grava o novo estado SOMENTE se ninguém respondeu no meio do caminho
 * (controle otimista por review_count). `false` = conflito de concorrência:
 * outra aba já respondeu este item e o estado atual não é mais o esperado.
 */
export async function applyMemory(
  supabase: Supabase,
  userId: string,
  itemId: string,
  expectedReps: number,
  memory: ReviewMemory,
  nowIso: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("review_items")
    .update(memoryColumns(memory, nowIso))
    .eq("id", itemId)
    .eq("user_id", userId)
    .eq("review_count", expectedReps)
    .select("id")
    .maybeSingle()
  return Boolean(data)
}

/** Suspende/reativa ou arquiva/restaura. `false` quando o item não é do usuário. */
export async function setItemFlag(
  supabase: Supabase,
  userId: string,
  itemId: string,
  field: "suspended_at" | "archived_at",
  value: string | null,
  nowIso: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("review_items")
    .update({ [field]: value, updated_at: nowIso })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle()
  return Boolean(data)
}

// ─── Contagens e listas da fila ──────────────────────────────────────────────

async function countActive(
  supabase: Supabase,
  userId: string,
  build: (q: ReturnType<typeof baseCountQuery>) => unknown,
): Promise<number | null> {
  const query = baseCountQuery(supabase, userId)
  const result = (await build(query)) as { count: number | null; error: unknown }
  if (result.error) return null
  return result.count ?? 0
}

function baseCountQuery(supabase: Supabase, userId: string) {
  return supabase
    .from("review_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
}

/**
 * Contagens por grupo, sem carregar linhas (`head: true`). Grupos disjuntos:
 * atrasadas (venceu antes de hoje), de hoje (vence hoje e já foi revisado),
 * novas (vence hoje e nunca foi revisado), próximas (vence depois de hoje).
 */
export async function countBuckets(
  supabase: Supabase,
  userId: string,
  dayStartIso: string,
  dayEndIso: string,
): Promise<ReviewCounts | null> {
  const [overdue, today, newItems, upcoming, suspended, archived] = await Promise.all([
    countActive(supabase, userId, (q) =>
      activeReviewItemsOnly(q).lt("next_review_at", dayStartIso),
    ),
    countActive(supabase, userId, (q) =>
      activeReviewItemsOnly(q)
        .gte("next_review_at", dayStartIso)
        .lte("next_review_at", dayEndIso)
        .gt("review_count", 0),
    ),
    countActive(supabase, userId, (q) =>
      activeReviewItemsOnly(q)
        .gte("next_review_at", dayStartIso)
        .lte("next_review_at", dayEndIso)
        .eq("review_count", 0),
    ),
    countActive(supabase, userId, (q) =>
      activeReviewItemsOnly(q).gt("next_review_at", dayEndIso),
    ),
    countActive(supabase, userId, (q) => q.not("suspended_at", "is", null).is("archived_at", null)),
    countActive(supabase, userId, (q) => q.not("archived_at", "is", null)),
  ])
  // Uma contagem que falhou invalida o conjunto: mostrar cinco números certos e
  // um zero inventado seria pior do que dizer que não foi possível carregar.
  if (
    overdue === null ||
    today === null ||
    newItems === null ||
    upcoming === null ||
    suspended === null ||
    archived === null
  ) {
    return null
  }
  return { overdue, today, newItems, upcoming, suspended, archived }
}

export type DueGroup = "OVERDUE" | "TODAY" | "NEW"

/** Uma lista por grupo, na ordem da fila e com limite explícito. */
export async function listDueGroup(
  supabase: Supabase,
  userId: string,
  group: DueGroup,
  dayStartIso: string,
  dayEndIso: string,
  limit: number,
): Promise<ReviewItem[] | null> {
  if (limit <= 0) return []
  let query = activeReviewItemsOnly(
    supabase.from("review_items").select(ITEM_COLUMNS).eq("user_id", userId),
  )

  if (group === "OVERDUE") query = query.lt("next_review_at", dayStartIso)
  else {
    query = query.gte("next_review_at", dayStartIso).lte("next_review_at", dayEndIso)
    query = group === "TODAY" ? query.gt("review_count", 0) : query.eq("review_count", 0)
  }

  const { data, error } = await query
    .order("next_review_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit)
  if (error) return null
  return (data ?? []).map((row) => mapItemRow(row as Record<string, unknown>))
}

export async function listUpcoming(
  supabase: Supabase,
  userId: string,
  dayEndIso: string,
  limit: number,
): Promise<ReviewItem[] | null> {
  const { data, error } = await activeReviewItemsOnly(
    supabase.from("review_items").select(ITEM_COLUMNS).eq("user_id", userId),
  )
    .gt("next_review_at", dayEndIso)
    .order("next_review_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit)
  if (error) return null
  return (data ?? []).map((row) => mapItemRow(row as Record<string, unknown>))
}

export async function listFlagged(
  supabase: Supabase,
  userId: string,
  field: "suspended_at" | "archived_at",
  limit: number,
): Promise<ReviewItem[] | null> {
  let query = supabase
    .from("review_items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .not(field, "is", null)
  if (field === "suspended_at") query = query.is("archived_at", null)
  const { data, error } = await query
    .order(field, { ascending: false })
    .order("id", { ascending: true })
    .limit(limit)
  if (error) return null
  return (data ?? []).map((row) => mapItemRow(row as Record<string, unknown>))
}

/** Próximo item da fila, na ordem: atrasadas → de hoje → novas. */
export async function nextDueItem(
  supabase: Supabase,
  userId: string,
  dayStartIso: string,
  dayEndIso: string,
): Promise<{ item: ReviewItem | null } | null> {
  for (const group of ["OVERDUE", "TODAY", "NEW"] as const) {
    const rows = await listDueGroup(supabase, userId, group, dayStartIso, dayEndIso, 1)
    // Leitura que falhou não pode virar "fila vazia" (Fase I.5, achado A2).
    if (rows === null) return null
    const [item] = rows
    if (item) return { item }
  }
  return { item: null }
}

/** Primeiro vencimento futuro (para "próxima revisão" quando a fila está vazia). */
/**
 * Próximo vencimento futuro. `null` = a consulta falhou; `{ dueAt: null }` = a
 * consulta respondeu que não há próxima revisão. São coisas diferentes e a UI
 * precisa saber qual das duas aconteceu.
 */
export async function nextDueAfter(
  supabase: Supabase,
  userId: string,
  afterIso: string,
): Promise<{ dueAt: string | null } | null> {
  const { data, error } = await activeReviewItemsOnly(
    supabase.from("review_items").select("next_review_at").eq("user_id", userId),
  )
    .gt("next_review_at", afterIso)
    .order("next_review_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return { dueAt: data ? nullableText(data["next_review_at"]) : null }
}

// ─── Nomes do conteúdo (ficam nas tabelas de origem) ─────────────────────────

export interface ResolvedNames {
  titleBySource: Map<string, { title: string; parentTitle: string | null }>
  disciplineNames: Map<string, string>
}

export async function resolveNames(supabase: Supabase, items: ReviewItem[]): Promise<ResolvedNames> {
  const titleBySource = new Map<string, { title: string; parentTitle: string | null }>()
  const disciplineNames = new Map<string, string>()
  if (items.length === 0) return { titleBySource, disciplineNames }

  const topicIds = [...new Set(items.filter((i) => i.sourceType === "EDITAL_TOPIC").map((i) => i.sourceId))]
  const subtopicIds = [...new Set(items.filter((i) => i.sourceType === "EDITAL_SUBTOPIC").map((i) => i.sourceId))]
  const disciplineIds = [...new Set(items.map((i) => i.disciplineId).filter(Boolean))]

  const [topicsRes, subtopicsRes, discRes] = await Promise.all([
    topicIds.length > 0
      ? supabase.from("topics").select("id, name").in("id", topicIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    subtopicIds.length > 0
      ? supabase.from("subtopics").select("id, name, topic_id").in("id", subtopicIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    disciplineIds.length > 0
      ? supabase.from("disciplines").select("id, name").in("id", disciplineIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  ;((topicsRes.data ?? []) as Record<string, unknown>[]).forEach((row) => {
    titleBySource.set(text(row["id"]), { title: text(row["name"]), parentTitle: null })
  })

  const parentIds = [
    ...new Set(((subtopicsRes.data ?? []) as Record<string, unknown>[]).map((row) => text(row["topic_id"]))),
  ].filter(Boolean)
  const parentNames = new Map<string, string>()
  if (parentIds.length > 0) {
    const { data: parents } = await supabase.from("topics").select("id, name").in("id", parentIds)
    ;((parents ?? []) as Record<string, unknown>[]).forEach((row) =>
      parentNames.set(text(row["id"]), text(row["name"])),
    )
  }
  ;((subtopicsRes.data ?? []) as Record<string, unknown>[]).forEach((row) => {
    titleBySource.set(text(row["id"]), {
      title: text(row["name"]),
      parentTitle: parentNames.get(text(row["topic_id"])) ?? null,
    })
  })
  ;((discRes.data ?? []) as Record<string, unknown>[]).forEach((row) =>
    disciplineNames.set(text(row["id"]), text(row["name"])),
  )

  return { titleBySource, disciplineNames }
}

// ─── Eventos (review_history: append-only) ───────────────────────────────────

export interface ExistingEvent {
  id: string
  reviewItemId: string
}

export async function findEventByOperation(
  supabase: Supabase,
  userId: string,
  clientOperationId: string,
): Promise<ExistingEvent | null> {
  const { data } = await supabase
    .from("review_history")
    .select("id, review_item_id")
    .eq("user_id", userId)
    .eq("client_operation_id", clientOperationId)
    .maybeSingle()
  return data ? { id: text(data["id"]), reviewItemId: text(data["review_item_id"]) } : null
}

export interface InsertEventInput {
  userId: string
  itemId: string
  sessionId: string
  event: ReviewScheduleEvent
  durationSeconds: number
  clientOperationId: string | null
}

/** Insere o evento. `duplicate` = a mesma operação já havia sido registrada. */
export async function insertEvent(
  supabase: Supabase,
  input: InsertEventInput,
): Promise<{ duplicate: boolean; error: string | null }> {
  const { event } = input
  const { error } = await supabase.from("review_history").insert({
    user_id: input.userId,
    review_item_id: input.itemId,
    session_id: input.sessionId,
    review_date: event.reviewedAt,
    grade: event.grade,
    duration_seconds: Math.max(0, Math.round(input.durationSeconds)),
    elapsed_days: event.elapsedDays,
    scheduled_days: event.scheduledDays,
    state_before: event.stateBefore,
    state_after: event.stateAfter,
    stability_before: event.stabilityBefore,
    stability_after: event.stabilityAfter,
    difficulty_before: event.difficultyBefore,
    difficulty_after: event.difficultyAfter,
    due_before: event.dueBefore,
    due_after: event.dueAfter,
    early: event.early,
    client_operation_id: input.clientOperationId,
  })
  if (error) {
    const duplicate = (error as { code?: string }).code === UNIQUE_VIOLATION
    return { duplicate, error: duplicate ? null : error.message }
  }
  return { duplicate: false, error: null }
}

/**
 * Quantas respostas a sessão tem. `null` = a contagem não pôde ser lida — quem
 * chama NÃO deve gravar 0 em `review_sessions.items_answered` (Fase I.5, A3/M4:
 * esse zero chegava a ser persistido e a sessão passava a mentir o progresso).
 */
export async function countSessionAnswers(
  supabase: Supabase,
  userId: string,
  sessionId: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from("review_history")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("session_id", sessionId)
  if (error) return null
  return count ?? 0
}

export interface SessionAnswer {
  reviewItemId: string
  grade: number
}

/**
 * Respostas de uma sessão (limite explícito: uma rodada humana é finita).
 *
 * `null` = a leitura FALHOU. Antes devolvia `[]`, e era esse `[]` que fazia o
 * encerramento tratar uma sessão respondida como sessão vazia e não gravar o
 * estudo — o bug A3 da auditoria. Lista vazia agora significa só uma coisa: o
 * banco respondeu que essa sessão não tem respostas.
 */
export async function listSessionAnswers(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  limit = 1000,
): Promise<SessionAnswer[] | null> {
  const { data, error } = await supabase
    .from("review_history")
    .select("review_item_id, grade")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("review_date", { ascending: true })
    .limit(limit)
  if (error) return null
  return (data ?? []).map((row) => ({
    reviewItemId: text((row as Record<string, unknown>)["review_item_id"]),
    grade: Math.round(num((row as Record<string, unknown>)["grade"], 0)),
  }))
}

/** Notas das respostas recentes, para a retenção medida. */
export async function recentGrades(
  supabase: Supabase,
  userId: string,
  sinceIso: string,
  limit = 1000,
): Promise<number[] | null> {
  const { data, error } = await supabase
    .from("review_history")
    .select("grade")
    .eq("user_id", userId)
    .gte("review_date", sinceIso)
    .order("review_date", { ascending: false })
    .limit(limit)
  if (error) return null
  return (data ?? []).map((row) => Math.round(num((row as Record<string, unknown>)["grade"], 0)))
}

/**
 * Disciplinas dos itens respondidos, para derivar a disciplina do estudo.
 * `null` = leitura falhou (sem isso, a falha viraria "nenhuma disciplina" e o
 * estudo da sessão não seria gravado).
 */
export async function disciplinesOfItems(
  supabase: Supabase,
  userId: string,
  itemIds: string[],
): Promise<string[] | null> {
  if (itemIds.length === 0) return []
  const ids = itemIds.slice(0, LIST_IN_LIMIT)
  const { data, error } = await supabase
    .from("review_items")
    .select("discipline_id")
    .eq("user_id", userId)
    .in("id", ids)
    .limit(ids.length)
  if (error) return null
  return (data ?? []).map((row) => text((row as Record<string, unknown>)["discipline_id"])).filter(Boolean)
}

// ─── Sessões ─────────────────────────────────────────────────────────────────

function mapSession(row: Record<string, unknown>): ReviewSessionSummary {
  return {
    id: text(row["id"]),
    status: (text(row["status"]) || "ACTIVE") as ReviewSessionSummary["status"],
    startedAt: text(row["started_at"]),
    finishedAt: nullableText(row["finished_at"]),
    itemsAnswered: Math.round(num(row["items_answered"], 0)),
  }
}

const SESSION_COLUMNS = "id, user_id, status, started_at, finished_at, items_answered"

export async function findActiveSession(
  supabase: Supabase,
  userId: string,
): Promise<ReviewSessionSummary | null> {
  const { data } = await supabase
    .from("review_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? mapSession(data as Record<string, unknown>) : null
}

export async function findSessionById(
  supabase: Supabase,
  userId: string,
  sessionId: string,
): Promise<ReviewSessionSummary | null> {
  const { data } = await supabase
    .from("review_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle()
  return data ? mapSession(data as Record<string, unknown>) : null
}

/** Cria a sessão. O índice único (um ACTIVE por usuário) resolve a corrida. */
export async function createSession(
  supabase: Supabase,
  userId: string,
  nowIso: string,
): Promise<{ session: ReviewSessionSummary | null; duplicate: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from("review_sessions")
    .insert({ user_id: userId, status: "ACTIVE", started_at: nowIso, items_answered: 0 })
    .select(SESSION_COLUMNS)
    .maybeSingle()
  if (error) {
    const duplicate = (error as { code?: string }).code === UNIQUE_VIOLATION
    return { session: null, duplicate, error: duplicate ? null : error.message }
  }
  return { session: data ? mapSession(data as Record<string, unknown>) : null, duplicate: false, error: null }
}

export async function setSessionAnswered(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  itemsAnswered: number,
): Promise<void> {
  await supabase
    .from("review_sessions")
    .update({ items_answered: itemsAnswered })
    .eq("id", sessionId)
    .eq("user_id", userId)
}

export async function discardSession(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  nowIso: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("review_sessions")
    .update({ status: "DISCARDED", finished_at: nowIso })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .select("id")
    .maybeSingle()
  return Boolean(data)
}

// ─── Catálogo do edital (para "Adicionar à revisão") ─────────────────────────

export interface CatalogDiscipline {
  id: string
  name: string
}

export interface CatalogTopic {
  id: string
  name: string
  subtopics: { id: string; name: string }[]
}

/**
 * Disciplinas do aluno (as que ele já cadastrou), em ordem alfabética.
 *
 * `null` = a consulta falhou (Fase I.6): devolver `[]` fazia o modal dizer
 * "Nenhuma disciplina cadastrada" para quem tem disciplinas de sobra.
 */
export async function listUserDisciplines(
  supabase: Supabase,
  userId: string,
): Promise<CatalogDiscipline[] | null> {
  const { data, error } = await supabase
    .from("user_disciplines")
    .select("discipline_id, disciplines ( id, name )")
    .eq("user_id", userId)
    .limit(300)
  if (error) return null
  const map = new Map<string, string>()
  ;((data ?? []) as Record<string, unknown>[]).forEach((row) => {
    const joined = row["disciplines"] as { id?: string; name?: string } | Array<{ id?: string; name?: string }> | null
    const discipline = Array.isArray(joined) ? joined[0] : joined
    const id = text(discipline?.id ?? row["discipline_id"])
    if (id) map.set(id, text(discipline?.name) || "Disciplina")
  })
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/** Tópicos (e subtópicos) de uma disciplina no catálogo do edital. */
export async function listTopicTree(
  supabase: Supabase,
  disciplineId: string,
): Promise<CatalogTopic[] | null> {
  const { data: topics, error } = await supabase
    .from("topics")
    .select("id, name")
    .eq("discipline_id", disciplineId)
    .order("name", { ascending: true })
    .limit(500)
  // Fase I.6: erro → null (não deu para ler); lista vazia → a disciplina não tem
  // tópicos cadastrados, que é informação legítima.
  if (error) return null
  if (!topics || topics.length === 0) return []

  const topicIds = (topics as Record<string, unknown>[]).map((row) => text(row["id"]))
  // Paginado: uma disciplina grande passa de 1.000 subtópicos e um `.limit()`
  // maior que isso seria cortado em silêncio pelo PostgREST (regra da Fase F.1).
  const { data: subtopics } = await fetchAllRowsPaged<Record<string, unknown>>(
    (withCount) =>
      supabase
        .from("subtopics")
        .select("id, name, topic_id", countOption(withCount))
        .in("topic_id", topicIds),
    [
      { column: "name", ascending: true },
      { column: "id", ascending: true },
    ],
  )

  const byTopic = new Map<string, { id: string; name: string }[]>()
  ;((subtopics ?? []) as Record<string, unknown>[]).forEach((row) => {
    const parent = text(row["topic_id"])
    const list = byTopic.get(parent) ?? []
    list.push({ id: text(row["id"]), name: text(row["name"]) })
    byTopic.set(parent, list)
  })

  return (topics as Record<string, unknown>[]).map((row) => {
    const id = text(row["id"])
    return { id, name: text(row["name"]), subtopics: byTopic.get(id) ?? [] }
  })
}

/**
 * Quais conteúdos da disciplina o aluno já tem em revisão (para a UI não
 * oferecer de novo). Consulta pela disciplina, e não pela lista de ids da
 * árvore: uma disciplina grande passa de mil tópicos+subtópicos, e mandar todos
 * num `in (...)` faria a consulta ser cortada — aqui o resultado é o conjunto
 * REAL de itens do aluno naquela disciplina, paginado, quase sempre pequeno.
 */
export async function listExistingSourceIds(
  supabase: Supabase,
  userId: string,
  disciplineId: string,
): Promise<Set<string>> {
  const { data, error } = await fetchAllRowsPaged<Record<string, unknown>>(
    (withCount) =>
      supabase
        .from("review_items")
        .select("source_id", countOption(withCount))
        .eq("user_id", userId)
        .eq("discipline_id", disciplineId),
    [{ column: "source_id", ascending: true }],
  )
  if (error) return new Set()
  return new Set((data ?? []).map((row) => text(row["source_id"])))
}
