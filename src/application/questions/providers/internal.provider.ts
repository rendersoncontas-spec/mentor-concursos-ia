import type { SupabaseClient } from "@supabase/supabase-js"
import type { QuestionProvider, QuestionFetchOptions, Question, QuestionTopic } from "@/domain/questions/types"

export class InternalDatabaseProvider implements QuestionProvider {
  providerId = 'INTERNAL_DB'
  
  constructor(private supabase: SupabaseClient) {}

  async fetchQuestions(options: QuestionFetchOptions): Promise<Question[]> {
    let query = this.supabase
      .from('questions')
      .select('*')
      .eq('question_status', 'ACTIVE')

    if (options.disciplineId) {
      query = query.eq('discipline_id', options.disciplineId)
    }
    if (options.topicId) {
      query = query.eq('topic_id', options.topicId)
    }
    if (options.difficulty) {
      query = query.eq('difficulty_level', options.difficulty)
    }
    if (options.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query
    if (error) {
      console.error("InternalDatabaseProvider Error:", error)
      return []
    }

    return data as Question[]
  }

  async fetchTopics(disciplineId: string): Promise<QuestionTopic[]> {
    const { data, error } = await this.supabase
      .from('question_topics')
      .select('*')
      .eq('discipline_id', disciplineId)
      
    if (error) return []
    return data as QuestionTopic[]
  }
}
