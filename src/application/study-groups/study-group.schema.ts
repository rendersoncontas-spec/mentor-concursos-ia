import { z } from "zod"

// Fase J.1 — o limite de 80 caracteres espelha a checagem feita em
// create_study_group()/regenerate_study_group_invite_code() no banco
// (supabase/migrations/20261001_study_groups.sql) — validar os dois lados
// dá uma mensagem de erro melhor antes de ir ao banco, sem ser a única
// fronteira de verdade.
export const createStudyGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "O nome do grupo é obrigatório.")
    .max(80, "O nome pode ter no máximo 80 caracteres."),
})

export const joinStudyGroupSchema = z.object({
  code: z.string().trim().min(1, "Informe o código de convite.").max(16, "Código inválido."),
})

export const studyGroupIdSchema = z.object({
  groupId: z.string().uuid("Identificador de grupo inválido."),
})

export type CreateStudyGroupInput = z.infer<typeof createStudyGroupSchema>
export type JoinStudyGroupInput = z.infer<typeof joinStudyGroupSchema>
export type StudyGroupIdInput = z.infer<typeof studyGroupIdSchema>
