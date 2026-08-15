export type EditalMetadata = {
  name?: string | undefined
  organizer?: string | undefined
  positionName?: string | undefined
  banca?: string | undefined
  examDate?: string | undefined
  publicationDate?: string | undefined
  registrationDate?: string | undefined
}

export type ConfidenceInfo = {
  confidence: number
  lowConfidence: boolean
}

export type StructuredSubTopic = {
  title: string
} & ConfidenceInfo

export type StructuredTopic = {
  title: string
  subtopics: StructuredSubTopic[]
} & ConfidenceInfo

export type StructuredDiscipline = {
  name: string
  topics: StructuredTopic[]
} & ConfidenceInfo

export type EditalDraft = {
  metadata: EditalMetadata
  disciplines: StructuredDiscipline[]
}

export type CatalogDiscipline = {
  id: string
  name: string
}

export type CatalogTopic = {
  id: string
  disciplineId: string
  name: string
}

export type CatalogSubTopic = {
  id: string
  topicId: string
  name: string
}

export type MatchedSubTopic = StructuredSubTopic & {
  subtopicId: string | null
  isNew: boolean
}

export type MatchedTopic = Omit<StructuredTopic, "subtopics"> & {
  topicId: string | null
  isNew: boolean
  subtopics: MatchedSubTopic[]
}

export type MatchedDiscipline = Omit<StructuredDiscipline, "topics"> & {
  disciplineId: string | null
  isNew: boolean
  topics: MatchedTopic[]
}

export type MatchedEdital = {
  metadata: EditalMetadata
  disciplines: MatchedDiscipline[]
  overallConfidence: number
  lowConfidenceCount: number
}

export type ExtractMethod = "pdf" | "docx" | "txt"

export type ExtractResult = {
  text: string
  method: ExtractMethod
  warning?: string
}

export type EditalImportResult = {
  draft: MatchedEdital
  fileName: string
  fileHash: string
  stats: {
    disciplines: number
    topics: number
    subtopics: number
    newDisciplines: number
    newTopics: number
    newSubtopics: number
    lowConfidence: number
  }
}

export type TopicItemInput = {
  title: string
  subtopics?: { title: string }[] | undefined
}

export type EditalImportConfirmPayload = {
  fileName: string
  fileHash: string
  metadata: EditalMetadata
  structure: {
    name: string
    topics: TopicItemInput[]
  }[]
}

export type EditalImportConfirmResult = {
  success: boolean
  alreadyImported?: boolean
  editalId?: string
  error?: string
  stats?: {
    disciplines: number
    topics: number
    newDisciplines: number
  }
}
