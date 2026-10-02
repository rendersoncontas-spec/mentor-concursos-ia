// Enum de status de disciplinas do usuário
export type DisciplineStatus =
  "NOT_STARTED" | "STUDYING" | "REVISING" | "COMPLETED" | "READY_FOR_SCHEDULE"

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
  color_hex: string | null
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

// Progresso do aluno em uma disciplina global.
// G1.1 (G-02): `custom_name`/`custom_color_hex` são a APARÊNCIA PESSOAL do
// usuário (nunca afetam o catálogo global). NULL = segue o global.
export interface UserDiscipline {
  id: string
  user_id: string
  discipline_id: string
  target_id?: string | null
  status: DisciplineStatus
  mastery_level: number
  custom_name?: string | null
  custom_color_hex?: string | null
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
