/**
 * ALGORITMO V2 — Motor de Cronograma Inteligente (Modular)
 * 
 * Pipeline:
 * calculatePriority -> normalizeWeights -> generateWeeklySessions ->
 * balanceSequence -> insertReviewBlocks -> distributeDaily -> finalizeSchedule
 */

import {
  type AlgorithmDisciplineInput,
  type AlgorithmInput,
  type AlgorithmItem,
  type DayOfWeek,
} from "@/domain/study-plan/study-plan.types"

// ==============================================================================
// 1. Tipos Internos e Constantes
// ==============================================================================

type InternalSession = {
  type: "study" | "review"
  disciplineId: string
  disciplineName: string
  disciplineArea: string | null
  durationMinutes: number
  priorityScore: number
  originalPriority: number
}

const MIN_BLOCK_MINUTES = 30
const MAX_BLOCK_MINUTES = 60
const REVIEW_BLOCK_MINUTES = 20

// ==============================================================================
// 2. Funções de Pipeline (Motor de Inteligência)
// ==============================================================================

/**
 * Calcula a prioridade base da disciplina focando em Peso e Status.
 * Retorna 0 para descartar a disciplina (ex: COMPLETED).
 */
function calculatePriority(weight: number, status: string, daysSinceLastStudy: number = 0): number {
  if (status === "COMPLETED") return 0 // Regra: Completed não entra automaticamente

  const statusMultiplier: Record<string, number> = {
    NOT_STARTED: 1.5, // Prioridade alta para tirar do zero
    STUDYING: 1.2,    // Fluxo ativo de estudo
    READY_FOR_SCHEDULE: 1.0, // Fluxo padrão
    REVISING: 0.8,    // Já estudou toda a teoria, peso menor
  }

  const baseMultiplier = statusMultiplier[status] ?? 1.0
  // Fator de rotação (quanto mais tempo sem ver, maior a urgência).
  // Simulado como 0 aqui para o planejamento base, a ser evoluído no futuro com histórico.
  const rotationFactor = 1 + (daysSinceLastStudy * 0.1)

  return parseFloat((weight * baseMultiplier * rotationFactor).toFixed(2))
}

/**
 * Normaliza os scores para descobrir a fatia percentual que cada disciplina merece da semana.
 */
function normalizeWeights<T extends { priorityScore: number }>(disciplines: T[]): Array<T & { normalizedScore: number }> {
  const totalScore = disciplines.reduce((sum, d) => sum + d.priorityScore, 0)
  if (totalScore === 0) return disciplines.map(d => ({ ...d, normalizedScore: 0 }))
  
  return disciplines.map(d => ({
    ...d,
    normalizedScore: d.priorityScore / totalScore
  }))
}

/**
 * Fatiar as horas da semana em sessões de blocos ideais (ex: 30 a 60 min).
 */
function generateWeeklySessions(disciplines: Array<AlgorithmDisciplineInput & { priorityScore: number; normalizedScore: number }>, weeklyMinutes: number): InternalSession[] {
  const sessions: InternalSession[] = []
  
  // 1. Calcular fatias de tempo para cada disciplina atenta à soma total
  const allocated = disciplines.map(d => {
    if (d.normalizedScore <= 0) return { ...d, targetMins: 0 }
    return {
      ...d,
      targetMins: Math.round(d.normalizedScore * weeklyMinutes)
    }
  })

  // Garantir que a soma alocada seja exatamente weeklyMinutes (sem perdas por arredondamento)
  const currentTotal = allocated.reduce((acc, d) => acc + d.targetMins, 0)
  const diff = weeklyMinutes - currentTotal
  if (diff !== 0 && allocated.length > 0) {
    const topDisc = allocated.filter(d => d.targetMins > 0).sort((a, b) => b.priorityScore - a.priorityScore)[0]
    if (topDisc) topDisc.targetMins += diff
  }

  // 2. Fatiar em blocos garantindo que NENHUM minuto seja descartado
  allocated.forEach(d => {
    let remaining = d.targetMins
    if (remaining <= 0) return

    while (remaining > 0) {
      if (remaining >= MIN_BLOCK_MINUTES) {
        const blockDuration = Math.min(MAX_BLOCK_MINUTES, remaining)
        sessions.push({
          type: "study",
          disciplineId: d.disciplineId,
          disciplineName: d.name,
          disciplineArea: d.area,
          durationMinutes: blockDuration,
          priorityScore: d.priorityScore,
          originalPriority: d.priorityScore
        })
        remaining -= blockDuration
      } else {
        // Se sobrou um resto menor que 30 min (ex: 15 ou 20 min):
        // Se a disciplina já tem blocos criados, adicionamos ao último bloco para não perder os minutos
        const lastSession = sessions.filter(s => s.disciplineId === d.disciplineId).pop()
        if (lastSession) {
          lastSession.durationMinutes += remaining
        } else {
          sessions.push({
            type: "study",
            disciplineId: d.disciplineId,
            disciplineName: d.name,
            disciplineArea: d.area,
            durationMinutes: remaining,
            priorityScore: d.priorityScore,
            originalPriority: d.priorityScore
          })
        }
        remaining = 0
      }
    }
  })

  // Ordenamos do maior para o menor para facilitar o balanceamento inicial
  return sessions.sort((a, b) => b.priorityScore - a.priorityScore)
}

/**
 * Ordena a sequência para evitar estudar a mesma disciplina ou área duas vezes seguidas.
 */
function balanceSequence(sessions: InternalSession[]): InternalSession[] {
  const balanced: InternalSession[] = []
  const pool = [...sessions]

  while (pool.length > 0) {
    const lastSession = balanced[balanced.length - 1]
    
    let bestIndex = 0
    let bestScore = -Infinity

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i]
      if (!candidate) continue
      let score = candidate.priorityScore
      
      if (lastSession) {
        // Regra: Evitar repetição da mesma disciplina (-1000 de penalidade)
        if (candidate.disciplineId === lastSession.disciplineId) {
          score -= 1000 
        } 
        // Regra: Evitar repetição da mesma área (-500 de penalidade)
        else if (candidate.disciplineArea && lastSession.disciplineArea && candidate.disciplineArea === lastSession.disciplineArea) {
          score -= 500 
        }
      }

      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }

    const nextItem = pool.splice(bestIndex, 1)[0]
    if (nextItem) {
      balanced.push(nextItem)
    }
  }

  return balanced
}

/**
 * Injeta blocos de Revisão espaçados no cronograma.
 */
function insertReviewBlocks(sessions: InternalSession[]): InternalSession[] {
  const withReviews: InternalSession[] = []
  
  // Como o banco de dados obriga um `discipline_id` válido, associamos
  // as revisões de forma rotativa às disciplinas que o aluno já possui.
  const availableDisciplines = Array.from(new Set(sessions.map(s => s.disciplineId)))
  let reviewCounter = 0

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i]
    if (!session) continue
    withReviews.push(session)

    // A cada 4 sessões de estudo padrão, injetar 1 sessão de revisão genérica (20 minutos)
    if ((i + 1) % 4 === 0 && availableDisciplines.length > 0) {
      const assignedDisciplineId = availableDisciplines[reviewCounter % availableDisciplines.length]
      const targetDiscipline = sessions.find(s => s.disciplineId === assignedDisciplineId)

      if (targetDiscipline) {
        withReviews.push({
          type: "review",
          disciplineId: targetDiscipline.disciplineId,
          // O sufixo deixa claro para o usuário que é um bloco genérico de revisão (Opção A)
          // enquanto satisfaz a obrigatoriedade da Foreign Key do banco de dados!
          disciplineName: targetDiscipline.disciplineName + " (Revisão)", 
          disciplineArea: targetDiscipline.disciplineArea,
          durationMinutes: REVIEW_BLOCK_MINUTES,
          priorityScore: targetDiscipline.priorityScore * 0.8,
          originalPriority: targetDiscipline.originalPriority
        })
        reviewCounter++
      }
    }
  }

  return withReviews
}

/**
 * Distribui a pilha sequencial nos dias disponíveis garantindo que não estoure o limite diário.
 */
function distributeDaily(
  sessions: InternalSession[],
  availableDays: DayOfWeek[],
  maxDailyMinutes: number
): Map<DayOfWeek, InternalSession[]> {
  const dailyDistribution = new Map<DayOfWeek, InternalSession[]>()
  availableDays.forEach(day => dailyDistribution.set(day, []))

  // Starts distributing from the current day of the week to ensure the user gets blocks today
  const today = new Date().getDay()
  let currentDayIndex = availableDays.indexOf(today as DayOfWeek)
  if (currentDayIndex === -1) currentDayIndex = 0
  
  for (const session of sessions) {
    let day = availableDays[currentDayIndex]
    if (day === undefined) continue
    let dayItems = dailyDistribution.get(day)
    if (!dayItems) continue
    
    let currentDayMinutes = dayItems.reduce((acc, curr) => acc + curr.durationMinutes, 0)
    
    // Avança para o próximo dia caso a sessão faça o dia atual estourar as horas
    let attempts = 0
    while (currentDayMinutes + session.durationMinutes > maxDailyMinutes && attempts < availableDays.length) {
      currentDayIndex = (currentDayIndex + 1) % availableDays.length
      day = availableDays[currentDayIndex]
      if (!day) continue
      const nextDayItems = dailyDistribution.get(day)
      if (!nextDayItems) continue
      dayItems = nextDayItems
      currentDayMinutes = dayItems.reduce((acc, curr) => acc + curr.durationMinutes, 0)
      attempts++
    }

    // Se a agenda estiver lotada, forçar encaixe no dia mais vazio para não perder a sessão
    if (attempts >= availableDays.length) {
      let leastBusyDay = day
      let leastMinutes = Infinity
      availableDays.forEach(d => {
        const items = dailyDistribution.get(d)
        if (!items) return
        const mins = items.reduce((acc, curr) => acc + curr.durationMinutes, 0)
        if (mins < leastMinutes) {
          leastMinutes = mins
          leastBusyDay = d
        }
      })
      if (leastBusyDay === undefined) continue
      const leastBusyDayItems = dailyDistribution.get(leastBusyDay)
      if (!leastBusyDayItems) continue
      dayItems = leastBusyDayItems
    }

    dayItems.push(session)
    // Avança um dia para espalhar uniformemente (evita jogar tudo na Segunda-feira)
    currentDayIndex = (currentDayIndex + 1) % availableDays.length
  }

  return dailyDistribution
}

/**
 * Formata os itens internos para o padrão de compatibilidade exigido pelo ecossistema.
 */
function finalizeSchedule(dailyDistribution: Map<DayOfWeek, InternalSession[]>): AlgorithmItem[] {
  const finalItems: AlgorithmItem[] = []

  dailyDistribution.forEach((sessions, day) => {
    sessions.forEach((session, index) => {
      finalItems.push({
        disciplineId: session.disciplineId,
        disciplineName: session.disciplineName,
        disciplineArea: session.disciplineArea,
        dayOfWeek: day,
        durationMinutes: session.durationMinutes,
        priority: index + 1, // Define a ordem de estudo no próprio dia
        priorityScore: session.priorityScore,
        recommendedSessions: Math.ceil(session.durationMinutes / 60)
      })
    })
  })

  // Ordena a saída completa pelo dia e depois pela prioridade no dia
  return finalItems.sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek
    return a.priority - b.priority
  })
}

// ==============================================================================
// 3. Ponto de Entrada Exportado
// ==============================================================================

export function calculateWeeklyDistribution(input: AlgorithmInput): AlgorithmItem[] {
  const { weeklyMinutes, availableDays, disciplines, adaptiveDecisions } = input

  if (disciplines.length === 0 || weeklyMinutes <= 0 || availableDays.length === 0) {
    return []
  }

  // Manter weeklyMinutes exatamente como configurado pelo usuário para garantir a meta de horas

  // Pipeline Inteligente: 
  // 1a. Priorização Base
  let withPriorities = disciplines.map(d => ({
    ...d,
    priorityScore: calculatePriority(d.weight, d.status)
  })).filter(d => d.priorityScore > 0) // Remove COMPLETED

  // 1b. Injeção de Adaptação Heurística (Sprint 7: ALE)
  if (adaptiveDecisions && adaptiveDecisions.length > 0) {
    withPriorities = withPriorities.map(d => {
      // Procura decisão de alteração de peso para esta disciplina
      const decision = adaptiveDecisions.find(
        ad => ad.recommendationType === 'WEIGHT_CHANGE' && ad.disciplineId === d.disciplineId
      )
      
      let finalScore = d.priorityScore
      if (decision && decision.delta) {
        // Exemplo: delta = 0.20 significa +20% no peso original
        // Multiplicamos o priorityScore calculado pelo fator (1 + delta)
        finalScore = finalScore * (1 + decision.delta)
      }
      
      return { ...d, priorityScore: finalScore }
    })
  }

  if (withPriorities.length === 0) return []

  // 2. Normalização
  const normalized = normalizeWeights(withPriorities)

  // 3. Geração Semanal com Reserva para Revisões (garante que soma final das aulas + revisões = weeklyMinutes)
  const estimatedSessionsCount = Math.floor(weeklyMinutes / 60)
  const estimatedReviewsCount = Math.floor(estimatedSessionsCount / 4)
  const reviewMinutesReserve = estimatedReviewsCount * REVIEW_BLOCK_MINUTES
  const studyMinutes = Math.max(MIN_BLOCK_MINUTES, weeklyMinutes - reviewMinutesReserve)

  const baseSessions = generateWeeklySessions(normalized, studyMinutes)

  // 4. Balanceamento Anti-Repetição
  const balancedSessions = balanceSequence(baseSessions)

  // 5. Injeção de Revisões
  const sessionsWithReviews = insertReviewBlocks(balancedSessions)

  // 6. Ajuste Milimétrico de Precisão (Garante que a soma total de aulas + revisões seja RIGOROSAMENTE igual a weeklyMinutes)
  const currentTotalMins = sessionsWithReviews.reduce((acc, s) => acc + s.durationMinutes, 0)
  const diffMins = weeklyMinutes - currentTotalMins
  if (diffMins !== 0 && sessionsWithReviews.length > 0) {
    const studySessions = sessionsWithReviews.filter(s => s.type === "study")
    const targetSession = studySessions[studySessions.length - 1] || sessionsWithReviews[sessionsWithReviews.length - 1]
    if (targetSession) {
      targetSession.durationMinutes = Math.max(MIN_BLOCK_MINUTES, targetSession.durationMinutes + diffMins)
    }
  }

  // 7. Distribuição Diária Limitada
  const maxDailyMinutes = Math.ceil(weeklyMinutes / availableDays.length)
  const dailyDistribution = distributeDaily(sessionsWithReviews, availableDays, maxDailyMinutes)

  // 8. Saída Formatada
  return finalizeSchedule(dailyDistribution)
}

/**
 * Agrega os itens e calcula o resumo semanal por disciplina.
 * Útil para a seção de "Resumo Semanal" da página /study-plan.
 */
export function calcDisciplineSummary(items: AlgorithmItem[]) {
  const map = new Map<string, {
    disciplineId: string
    disciplineName: string
    disciplineArea: string | null
    totalWeeklyMinutes: number
    daysCount: number
    priorityScore: number
  }>()

  items.forEach((item) => {
    const existing = map.get(item.disciplineId)
    if (existing) {
      existing.totalWeeklyMinutes += item.durationMinutes
      existing.daysCount += 1
    } else {
      map.set(item.disciplineId, {
        disciplineId: item.disciplineId,
        disciplineName: item.disciplineName,
        disciplineArea: item.disciplineArea,
        totalWeeklyMinutes: item.durationMinutes,
        daysCount: 1,
        priorityScore: item.priorityScore,
      })
    }
  })

  return Array.from(map.values()).sort((a, b) => b.priorityScore - a.priorityScore)
}

// ==============================================================================
// 4. Algoritmo do Ciclo Rotativo Contínuo (Independente de Dia da Semana)
// ==============================================================================

export interface CycleAlgorithmInput {
  totalCycleMinutes: number
  disciplines: {
    disciplineId: string
    name: string
    area: string | null
    weight: number // 1 a 5
    difficulty: number // 1 a 5
    status?: string
  }[]
}

/**
 * Calcula a sequência ordenada de blocos do Ciclo Rotativo Contínuo.
 * Distribui as horas da rodada proporcionalmente ao (Peso * Dificuldade)
 * dividindo em blocos de 30 a 120 minutos e balanceando a alternância.
 */
export function calculateCycleDistribution(input: CycleAlgorithmInput): AlgorithmItem[] {
  const { totalCycleMinutes, disciplines } = input

  if (disciplines.length === 0 || totalCycleMinutes <= 0) {
    return []
  }

  // 1. Calcular Score Combinado (Peso x Dificuldade)
  const scored = disciplines.map(d => {
    const w = Math.max(1, Math.min(5, d.weight || 1))
    const diff = Math.max(1, Math.min(5, d.difficulty || 1))
    let statusMult = 1.0
    if (d.status === "COMPLETED") statusMult = 0.5
    else if (d.status === "REVISING") statusMult = 0.8
    const priorityScore = parseFloat((w * diff * statusMult).toFixed(2))

    return { ...d, priorityScore }
  })

  const totalScore = scored.reduce((acc, d) => acc + d.priorityScore, 0)
  if (totalScore <= 0) return []

  // 2. Alocar minutos proporcionais de forma exata (soma = totalCycleMinutes)
  const allocated = scored.map(d => {
    const fraction = d.priorityScore / totalScore
    return {
      ...d,
      targetMins: Math.round(fraction * totalCycleMinutes)
    }
  })

  const currentTotal = allocated.reduce((acc, d) => acc + d.targetMins, 0)
  const diff = totalCycleMinutes - currentTotal
  if (diff !== 0 && allocated.length > 0) {
    const topDisc = allocated.filter(d => d.targetMins > 0).sort((a, b) => b.priorityScore - a.priorityScore)[0]
    if (topDisc) topDisc.targetMins += diff
  }

  // 3. Fatiar em blocos sem descartar NENHUM minuto
  const rawSessions: InternalSession[] = []

  allocated.forEach(d => {
    let remaining = d.targetMins
    if (remaining <= 0) return

    while (remaining > 0) {
      if (remaining >= MIN_BLOCK_MINUTES) {
        const blockDuration = remaining >= 120 ? 90 : Math.min(90, remaining)

        rawSessions.push({
          type: "study",
          disciplineId: d.disciplineId,
          disciplineName: d.name,
          disciplineArea: d.area,
          durationMinutes: blockDuration,
          priorityScore: d.priorityScore,
          originalPriority: d.weight
        })

        remaining -= blockDuration
      } else {
        // Adiciona a sobra (ex: 15 ou 20 min) ao último bloco da mesma disciplina
        const lastSession = rawSessions.filter(s => s.disciplineId === d.disciplineId).pop()
        if (lastSession) {
          lastSession.durationMinutes += remaining
        } else {
          rawSessions.push({
            type: "study",
            disciplineId: d.disciplineId,
            disciplineName: d.name,
            disciplineArea: d.area,
            durationMinutes: remaining,
            priorityScore: d.priorityScore,
            originalPriority: d.weight
          })
        }
        remaining = 0
      }
    }
  })

  // 3. Balancear sequência (evita disciplinas/áreas repetidas consecutivas)
  const balanced = balanceSequence(rawSessions)

  // 4. Formatar para lista final com ordem de execução sequencial (1, 2, 3...)
  return balanced.map((session, index) => ({
    disciplineId: session.disciplineId,
    disciplineName: session.disciplineName,
    disciplineArea: session.disciplineArea,
    dayOfWeek: 0, // No Ciclo Rotativo, dayOfWeek não é amarrado à agenda
    executionOrder: index + 1,
    durationMinutes: session.durationMinutes,
    priority: index + 1,
    priorityScore: session.priorityScore,
    recommendedSessions: 1
  }))
}

