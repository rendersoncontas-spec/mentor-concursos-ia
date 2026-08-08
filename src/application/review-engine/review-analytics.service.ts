import { SupabaseClient } from "@supabase/supabase-js"

/**
 * 1. Retorna o número total de revisões atrasadas + as de hoje
 */
export async function getReviewBacklog(supabase: SupabaseClient, userId: string): Promise<number> {
  const todayStr = new Date().toISOString().split('T')[0]
  
  const { count, error } = await supabase
    .from('review_queue')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'PENDING')
    .lte('due_date', todayStr)
    
  return count || 0
}

/**
 * 2. Traz a contagem de itens em cada estágio da memória
 */
export async function getMemoryStages(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('review_items')
    .select('review_stage')
    .eq('user_id', userId)
    
  if (error || !data) return { new: 0, learning: 0, review: 0, mastered: 0, lapsed: 0 }
  
  const stages = { new: 0, learning: 0, review: 0, mastered: 0, lapsed: 0 }
  
  data.forEach(item => {
    if (item.review_stage === 'NEW') stages.new++
    else if (item.review_stage === 'LEARNING') stages.learning++
    else if (item.review_stage === 'REVIEW') stages.review++
    else if (item.review_stage === 'MASTERED') stages.mastered++
    else if (item.review_stage === 'LAPSED') stages.lapsed++
  })
  
  return stages
}

/**
 * 3. Traz a média de Retenção e a Força de Memória geral
 */
export async function getAverageRetention(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('review_items')
    .select('memory_strength, forget_probability')
    .eq('user_id', userId)
    .not('review_stage', 'eq', 'NEW')
    
  if (error || !data || data.length === 0) return { memoryStrength: 0, retentionRate: 0 }
  
  const sumStrength = data.reduce((acc, curr) => acc + (curr.memory_strength || 0), 0)
  const sumProbability = data.reduce((acc, curr) => acc + (curr.forget_probability || 0), 0)
  
  return {
    memoryStrength: Math.round(sumStrength / data.length),
    retentionRate: Math.round((1 - (sumProbability / data.length)) * 100)
  }
}

/**
 * 4. Traz itens críticos (Lapsed frequente)
 */
export async function getCriticalTopics(supabase: SupabaseClient, userId: string, limit: number = 5) {
  const { data, error } = await supabase
    .from('review_items')
    .select(`
      id,
      review_stage,
      lapses_count,
      disciplines ( name ),
      question_topics ( name )
    `)
    .eq('user_id', userId)
    .eq('review_stage', 'LAPSED')
    .order('lapses_count', { ascending: false })
    .limit(limit)
    
  return data || []
}
