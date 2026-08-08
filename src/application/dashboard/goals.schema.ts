import { z } from "zod"

export const weeklyGoalsSchema = z.object({
  weekly_study_hours: z.coerce.number().min(1).max(100),
  weekly_questions_goal: z.coerce.number().min(10).max(5000),
  weekly_revisions_goal: z.coerce.number().min(0).max(100),
  weekly_study_days_goal: z.coerce.number().min(1).max(7),
  week_start_day: z.coerce.number().min(0).max(6), // 0: Sunday, 1: Monday, etc
})

export type WeeklyGoalsInput = z.infer<typeof weeklyGoalsSchema>
