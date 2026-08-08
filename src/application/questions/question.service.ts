import { SupabaseClient } from "@supabase/supabase-js"
import { Question } from "@/domain/questions/types"

/**
 * Ponto de entrada que decidirá futuramente qual provider chamar
 * (Por enquanto chama direto o banco interno, mas está envelopado)
 */
export async function getQuestions(
  supabase: SupabaseClient,
  filters: { disciplineId?: string; topicId?: string; limit?: number }
): Promise<Question[]> {
  let query = supabase
    .from('questions')
    .select('*')
    .eq('question_status', 'ACTIVE')

  if (filters.disciplineId) {
    query = query.eq('discipline_id', filters.disciplineId)
  }
  if (filters.topicId) {
    query = query.eq('topic_id', filters.topicId)
  }
  if (filters.limit) {
    query = query.limit(filters.limit)
  }

  const { data, error } = await query
  
  if (error) {
    console.error("Erro ao buscar questões:", error)
    return []
  }

  return data as Question[]
}

export async function createQuestion(
  supabase: SupabaseClient,
  questionData: Omit<Question, 'id' | 'created_at'>
): Promise<Question> {
  const { data, error } = await supabase
    .from('questions')
    .insert([questionData])
    .select()
    .single()

  if (error) {
    throw new Error(`Erro ao criar questão: ${error.message}`)
  }

  return data as Question
}
