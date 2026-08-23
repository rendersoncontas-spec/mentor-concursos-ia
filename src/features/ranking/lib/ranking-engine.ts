/**
 * Ranking Engine — fonte única de verdade para ranking de estudo.
 *
 * Toda lógica de ordenação, cálculo de distância, formatação e detecção
 * de empate passa por aqui. Componentes NÃO devem duplicar essas contas.
 */

/* ─────────────────────────────────────────────────────────────────────────────
   TIPOS
────────────────────────────────────────────────────────────────────────────── */

export type RankingMetric = "TEMPO" | "QUESTOES" | "PAGINAS"

/** Entrada bruta de um usuário para o ranking. */
export interface RankingUserInput {
  id: string
  name: string
  totalMinutes: number
  questions: number
  pages: number
  avatar?: string
  initials?: string
  bgColor?: string
  targetContest?: string
  hasActivity?: boolean
}

/** Entrada processada com posição, empate e distância calculada. */
export interface RankingEntry {
  rank: number
  id: string
  name: string
  totalMinutes: number
  questions: number
  pages: number
  avatar: string
  initials: string
  bgColor: string
  targetContest: string
  hasActivity: boolean
  /** true se empatado com o usuário imediatamente acima */
  tiedWithAbove: boolean
  /** segundos até o próximo à frente (0 se não houver ou se for o líder) */
  distanceAheadSeconds: number
}

export interface RankingResult {
  /** Lista ordenada (maior → menor) com posições calculadas. */
  entries: RankingEntry[]
  /** Mapa id → entrada para acesso rápido. */
  byId: Map<string, RankingEntry>
}

/* ─────────────────────────────────────────────────────────────────────────────
   FORMATAÇÃO CENTRALIZADA DE DURAÇÃO
────────────────────────────────────────────────────────────────────────────── */

/**
 * Converte minutos (unidade padrão do sistema) para segundos.
 */
export function minutesToSeconds(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 0) return 0
  return Math.round(minutes * 60)
}

/**
 * Formata uma duração em segundos para exibição amigável.
 *
 * Regras:
 *  - 0–59s   → "30s"
 *  - 1–59min → "17min"
 *  - 1–23h   → "1h57min"
 *  - ≥24h    → "1d 3h"
 *  - 0       → "0s"
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s"
  const s = Math.round(seconds)
  if (s === 0) return "0s"

  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const secs = s % 60

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h${String(minutes).padStart(2, "0")}min` : `${hours}h`
  }
  if (minutes > 0) {
    return `${minutes}min`
  }
  return `${secs}s`
}

/**
 * Formata uma duração em segundos para exibição curta de metric (QUESTOES/PAGINAS).
 */
export function formatMetricValue(value: number, metric: RankingMetric): string {
  if (metric === "TEMPO") return formatDuration(minutesToSeconds(value))
  if (metric === "QUESTOES") return `${value} ${value === 1 ? "questão" : "questões"}`
  return `${value} ${value === 1 ? "página" : "páginas"}`
}

/**
 * Formata valor acumulado para exibição no card (ex: "11h05min acumulados").
 */
export function formatAccumulated(minutes: number, metric: RankingMetric): string {
  if (metric === "TEMPO") return formatDuration(minutesToSeconds(minutes))
  if (metric === "QUESTOES") return `${minutes} questões`
  return `${minutes} páginas`
}

/* ─────────────────────────────────────────────────────────────────────────────
   CÁLCULO CENTRALIZADO DE DISTÂNCIA
────────────────────────────────────────────────────────────────────────────── */

/**
 * Calcula a distância entre o valor à frente e o valor de trás na ranking.
 *
 * Para TEMPO: retorna em segundos (pronto para formatDuration).
 * Para QUESTOES/PAGINAS: retorna na unidade nativa (count).
 *
 * Retorna sempre ≥ 0.
 *
 * Exemplos (TEMPO):
 *   calculateDistanceAhead(782, 692, "TEMPO") → 5400 (1h30min em segundos)
 *   calculateDistanceAhead(645, 600, "TEMPO") → 2700 (45min em segundos)
 *   calculateDistanceAhead(782, 782, "TEMPO") → 0
 *   calculateDistanceAhead(782, 840, "TEMPO") → 0 (usuário já à frente)
 */
export function calculateDistanceAhead(
  valueAhead: number,
  valueBehind: number,
  metric: RankingMetric,
): number {
  if (metric === "TEMPO") {
    return Math.max(0, minutesToSeconds(valueAhead - valueBehind))
  }
  return Math.max(0, valueAhead - valueBehind)
}

/**
 * Formata uma distância calculada por calculateDistanceAhead para exibição.
 *
 * Para TEMPO: espera valor em segundos → "1h30min", "45min", etc.
 * Para QUESTOES/PAGINAS: espera valor na unidade nativa → "50 questões", etc.
 */
export function formatDistance(distance: number, metric: RankingMetric): string {
  if (metric === "TEMPO") {
    return formatDuration(distance)
  }
  if (metric === "QUESTOES") {
    return `${distance} ${distance === 1 ? "questão" : "questões"}`
  }
  return `${distance} ${distance === 1 ? "página" : "páginas"}`
}

/* ─────────────────────────────────────────────────────────────────────────────
   MOTOR DE RANKING
────────────────────────────────────────────────────────────────────────────── */

/** Valor numérico da métrica para um usuário. */
function metricValue(user: RankingUserInput, metric: RankingMetric): number {
  if (metric === "TEMPO") return user.totalMinutes
  if (metric === "QUESTOES") return user.questions
  return user.pages
}

/**
 * Gera o ranking completo a partir de uma lista de usuários.
 *
 * 1. Filtra apenas participantes com atividade
 * 2. Ordena do maior para o menor (maior tempo/questões/páginas primeiro)
 * 3. Detecta empates (mesmo valor → mesma posição)
 * 4. Calcula distância até o próximo à frente
 *
 * Esta é a ÚNICA função que deve ser usada para gerar ranking.
 */
export function getStudyRanking(
  users: RankingUserInput[],
  metric: RankingMetric,
): RankingResult {
  const withActivity = users.filter(
    (u) => u.hasActivity !== false && metricValue(u, metric) > 0,
  )

  const sorted = [...withActivity].sort((a, b) => {
    const diff = metricValue(b, metric) - metricValue(a, metric)
    if (diff !== 0) return diff
    // Desempate determinístico: Questions > Pages > Name
    if (b.questions !== a.questions) return b.questions - a.questions
    if (b.pages !== a.pages) return b.pages - a.pages
    return a.name.localeCompare(b.name, "pt-BR")
  })

  const entries: RankingEntry[] = []
  let currentRank = 0
  let lastValue = -1

  for (let i = 0; i < sorted.length; i++) {
    const user = sorted[i]!
    const val = metricValue(user, metric)

    // Empate: mesmo valor → mesma posição
    if (val !== lastValue) {
      currentRank = i + 1
    }

    const prevUser = i > 0 ? sorted[i - 1] ?? null : null
    const prevEntry = i > 0 ? entries[i - 1] ?? null : null
    const prevVal = prevUser !== null ? metricValue(prevUser, metric) : null
    const isTied = prevEntry !== null && prevVal !== null && val === prevVal
    const distanceSeconds =
      prevEntry !== null && prevVal !== null
        ? Math.max(0, minutesToSeconds(prevVal - val))
        : 0

    entries.push({
      rank: currentRank,
      id: user.id,
      name: user.name,
      totalMinutes: user.totalMinutes,
      questions: user.questions,
      pages: user.pages,
      avatar: user.avatar ?? "",
      initials: user.initials ?? "",
      bgColor: user.bgColor ?? "",
      targetContest: user.targetContest ?? "Global",
      hasActivity: user.hasActivity !== false,
      tiedWithAbove: isTied,
      distanceAheadSeconds: distanceSeconds,
    })

    lastValue = val
  }

  const byId = new Map(entries.map((e) => [e.id, e]))

  return { entries, byId }
}

/**
 * Calcula a distância (em segundos) entre dois usuários.
 * Retorna sempre um valor positivo (ou 0 se iguais).
 */
export function getDistanceBetween(
  userA: RankingUserInput,
  userB: RankingUserInput,
  metric: RankingMetric,
): number {
  const valA = metricValue(userA, metric)
  const valB = metricValue(userB, metric)
  return Math.max(0, minutesToSeconds(Math.abs(valA - valB)))
}

/**
 * Encontra o usuário imediatamente à frente no ranking e retorna a distância.
 * Retorna null se o usuário já for o líder.
 */
export function getDistanceToUserAhead(
  currentUser: RankingUserInput,
  ranking: RankingResult,
  metric: RankingMetric,
): { user: RankingEntry; distanceSeconds: number } | null {
  const myEntry = ranking.byId.get(currentUser.id)
  if (!myEntry || myEntry.rank <= 1) return null

  // Encontrar o usuário com rank = myEntry.rank - 1
  const ahead = ranking.entries.find((e) => e.rank === myEntry.rank - 1)
  if (!ahead) return null

  const distanceSeconds = getDistanceBetween(
    { ...currentUser, id: currentUser.id },
    { id: ahead.id, name: ahead.name, totalMinutes: ahead.totalMinutes, questions: ahead.questions, pages: ahead.pages },
    metric,
  )

  return { user: ahead, distanceSeconds }
}

/**
 * Retorna o texto de status para a posição do usuário.
 */
export function getPositionMessage(
  rank: number,
  distanceSeconds: number,
  isTied: boolean,
  aheadName: string | null,
  metric: RankingMetric,
): string {
  if (rank <= 0) return "Estude para entrar no ranking."

  if (rank === 1) {
    return "Você está na liderança!"
  }

  if (isTied) {
    return aheadName
      ? `Você está empatado com ${aheadName}.`
      : "Você está empatado nesta posição."
  }

  if (distanceSeconds <= 0) {
    return "Você está empatado com o líder."
  }

  const formatted = formatDuration(distanceSeconds)
  return `Faltam ${formatted} para alcançar a liderança.`
}

/**
 * Retorna a mensagem para o card de "Próximo Adversário à Frente".
 */
export function getProximoAdversarioMessage(
  rank: number,
  distanceSeconds: number,
  isTied: boolean,
  metric: RankingMetric,
): string {
  if (rank <= 1) return ""
  if (isTied) return "Empatado com o usuário à frente."
  if (distanceSeconds <= 0) return "Empatado com o usuário à frente."

  const formatted = formatDuration(distanceSeconds)
  return `Faltam ${formatted} para ultrapassar.`
}

/**
 * Retorna a mensagem quando o usuário está em 1º lugar.
 */
export function getLeaderDefenseMessage(
  secondPlaceDistanceSeconds: number,
  metric: RankingMetric,
): string {
  if (secondPlaceDistanceSeconds <= 0) {
    return "Você está no topo! Mantenha o ritmo."
  }
  const formatted = formatDuration(secondPlaceDistanceSeconds)
  return `Você está ${formatted} à frente do 2º colocado.`
}

/**
 * Valor numérico da métrica (exportado para uso externo).
 */
export { metricValue as getMetricValue }
