export interface CatalogSubTopic {
  id: string
  topic_id: string
  name: string
  created_at: string
}

export interface CatalogTopic {
  id: string
  discipline_id: string
  name: string
  created_at: string
}

export interface CatalogDiscipline {
  id: string
  name: string
  area: string | null
  created_at: string
}

// Tópico com seus subtópicos aninhados
export interface CatalogTopicWithSubTopics extends CatalogTopic {
  subtopics: CatalogSubTopic[]
}

// Disciplina com a árvore de tópicos e subtópicos
export interface CatalogDisciplineWithTopics extends CatalogDiscipline {
  topics: CatalogTopicWithSubTopics[]
}

// Disciplina com contagens agregadas (para listagens/resumo)
export interface CatalogDisciplineSummary extends CatalogDiscipline {
  topics_count: number
  subtopics_count: number
}

// Árvore completa do catálogo (disciplines → topics → subtopics)
export interface CatalogTree {
  disciplines: CatalogDisciplineWithTopics[]
}

// Subtópico compacto usado nas sugestões de autocomplete
export interface TopicSuggestionSubTopic {
  id: string
  name: string
}

// Tópico retornado pelo autocomplete (catálogo global + personalizados do usuário)
export interface TopicSuggestion {
  id: string
  discipline_id: string
  name: string
  user_id: string | null
  created_at: string
  userTopic: boolean
  subtopics: TopicSuggestionSubTopic[]
}
