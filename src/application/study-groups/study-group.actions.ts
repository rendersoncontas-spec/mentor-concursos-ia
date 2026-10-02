"use server"

import { revalidatePath } from "next/cache"

import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { createClient } from "@/infrastructure/supabase/server"
import type { StudyGroup, StudyGroupMember } from "@/domain/study-groups/study-group.types"

import { createStudyGroupSchema, joinStudyGroupSchema, studyGroupIdSchema } from "./study-group.schema"

// Fase J.1 — Comunidade (MVP): Grupos de Estudo.
//
// Decisão: criar/entrar/sair/apagar/regenerar operam sobre o usuário
// REALMENTE autenticado (auth.uid(), checado também no banco — ver
// supabase/migrations/20261001_study_groups.sql), não sobre o "usuário
// efetivo" de sessões de suporte (admin impersonando um aluno). Entrar num
// grupo em nome de outra pessoa não é um caso de suporte legítimo. Já a
// LEITURA (listar minhas turmas) usa getEffectiveUserId, para ficar
// consistente com o resto do app durante uma sessão de suporte (o
// admin vê as turmas do aluno, não as próprias).
//
// Fora de escopo desta fase: ranking interno e meta coletiva dentro do
// grupo (Fase J.3) e a interface (Fase J.2) — aqui é só banco + ações.

const MAX_GROUP_MEMBERS = 100 // limite de bom senso da aplicação; sem constraint no banco (ajustável sem migration)

interface StudyGroupRow {
  id: string
  name: string
  invite_code: string
  owner_id: string
  created_at: string
}

function mapGroupRow(row: StudyGroupRow): StudyGroup {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  }
}

type ActionResult<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string }

export async function createStudyGroupAction(
  input: { name: string },
): Promise<ActionResult<{ group: StudyGroup }>> {
  try {
    const { name } = createStudyGroupSchema.parse(input)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data, error } = await supabase.rpc("create_study_group", { p_name: name })

    if (error || !data) {
      console.error("Erro ao criar grupo de estudos:", error)
      return { success: false, error: "Não foi possível criar o grupo agora." }
    }

    revalidatePath("/ranking")
    return { success: true, group: mapGroupRow(data as unknown as StudyGroupRow) }
  } catch (err: unknown) {
    console.error("Erro na server action de criar grupo:", err)
    return { success: false, error: "Dados inválidos ou erro interno." }
  }
}

export async function joinStudyGroupByCodeAction(
  input: { code: string },
): Promise<ActionResult<{ group: StudyGroup }>> {
  try {
    const { code } = joinStudyGroupSchema.parse(input)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    // Limite de bom senso (sem constraint no banco — Fase J.1): checado antes
    // de chamar o RPC, então não impede quem já é membro de ver o grupo, só
    // novas entradas quando o grupo já está cheio.
    const { data: group, error: lookupError } = await supabase
      .from("study_groups")
      .select("id")
      .eq("invite_code", code.toUpperCase())
      .maybeSingle()

    if (!lookupError && group) {
      const { count } = await supabase
        .from("study_group_members")
        .select("user_id", { count: "exact", head: true })
        .eq("group_id", group.id)

      if ((count ?? 0) >= MAX_GROUP_MEMBERS) {
        return { success: false, error: "Este grupo já atingiu o limite de membros." }
      }
    }

    const { data, error } = await supabase.rpc("join_study_group_by_code", { p_code: code })

    if (error || !data) {
      return { success: false, error: "Código de convite inválido." }
    }

    revalidatePath("/ranking")
    return { success: true, group: mapGroupRow(data as unknown as StudyGroupRow) }
  } catch (err: unknown) {
    console.error("Erro na server action de entrar em grupo:", err)
    return { success: false, error: "Dados inválidos ou erro interno." }
  }
}

export async function leaveStudyGroupAction(input: { groupId: string }): Promise<ActionResult> {
  try {
    const { groupId } = studyGroupIdSchema.parse(input)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    // Checagem amigável antes de tentar: a RLS também bloqueia o dono
    // (supabase/migrations/20261001_study_groups.sql), mas aqui dá pra
    // devolver uma mensagem melhor do que o erro genérico do Postgres.
    const { data: group } = await supabase
      .from("study_groups")
      .select("owner_id")
      .eq("id", groupId)
      .maybeSingle()

    if (group?.owner_id === user.id) {
      return {
        success: false,
        error: "O dono não pode sair do grupo. Para encerrar o grupo, apague-o.",
      }
    }

    const { error } = await supabase
      .from("study_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", user.id)

    if (error) {
      console.error("Erro ao sair do grupo de estudos:", error)
      return { success: false, error: "Não foi possível sair do grupo agora." }
    }

    revalidatePath("/ranking")
    return { success: true }
  } catch (err: unknown) {
    console.error("Erro na server action de sair do grupo:", err)
    return { success: false, error: "Dados inválidos ou erro interno." }
  }
}

export async function regenerateInviteCodeAction(
  input: { groupId: string },
): Promise<ActionResult<{ group: StudyGroup }>> {
  try {
    const { groupId } = studyGroupIdSchema.parse(input)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data, error } = await supabase.rpc("regenerate_study_group_invite_code", {
      p_group_id: groupId,
    })

    if (error || !data) {
      console.error("Erro ao regenerar código de convite:", error)
      return { success: false, error: "Não foi possível gerar um novo código agora." }
    }

    revalidatePath("/ranking")
    return { success: true, group: mapGroupRow(data as unknown as StudyGroupRow) }
  } catch (err: unknown) {
    console.error("Erro na server action de regenerar código:", err)
    return { success: false, error: "Dados inválidos ou erro interno." }
  }
}

export async function deleteStudyGroupAction(input: { groupId: string }): Promise<ActionResult> {
  try {
    const { groupId } = studyGroupIdSchema.parse(input)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    // Checagem amigável antes de tentar (a RLS, só o dono, já protege isso).
    const { data: group } = await supabase
      .from("study_groups")
      .select("owner_id")
      .eq("id", groupId)
      .maybeSingle()

    if (!group) {
      return { success: false, error: "Grupo não encontrado." }
    }
    if (group.owner_id !== user.id) {
      return { success: false, error: "Só o dono pode apagar o grupo." }
    }

    const { error } = await supabase.from("study_groups").delete().eq("id", groupId)

    if (error) {
      console.error("Erro ao apagar grupo de estudos:", error)
      return { success: false, error: "Não foi possível apagar o grupo agora." }
    }

    revalidatePath("/ranking")
    return { success: true }
  } catch (err: unknown) {
    console.error("Erro na server action de apagar grupo:", err)
    return { success: false, error: "Dados inválidos ou erro interno." }
  }
}

export async function listMyStudyGroupsAction(): Promise<ActionResult<{ groups: StudyGroup[] }>> {
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)

    if (!effectiveUserId) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from("study_group_members")
      .select("group_id")
      .eq("user_id", effectiveUserId)

    if (membershipsError) {
      console.error("Erro ao listar grupos de estudos:", membershipsError)
      return { success: false, error: "Não foi possível carregar suas turmas agora." }
    }

    const groupIds = (memberships || []).map((m) => m.group_id)
    if (groupIds.length === 0) {
      return { success: true, groups: [] }
    }

    const { data: groups, error: groupsError } = await supabase
      .from("study_groups")
      .select("id, name, invite_code, owner_id, created_at")
      .in("id", groupIds)
      .order("created_at", { ascending: false })

    if (groupsError) {
      console.error("Erro ao carregar grupos de estudos:", groupsError)
      return { success: false, error: "Não foi possível carregar suas turmas agora." }
    }

    return { success: true, groups: (groups || []).map((g) => mapGroupRow(g as StudyGroupRow)) }
  } catch (err: unknown) {
    console.error("Erro na server action de listar grupos:", err)
    return { success: false, error: "Erro interno." }
  }
}

export async function getStudyGroupDetailAction(
  input: { groupId: string },
): Promise<
  ActionResult<{ group: StudyGroup; isOwner: boolean; members: StudyGroupMember[] }>
> {
  try {
    const { groupId } = studyGroupIdSchema.parse(input)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data: group, error: groupError } = await supabase
      .from("study_groups")
      .select("id, name, invite_code, owner_id, created_at")
      .eq("id", groupId)
      .maybeSingle()

    if (groupError || !group) {
      return { success: false, error: "Grupo não encontrado." }
    }

    const { data: members, error: membersError } = await supabase
      .from("study_group_members")
      .select("user_id, joined_at, profiles(name, avatar_url)")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true })

    if (membersError) {
      console.error("Erro ao carregar membros do grupo de estudos:", membersError)
      return { success: false, error: "Não foi possível carregar os membros agora." }
    }

    const mappedMembers: StudyGroupMember[] = (members || []).map((m) => {
      const profile = m.profiles as unknown as { name: string | null; avatar_url: string | null } | null
      return {
        userId: m.user_id as string,
        name: profile?.name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        joinedAt: m.joined_at as string,
      }
    })

    return {
      success: true,
      group: mapGroupRow(group as StudyGroupRow),
      isOwner: group.owner_id === user.id,
      members: mappedMembers,
      // Fase J.3 adiciona o ranking interno e a meta coletiva aqui.
    }
  } catch (err: unknown) {
    console.error("Erro na server action de detalhe do grupo:", err)
    return { success: false, error: "Erro interno." }
  }
}
