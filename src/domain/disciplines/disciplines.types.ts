// Enum de status de disciplinas do usuário
export type DisciplineStatus =
  | 'NOT_STARTED'
  | 'STUDYING'
  | 'REVISING'
  | 'COMPLETED'
  | 'READY_FOR_SCHEDULE'

export interface Exam {
  id: string
  name: string
  organizer: string | null
  active: boolean
  slug: string | null
  created_at: string
}

// Disciplina global (independente de concurso)
export interface Discipline {
  id: string
  name: string
  area: string | null
  created_at: string
}

// Vínculo entre concurso e disciplina (o "Edital")
export interface ExamDiscipline {
  id: string
  exam_id: string
  discipline_id: string
  weight: number
  display_order: number
  active: boolean
  created_at: string
}

// Disciplina global com os metadados do edital (join)
export interface ExamDisciplineWithDetails extends ExamDiscipline {
  discipline: Discipline
}

// Progresso do aluno em uma disciplina global
export interface UserDiscipline {
  id: string
  user_id: string
  discipline_id: string
  status: DisciplineStatus
  mastery_level: number
  created_at: string
}

// Visão enriquecida para a UI de /disciplines
export interface UserDisciplineWithDetails extends UserDiscipline {
  discipline: Discipline
}

export interface Subject {
  id: string
  discipline_id: string
  name: string
  slug: string
  created_at: string
}

export interface ExamSubject {
  id: string
  exam_id: string
  discipline_id: string
  subject_id: string
  weight: number
  created_at: string
}

// Tipos consolidados para a camada de visualização (EditalTree)
export interface EditalSubjectNode {
  id: string
  name: string
  slug: string
  weight: number
}

export interface EditalDisciplineNode {
  id: string
  name: string
  area: string | null
  subjects: EditalSubjectNode[]
}

export interface EditalTree {
  exam: Exam
  disciplines: EditalDisciplineNode[]
}
