// ============================================================================
// Domínio de Revisões — Fase I.1 (sistema real de repetição espaçada).
//
// A unidade de revisão é um CONTEÚDO DO EDITAL (tópico ou subtópico). O item de
// revisão guarda apenas o estado de memória e o agendamento; o conteúdo continua
// nas tabelas de origem (topics / subtopics).
//
// Flashcards e questões NÃO fazem parte desta entrega (decisões D1/D3/D25): não
// há tipo, tabela nem fluxo para eles aqui.
// ============================================================================

/** Os 4 estados do próprio FSRS. "Atrasado" e "maduro" são derivados, não guardados. */
export type ReviewState = "NEW" | "LEARNING" | "REVIEW" | "RELEARNING"

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  NEW: "Novo",
  LEARNING: "Aprendendo",
  REVIEW: "Em revisão",
  RELEARNING: "Reaprendendo",
}

/** Nota do aluno. 1 = não lembrou; 2 a 4 = lembrou (com esforço decrescente). */
export type ReviewGrade = 1 | 2 | 3 | 4

export const REVIEW_GRADE_LABEL: Record<ReviewGrade, string> = {
  1: "Errei",
  2: "Difícil",
  3: "Bom",
  4: "Fácil",
}

export const REVIEW_GRADES: readonly ReviewGrade[] = [1, 2, 3, 4]

export function isReviewGrade(value: unknown): value is ReviewGrade {
  return value === 1 || value === 2 || value === 3 || value === 4
}

/** Origem do conteúdo revisado (D1/D5): `sourceId` aponta para topics/subtopics. */
export type ReviewSourceType = "EDITAL_TOPIC" | "EDITAL_SUBTOPIC"

export const REVIEW_SOURCE_LABEL: Record<ReviewSourceType, string> = {
  EDITAL_TOPIC: "Tópico",
  EDITAL_SUBTOPIC: "Subtópico",
}

export function isReviewSourceType(value: unknown): value is ReviewSourceType {
  return value === "EDITAL_TOPIC" || value === "EDITAL_SUBTOPIC"
}

/**
 * Estado de memória de um item — exatamente o que o agendador lê e escreve, e o
 * que `review_items` persiste. Nenhum campo derivado ou de exibição aqui.
 */
export interface ReviewMemory {
  state: ReviewState
  /** S do FSRS, em dias. */
  stability: number
  /** D do FSRS, de 1 a 10. */
  difficulty: number
  /** Intervalo em dias agendado pela última resposta (0 nos passos de minutos). */
  scheduledDays: number
  /** Passo atual de (re)aprendizagem; sem ele o item nunca se forma para REVIEW. */
  learningSteps: number
  /** Quantas respostas o item já recebeu. */
  reps: number
  /** Quantas vezes o aluno esqueceu um item que já estava em revisão. */
  lapses: number
  lastReviewAt: string | null
  /** Quando o item volta (o "due"). */
  dueAt: string
}

export interface ReviewItem {
  id: string
  userId: string
  disciplineId: string
  sourceType: ReviewSourceType
  sourceId: string
  memory: ReviewMemory
  suspendedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Item com os nomes resolvidos para exibição (o conteúdo vive na origem). */
export interface ReviewItemView {
  id: string
  sourceType: ReviewSourceType
  sourceId: string
  /** Nome do tópico ou do subtópico. */
  title: string
  /** Para subtópico, o nome do tópico pai. */
  parentTitle: string | null
  disciplineId: string
  disciplineName: string
  state: ReviewState
  dueAt: string
  lastReviewAt: string | null
  reps: number
  lapses: number
  stability: number
  suspendedAt: string | null
  archivedAt: string | null
}

/** Onde o item cai na fila de hoje (derivado da data, no fuso de São Paulo). */
export type ReviewBucket = "OVERDUE" | "TODAY" | "NEW" | "UPCOMING"

export const REVIEW_BUCKET_LABEL: Record<ReviewBucket, string> = {
  OVERDUE: "Atrasada",
  TODAY: "Para hoje",
  NEW: "Nova",
  UPCOMING: "Próxima",
}

export interface ReviewCounts {
  overdue: number
  today: number
  newItems: number
  upcoming: number
  suspended: number
  archived: number
}

/** Retenção medida: respostas "lembrei" ÷ respostas. `rate` null sem respostas. */
export interface ReviewRetention {
  rate: number | null
  answered: number
}

export interface ReviewsOverview {
  /**
   * Contagens medidas. `null` = NÃO foi possível ler (Fase I.5, achado A2):
   * antes, falha de consulta virava zero e a página dizia "Você não tem revisões
   * agendadas" com o botão de revisar desabilitado. Zero agora significa apenas
   * uma coisa: o banco respondeu que não há itens naquele grupo.
   */
  counts: ReviewCounts | null
  /** Itens a revisar agora, na ordem da fila (atrasadas → hoje → novas). */
  due: ReviewItemView[]
  upcoming: ReviewItemView[]
  suspended: ReviewItemView[]
  archived: ReviewItemView[]
  /** Próximo vencimento futuro, quando não há nada para agora. */
  nextDueAt: string | null
  /** Retenção medida; `null` em `rate` quando ainda não há respostas. */
  retention: ReviewRetention
  hasActiveSession: boolean
}

export interface ReviewSessionSummary {
  id: string
  status: "ACTIVE" | "COMPLETED" | "DISCARDED"
  startedAt: string
  finishedAt: string | null
  itemsAnswered: number
}

/** Previsão de quando o item volta para cada nota (calculada pelo agendador). */
export interface ReviewGradePreview {
  grade: ReviewGrade
  label: string
  /** Texto pronto: "10 min", "2 dias", "3 meses". */
  preview: string
}

export interface ReviewCard {
  itemId: string
  sourceType: ReviewSourceType
  title: string
  parentTitle: string | null
  disciplineName: string
  state: ReviewState
  bucket: ReviewBucket
  dueAt: string
  reps: number
  lapses: number
  previews: ReviewGradePreview[]
}

export interface ReviewSessionState {
  sessionId: string
  /**
   * Quantas respostas esta sessão já tem. `null` quando a leitura da sessão
   * falhou (Fase I.7) — antes virava `0`, e o cabeçalho anunciava "0
   * respondidas" a um aluno que acabara de responder cinco cards.
   */
  itemsAnswered: number | null
  /**
   * Quantos itens ainda estão vencidos agora (a fila é recalculada a cada
   * resposta). `null` quando a contagem não pôde ser lida — nunca 0 por erro.
   */
  remaining: number | null
  card: ReviewCard | null
}

export interface ReviewSessionReport {
  itemsAnswered: number
  remembered: number
  forgot: number
  durationMinutes: number
  nextDueAt: string | null
  studyRegistered: boolean
  cycleSyncError: string | null
}
