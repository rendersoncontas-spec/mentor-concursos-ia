export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  tags?: { name: string; value: string }[]
  idempotencyKey?: string
}

export interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
  simulated?: boolean
}

export interface EmailNotificationPreferences {
  emails_enabled?: boolean
  resumo_semanal?: boolean
  lembretes_estudo?: boolean
  revisoes?: boolean
  importacoes?: boolean
  ranking?: boolean
  marketing?: boolean
}

export interface WeeklySummaryStats {
  totalMinutes: number
  totalQuestions: number
  correctQuestions: number
  disciplinesCount: number
  consecutiveDays: number
  bestTimeSlot?: string
  priorityDiscipline?: string
  accuracyPercentage?: number
}

export interface ImportCompletedStats {
  platformName: string
  processedCount: number
  importedCount: number
  existingCount: number
  errorCount: number
}

export interface StudyReminderDetails {
  reason: "daily_goal" | "pending_review" | "streak_protection" | "inactive_discipline"
  disciplineName?: string
  pendingCount?: number
  daysInactive?: number
}
