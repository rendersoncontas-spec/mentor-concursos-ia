import { z } from "zod"

export const onboardingSchema = z.object({
  examId: z.string({
    message: "Selecione o concurso desejado.",
  }).uuid("Concurso inválido."),
  targetRole: z.string().min(2, "Informe o cargo desejado."),
  mainStudySource: z.string().min(2, "Informe sua principal fonte de estudos."),
  weeklyStudyHours: z.coerce.number().min(1, "Informe ao menos 1 hora.").max(100, "Valor inválido."),
  workRegime: z.enum(["FULL_TIME", "PART_TIME", "UNEMPLOYED", "STUDENT"], {
    message: "Selecione o seu regime de trabalho.",
  }),
  experienceLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"], {
    message: "Selecione seu nível de experiência.",
  }),
  studiedDisciplines: z.array(
    z.object({
      id: z.string(),
      proficiencyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
    })
  ).default([]),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
