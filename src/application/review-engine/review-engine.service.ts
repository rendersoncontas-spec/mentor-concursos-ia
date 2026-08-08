import { SupabaseClient } from "@supabase/supabase-js"
import { ReviewItem, ReviewQueueItem } from "@/domain/reviews/models"
import { getReviewStrategy } from "./strategy.resolver"

/**
 * 1. Calcula a prioridade do item na Fila.
 * Mistura o Atraso (Overdue) com a importância base da disciplina.
 */
function calculateQueuePriority(item: ReviewItem): number {
  if (!item.next_review_at) return 1.0
  
  const now = new Date().getTime()
  const due = new Date(item.next_review_at).getTime()
  
  // Atraso em dias
  const overdueDays = (now - due) / (1000 * 3600 * 24)
  
  // Priority = BasePriority + Fator de Atraso
  // Se está 5 dias atrasado, ganha muito mais prioridade que quem venceu hoje
  let priority = item.base_priority || 1.0
  if (overdueDays > 0) {
    priority += overdueDays * 0.5
  }
  
  return priority
}

/**
 * 2. Gera a Fila de Revisões de Hoje (Popula a tabela review_queue).
 * É chamada quando o usuário entra na aba de Revisões.
 */
export async function generateDailyQueue(
  supabase: SupabaseClient, 
  userId: string
): Promise<ReviewQueueItem[]> {
  const nowStr = new Date().toISOString()
  
  // Busca todos os itens que venceram (next_review_at <= NOW)
  const { data: dueItems, error } = await supabase
    .from('review_items')
    .select('*')
    .eq('user_id', userId)
    .lte('next_review_at', nowStr)
    // Apenas os que não estão na fila PENDING de hoje
    
  if (error || !dueItems) return []

  const todayStr = nowStr.split('T')[0] // Apenas a data
  
  // Tenta inserir na Queue
  for (const item of dueItems) {
    const priority = calculateQueuePriority(item as ReviewItem)
    
    await supabase.from('review_queue').upsert({
      user_id: userId,
      review_item_id: item.id,
      status: 'PENDING',
      due_date: todayStr,
      calculated_priority: priority
    }, { onConflict: 'review_item_id, due_date' })
  }

  // Retorna a fila ordenada do dia
  const { data: queue } = await supabase
    .from('review_queue')
    .select(`
      *,
      review_items (*)
    `)
    .eq('user_id', userId)
    .eq('status', 'PENDING')
    .order('calculated_priority', { ascending: false })
    
  return queue as ReviewQueueItem[]
}

/**
 * 3. Processa a resposta do usuário no flashcard/questão.
 * Chama o Strategy (FSRS ou SM2+), atualiza o item e o histórico.
 */
export async function processReviewAnswer(
  supabase: SupabaseClient,
  userId: string,
  queueItemId: string,
  reviewItemId: string,
  grade: number, // 1 a 5 (ou 1 a 4 pro FSRS)
  strategyName: string = 'FSRS',
  context?: Record<string, any>
) {
  // 1. Pega o Item Atual
  const { data: item } = await supabase
    .from('review_items')
    .select('*')
    .eq('id', reviewItemId)
    .single()
    
  if (!item) throw new Error("Item não encontrado")

  // 2. Chama a estratégia para calcular o Próximo Estado
  const strategy = getReviewStrategy(strategyName)
  const nextState = strategy.calculateNextState(item as ReviewItem, grade, context)
  
  // 3. Atualiza o item no banco
  await supabase.from('review_items').update({
    review_stage: nextState.review_stage,
    ease_factor: nextState.ease_factor,
    stability_score: nextState.stability_score,
    memory_strength: nextState.memory_strength,
    forget_probability: nextState.forget_probability,
    next_review_at: nextState.next_review_at,
    last_review_at: new Date().toISOString(),
    review_count: item.review_count + 1,
    lapses_count: nextState.review_stage === 'LAPSED' ? item.lapses_count + 1 : item.lapses_count
  }).eq('id', reviewItemId)

  // 4. Marca o item na fila como COMPLETED
  await supabase.from('review_queue').update({
    status: 'COMPLETED'
  }).eq('id', queueItemId)

  // 5. Salva no Histórico
  await supabase.from('review_history').insert({
    user_id: userId,
    review_item_id: reviewItemId,
    grade: grade,
    previous_ease: item.ease_factor,
    new_ease: nextState.ease_factor,
    // (Poderíamos salvar qual a estratégia foi usada com um join no id se fosse necessário)
  })

  return nextState
}

/**
 * 4. Obtém o resumo de revisões pendentes para o Dashboard.
 * Permite ao Dashboard consultar 'Quantas revisões tenho hoje?' sem acoplamento direto com tabelas.
 */
export async function getPendingReviewsSummary(
  supabase: SupabaseClient,
  userId: string
) {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0] || ""
  const nowStr = now.toISOString()

  // Busca itens na fila com status PENDING
  const { data: queueItems } = await supabase
    .from('review_queue')
    .select('calculated_priority, due_date, review_items ( next_review_at )')
    .eq('user_id', userId)
    .eq('status', 'PENDING')

  const items = queueItems || []
  const count = items.length

  let overdue = 0
  let today = 0
  let highPriority = 0

  items.forEach((item: any) => {
    if (item.due_date < todayStr) {
      overdue++
    } else if (item.due_date === todayStr) {
      today++
    }
    if ((item.calculated_priority || 0) > 2.0) {
      highPriority++
    }
  })

  // Busca a data da próxima revisão mais próxima
  const { data: nextItem } = await supabase
    .from('review_items')
    .select('next_review_at')
    .eq('user_id', userId)
    .gt('next_review_at', nowStr)
    .order('next_review_at', { ascending: true })
    .limit(1)
    .single()

  return {
    count,
    overdue,
    today,
    highPriority,
    nextReview: nextItem?.next_review_at || null
  }
}

