import type { ReviewCatalogTopic } from "@/application/review-engine/review.service"
import type {
  ReviewBucket,
  ReviewCard,
  ReviewCounts,
  ReviewItemView,
  ReviewSessionReport,
  ReviewSessionState,
  ReviewsOverview,
} from "@/domain/reviews/models"
import type { ReviewActions } from "@/features/reviews/review-actions"

/**
 * G2.24 — Revisões SINTÉTICAS e com estado (na memória do navegador, por
 * instância do harness): suspender/reativar/arquivar/restaurar movem o item de
 * lista; responder um card o tira da fila; adicionar tópico muda o catálogo.
 * Nenhum dado pessoal e nenhuma chamada de rede.
 *
 * Estados: `data`, `empty` (o banco respondeu "nenhum item"), `error` (a leitura
 * falhou: `counts: null`, e continua falhando), `retry` (falha na página, mas
 * "Tentar novamente" funciona), `catalog-error` (revisões ok, catálogo falha),
 * `session-error` (revisões ok, iniciar sessão falha).
 */
export type ReviewsHarnessState = "data" | "empty" | "error" | "retry" | "catalog-error" | "session-error"

const DISCIPLINES = [
  { id: "d0a1b2c3-0001-4000-8000-000000000001", name: "Língua Portuguesa" },
  { id: "d0a1b2c3-0002-4000-8000-000000000002", name: "Contabilidade Geral" },
  { id: "d0a1b2c3-0003-4000-8000-000000000003", name: "Direito Tributário" },
] as const

const HOUR = 3_600_000
const DAY = 24 * HOUR

function stateOf(dueOffsetMs: number, n: number): ReviewItemView["state"] {
  if (dueOffsetMs > 0) return "REVIEW"
  return n % 2 ? "NEW" : "LEARNING"
}

function retentionOf(empty: boolean, answered: number, remembered: number) {
  if (answered > 0) return { rate: remembered / answered, answered }
  return empty ? { rate: null, answered: 0 } : { rate: 0.82, answered: 34 }
}

function bucketFor(state: ReviewItemView["state"], dueMs: number): ReviewBucket {
  if (state === "NEW") return "NEW"
  return dueMs < Date.now() - 12 * HOUR ? "OVERDUE" : "TODAY"
}

/** Instante fixo da renderização (o servidor passa o mesmo ISO ao navegador: sem divergência de hidratação). */
let NOW = Date.now()

function makeItem(
  n: number,
  title: string,
  parentTitle: string | null,
  disciplineIndex: number,
  dueOffsetMs: number,
  overrides: Partial<ReviewItemView> = {},
): ReviewItemView {
  const d = DISCIPLINES[disciplineIndex] ?? DISCIPLINES[0]
  return {
    id: `7e710000-${String(n).padStart(4, "0")}-4000-8000-000000000000`,
    sourceType: parentTitle ? "EDITAL_SUBTOPIC" : "EDITAL_TOPIC",
    sourceId: `50c00000-${String(n).padStart(4, "0")}-4000-8000-000000000000`,
    title,
    parentTitle,
    disciplineId: d.id,
    disciplineName: d.name,
    state: stateOf(dueOffsetMs, n),
    dueAt: new Date(NOW + dueOffsetMs).toISOString(),
    lastReviewAt: dueOffsetMs > 0 || n % 2 === 0 ? new Date(NOW - 3 * DAY).toISOString() : null,
    reps: dueOffsetMs > 0 || n % 2 === 0 ? 2 : 0,
    lapses: 0,
    stability: 4,
    suspendedAt: null,
    archivedAt: null,
    ...overrides,
  }
}

function seedItems(): { due: ReviewItemView[]; upcoming: ReviewItemView[]; suspended: ReviewItemView[]; archived: ReviewItemView[] } {
  return {
    due: [
      makeItem(1, "Concordância verbal", null, 0, -3 * DAY),
      makeItem(2, "Depreciação linear", "Ativo imobilizado", 1, -2 * HOUR),
      makeItem(3, "Imunidade tributária", null, 2, -1 * HOUR),
    ],
    upcoming: [
      makeItem(4, "Crase", null, 0, 2 * DAY),
      makeItem(5, "Regime de competência", null, 1, 9 * DAY),
    ],
    suspended: [makeItem(6, "Sintaxe do período composto", null, 0, 5 * DAY, { suspendedAt: new Date(NOW).toISOString() })],
    archived: [makeItem(7, "Princípio da legalidade", null, 2, 12 * DAY, { archivedAt: new Date(NOW).toISOString() })],
  }
}

export function createFakeReviewActions(state: ReviewsHarnessState, nowIso: string): { actions: ReviewActions; initial: ReviewsOverview } {
  NOW = new Date(nowIso).getTime()
  const lists = state === "empty" ? { due: [], upcoming: [], suspended: [], archived: [] } : seedItems()
  const due: ReviewItemView[] = lists.due
  const upcoming: ReviewItemView[] = lists.upcoming
  const suspended: ReviewItemView[] = lists.suspended
  const archived: ReviewItemView[] = lists.archived
  let answered = 0
  let remembered = 0
  let sessionQueue: string[] | null = null
  let sessionId = 0
  let overviewCalls = 0
  let failed = state === "error" || state === "retry"

  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 120))
  const findAnywhere = (id: string) => [...due, ...upcoming, ...suspended, ...archived].find((i) => i.id === id)
  const removeFrom = (list: ReviewItemView[], id: string) => {
    const index = list.findIndex((i) => i.id === id)
    return index >= 0 ? (list.splice(index, 1)[0] ?? null) : null
  }

  const counts = (): ReviewCounts => ({
    overdue: due.filter((i) => new Date(i.dueAt).getTime() < Date.now() - 12 * HOUR).length,
    today: due.filter((i) => i.state !== "NEW" && new Date(i.dueAt).getTime() >= Date.now() - 12 * HOUR).length,
    newItems: due.filter((i) => i.state === "NEW" && new Date(i.dueAt).getTime() >= Date.now() - 12 * HOUR).length,
    upcoming: upcoming.length,
    suspended: suspended.length,
    archived: archived.length,
  })

  const snapshot = (): ReviewsOverview => ({
    counts: failed ? null : counts(),
    due: failed ? [] : [...due],
    upcoming: failed ? [] : [...upcoming],
    suspended: failed ? [] : [...suspended],
    archived: failed ? [] : [...archived],
    nextDueAt: upcoming[0]?.dueAt ?? null,
    retention: retentionOf(state === "empty", answered, remembered),
    hasActiveSession: false,
  })

  const bucketOf = (item: ReviewItemView): ReviewBucket =>
    bucketFor(item.state, new Date(item.dueAt).getTime())

  const cardOf = (item: ReviewItemView): ReviewCard => ({
    itemId: item.id,
    sourceType: item.sourceType,
    title: item.title,
    parentTitle: item.parentTitle,
    disciplineName: item.disciplineName,
    state: item.state,
    bucket: bucketOf(item),
    dueAt: item.dueAt,
    reps: item.reps,
    lapses: item.lapses,
    previews: [
      { grade: 1, label: "Errei", preview: "10 min" },
      { grade: 2, label: "Difícil", preview: "1 dia" },
      { grade: 3, label: "Bom", preview: "3 dias" },
      { grade: 4, label: "Fácil", preview: "7 dias" },
    ],
  })

  const sessionState = (): ReviewSessionState => {
    const next = sessionQueue?.[0] ? findAnywhere(sessionQueue[0]) : null
    return {
      sessionId: `5e550000-${String(sessionId).padStart(4, "0")}-4000-8000-000000000000`,
      itemsAnswered: answered,
      remaining: sessionQueue?.length ?? 0,
      card: next ? cardOf(next) : null,
    }
  }

  const catalogTopics: ReviewCatalogTopic[] = [
    { id: "c0000000-0001-4000-8000-000000000001", name: "Pontuação", inReview: false, subtopics: [{ id: "c0000000-0001-4000-8000-0000000000a1", name: "Vírgula", inReview: false }] },
    { id: "c0000000-0002-4000-8000-000000000002", name: "Concordância verbal", inReview: true, subtopics: [] },
  ]

  const actions: ReviewActions = {
    async getReviewsOverviewAction() {
      await delay()
      overviewCalls += 1
      if (state === "retry") failed = false // a página falhou; "Tentar novamente" funciona
      return { data: snapshot(), error: null }
    },
    async setReviewItemFlagAction(itemId, action) {
      await delay()
      if (action === "SUSPEND") {
        const item = removeFrom(due, itemId) ?? removeFrom(upcoming, itemId)
        if (item) suspended.push({ ...item, suspendedAt: new Date().toISOString() })
      } else if (action === "UNSUSPEND") {
        const item = removeFrom(suspended, itemId)
        if (item) upcoming.push({ ...item, suspendedAt: null })
      } else if (action === "ARCHIVE") {
        const item = removeFrom(suspended, itemId) ?? removeFrom(due, itemId) ?? removeFrom(upcoming, itemId)
        if (item) archived.push({ ...item, archivedAt: new Date().toISOString() })
      } else {
        const item = removeFrom(archived, itemId)
        if (item) upcoming.push({ ...item, archivedAt: null })
      }
      return { data: true, error: null }
    },
    async startReviewSessionAction(itemId) {
      await delay()
      if (state === "session-error") return { data: null, error: "Não foi possível iniciar a sessão (simulado)." }
      sessionId += 1
      sessionQueue = itemId ? [itemId] : due.map((i) => i.id)
      return { data: sessionState(), error: null }
    },
    async getActiveReviewSessionAction() {
      await delay()
      return { data: null, error: null }
    },
    async answerReviewCardAction(input) {
      await delay()
      const id = sessionQueue?.shift()
      if (id) {
        const item = removeFrom(due, id) ?? removeFrom(upcoming, id)
        if (item) {
          answered += 1
          if (input.grade >= 2) remembered += 1
          upcoming.push({ ...item, state: "REVIEW", reps: item.reps + 1, dueAt: new Date(Date.now() + 3 * DAY).toISOString() })
        }
      }
      return { data: { session: sessionState(), duplicate: false, conflict: false }, error: null }
    },
    async finalizeReviewSessionAction() {
      await delay()
      const report: ReviewSessionReport = {
        itemsAnswered: answered,
        remembered,
        forgot: answered - remembered,
        durationMinutes: 4,
        nextDueAt: upcoming[0]?.dueAt ?? null,
        studyRegistered: answered > 0,
        cycleSyncError: null,
      }
      sessionQueue = null
      return { data: report, error: null }
    },
    async getReviewCatalogAction(disciplineId) {
      await delay()
      if (state === "catalog-error") {
        return { data: { disciplines: [], disciplineId: null, topics: [], loadError: true }, error: null }
      }
      return {
        data: {
          disciplines: DISCIPLINES.map((d) => ({ id: d.id, name: d.name })),
          disciplineId: disciplineId ?? DISCIPLINES[0].id,
          topics: catalogTopics,
          loadError: false,
        },
        error: null,
      }
    },
    async addTopicToReviewAction({ sourceId }) {
      await delay()
      const topic = catalogTopics.find((t) => t.id === sourceId)
      if (topic) topic.inReview = true
      for (const t of catalogTopics) {
        const sub = t.subtopics.find((s) => s.id === sourceId)
        if (sub) sub.inReview = true
      }
      const item = makeItem(20 + overviewCalls + answered, topic?.name ?? "Novo tópico", null, 0, -1 * HOUR, { state: "NEW", reps: 0 })
      due.push(item)
      return { data: { item, alreadyExisted: false }, error: null }
    },
  }

  return { actions, initial: snapshot() }
}
