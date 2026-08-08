export type WorkRegime = "FULL_TIME" | "PART_TIME" | "UNEMPLOYED" | "STUDENT"
export type ExperienceLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
export type ProficiencyLevel = "LOW" | "MEDIUM" | "HIGH"

export interface OnboardingData {
  targetExam: string
  targetRole: string
  mainStudySource: string
  weeklyStudyHours: number
  workRegime: WorkRegime
  experienceLevel: ExperienceLevel
  studiedDisciplines: Array<{
    id: string
    proficiencyLevel: ProficiencyLevel
  }>
}

export interface OnboardingResponse {
  success: boolean
  error?: string
}
