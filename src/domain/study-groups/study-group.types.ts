// Fase J.1 — Comunidade (MVP): Grupos de Estudo.
// Tipos do domínio, sem nenhuma lógica de ranking/meta coletiva ainda
// (isso é a Fase J.3 — ver claude/fase-j-comunidade-turmas-brief-2026-10-01.md).

export interface StudyGroup {
  id: string
  name: string
  inviteCode: string
  ownerId: string
  createdAt: string
}

export interface StudyGroupMember {
  userId: string
  name: string | null
  avatarUrl: string | null
  joinedAt: string
}

export interface StudyGroupDetail {
  group: StudyGroup
  isOwner: boolean
  members: StudyGroupMember[]
}
