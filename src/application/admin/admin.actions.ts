"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import * as Sentry from "@sentry/nextjs"
import crypto from "crypto"

import { createClient } from "@/infrastructure/supabase/server"
import {
  type UserRole,
  SUPPORT_SESSION_COOKIE_NAME,
  SUPPORT_SESSION_MAX_AGE_SECONDS,
  canOperatorAccessTarget,
  getActiveSupportSession,
  getUserRole,
  requireAdmin,
  requireModeratorOrAdmin,
} from "./auth-guard"

export interface AdminUserListItem {
  id: string
  name: string
  email: string
  role: UserRole
  createdAt: string
  weeklyStudyHours: number
  onboardingCompleted: boolean
}

export interface AdminUserDetail {
  id: string
  name: string
  email: string
  role: UserRole
  createdAt: string
  weeklyStudyHours: number
  workRegime: string | null
  experienceLevel: string | null
  onboardingCompleted: boolean
  stats: {
    totalSessions: number
    totalMinutes: number
    totalQuestions: number
    questionsCorrect: number
    accuracyPercentage: number
  }
  activePlan: {
    id: string
    version: number
    generatedReason: string
    createdAt: string
  } | null
}

// ---------------------------------------------------------------------------
// 1. PESQUISA E LISTAGEM DE USUÁRIOS
// ---------------------------------------------------------------------------

export async function searchUsersAdminAction(params: {
  query?: string
  page?: number
  limit?: number
  roleFilter?: string
}): Promise<{
  data: {
    users: AdminUserListItem[]
    total: number
    page: number
    totalPages: number
  } | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const {
      data: { user: operator },
    } = await supabase.auth.getUser()

    if (!operator || operator.email?.toLowerCase() !== "rendersonluan@gmail.com") {
      return { data: null, error: "Acesso não autorizado." }
    }

    await requireModeratorOrAdmin(supabase, operator.id)

    const page = Math.max(1, params.page || 1)
    const limit = Math.min(50, Math.max(1, params.limit || 15))
    const offset = (page - 1) * limit

    let profileQuery = supabase
      .from("profiles")
      .select("id, name, full_name, email, weekly_study_hours, onboarding_completed, created_at", {
        count: "exact",
      })

    if (params.query && params.query.trim()) {
      const q = params.query.trim()
      profileQuery = profileQuery.or(`name.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%,id.eq.${q}`)
    }

    profileQuery = profileQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: profiles, count, error: profError } = await profileQuery

    if (profError) {
      Sentry.captureException(profError, { extra: { feature: "admin", step: "search_users" } })
      return { data: null, error: "Erro ao consultar usuários." }
    }

    const userIds = (profiles ?? []).map((p) => p.id)
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"])

    const roleByUserId = new Map<string, UserRole>()
    ;(rolesData ?? []).forEach((r) => {
      roleByUserId.set(r.user_id, (r.role as UserRole) || "user")
    })

    const users: AdminUserListItem[] = (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name || p.full_name || p.email?.split("@")[0] || "Estudante",
      email: p.email || "",
      role: roleByUserId.get(p.id) || "user",
      createdAt: p.created_at,
      weeklyStudyHours: p.weekly_study_hours || 10,
      onboardingCompleted: p.onboarding_completed ?? false,
    }))

    const filteredUsers = params.roleFilter && params.roleFilter !== "all"
      ? users.filter((u) => u.role === params.roleFilter)
      : users

    const total = count ?? filteredUsers.length
    const totalPages = Math.ceil(total / limit)

    return {
      data: {
        users: filteredUsers,
        total,
        page,
        totalPages,
      },
      error: null,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Acesso negado."
    return { data: null, error: message }
  }
}

// ---------------------------------------------------------------------------
// 2. DETALHES DE UM USUÁRIO PARA DIAGNÓSTICO
// ---------------------------------------------------------------------------

export async function getUserDetailsAdminAction(
  targetUserId: string,
): Promise<{ data: AdminUserDetail | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user: operator },
    } = await supabase.auth.getUser()

    if (!operator || operator.email?.toLowerCase() !== "rendersonluan@gmail.com") {
      return { data: null, error: "Não autorizado." }
    }

    await requireModeratorOrAdmin(supabase, operator.id)

    // Perfil
    const { data: profile, error: profError } = await supabase
      .from("profiles")
      .select("id, name, full_name, email, weekly_study_hours, work_regime, experience_level, onboarding_completed, created_at")
      .eq("id", targetUserId)
      .maybeSingle()

    if (profError || !profile) {
      return { data: null, error: "Usuário não encontrado." }
    }

    const role = await getUserRole(supabase, targetUserId)

    // Estatísticas básicas de estudo
    const { data: historyData } = await supabase
      .from("study_history")
      .select("duration_minutes")
      .eq("user_id", targetUserId)

    const totalSessions = historyData?.length ?? 0
    const totalMinutes = (historyData ?? []).reduce((acc, h) => acc + (h.duration_minutes || 0), 0)

    // Questões
    const { data: attemptsData } = await supabase
      .from("question_attempts")
      .select("correct")
      .eq("user_id", targetUserId)

    const totalQuestions = attemptsData?.length ?? 0
    const questionsCorrect = (attemptsData ?? []).filter((a) => a.correct).length
    const accuracyPercentage = totalQuestions > 0 ? Math.round((questionsCorrect / totalQuestions) * 100) : 0

    // Plano ativo
    const { data: planData } = await supabase
      .from("study_plans")
      .select("id, version, generated_reason, created_at")
      .eq("user_id", targetUserId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      data: {
        id: profile.id,
        name: profile.name || profile.full_name || profile.email?.split("@")[0] || "Estudante",
        email: profile.email || "",
        role,
        createdAt: profile.created_at,
        weeklyStudyHours: profile.weekly_study_hours || 10,
        workRegime: profile.work_regime,
        experienceLevel: profile.experience_level,
        onboardingCompleted: profile.onboarding_completed ?? false,
        stats: {
          totalSessions,
          totalMinutes,
          totalQuestions,
          questionsCorrect,
          accuracyPercentage,
        },
        activePlan: planData ? {
          id: planData.id,
          version: planData.version,
          generatedReason: planData.generated_reason || "manual",
          createdAt: planData.created_at,
        } : null,
      },
      error: null,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Acesso negado."
    return { data: null, error: message }
  }
}

// ---------------------------------------------------------------------------
// 3. INICIAR MODO DE SUPORTE (IMPERSONAÇÃO TEMPORÁRIA)
// ---------------------------------------------------------------------------

export async function startSupportSessionAction(
  targetUserId: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user: operator },
    } = await supabase.auth.getUser()

    if (!operator || operator.email?.toLowerCase() !== "rendersonluan@gmail.com") {
      return { ok: false, error: "Não autorizado." }
    }

    const { role: operatorRole } = await requireModeratorOrAdmin(supabase, operator.id)
    const targetRole = await getUserRole(supabase, targetUserId)

    // Validação de hierarquia de segurança
    if (!canOperatorAccessTarget(operatorRole, targetRole)) {
      return {
        ok: false,
        error: "Operação não permitida: moderadores não podem acessar contas de administradores.",
      }
    }

    // Encerrar qualquer sessão de suporte anterior deste operador
    await supabase
      .from("support_sessions")
      .update({ status: "ENDED", ended_at: new Date().toISOString() })
      .eq("moderator_id", operator.id)
      .eq("status", "ACTIVE")

    // Criar nova sessão de suporte com expiração de 30 minutos
    const sessionToken = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + SUPPORT_SESSION_MAX_AGE_SECONDS * 1000).toISOString()

    const { error: insError } = await supabase.from("support_sessions").insert({
      moderator_id: operator.id,
      target_user_id: targetUserId,
      session_token: sessionToken,
      expires_at: expiresAt,
      status: "ACTIVE",
    })

    if (insError) {
      console.error("[startSupportSessionAction] insError:", insError)
      Sentry.captureException(insError, { extra: { feature: "admin", step: "start_support_session" } })
      return { ok: false, error: insError.message || "Erro ao registrar sessão de suporte no banco." }
    }

    // Registrar log de auditoria
    await supabase.from("audit_logs").insert({
      actor_user_id: operator.id,
      target_user_id: targetUserId,
      action: "SUPPORT_SESSION_STARTED",
      metadata: { operatorRole, targetRole, expiresAt },
    })

    // Salvar token da sessão no cookie seguro
    const cookieStore = await cookies()
    cookieStore.set(SUPPORT_SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SUPPORT_SESSION_MAX_AGE_SECONDS,
      path: "/",
    })

    revalidatePath("/", "layout")
    return { ok: true, error: null }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Acesso negado."
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// 4. ENCERRAR MODO DE SUPORTE
// ---------------------------------------------------------------------------

export async function endSupportSessionAction(): Promise<{ ok: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user: operator },
    } = await supabase.auth.getUser()

    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SUPPORT_SESSION_COOKIE_NAME)?.value

    if (operator && sessionToken) {
      const { data: session } = await supabase
        .from("support_sessions")
        .select("id, target_user_id")
        .eq("session_token", sessionToken)
        .maybeSingle()

      await supabase
        .from("support_sessions")
        .update({ status: "ENDED", ended_at: new Date().toISOString() })
        .eq("session_token", sessionToken)

      if (session) {
        await supabase.from("audit_logs").insert({
          actor_user_id: operator.id,
          target_user_id: session.target_user_id,
          action: "SUPPORT_SESSION_ENDED",
          metadata: { sessionId: session.id },
        })
      }
    }

    cookieStore.delete(SUPPORT_SESSION_COOKIE_NAME)
    revalidatePath("/", "layout")
    return { ok: true, error: null }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao encerrar suporte."
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// 5. GERENCIAR ROLES (SOMENTE ADMIN)
// ---------------------------------------------------------------------------

export async function updateUserRoleAdminAction(
  targetUserId: string,
  newRole: UserRole,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user: operator },
    } = await supabase.auth.getUser()

    if (!operator || operator.email?.toLowerCase() !== "rendersonluan@gmail.com") {
      return { ok: false, error: "Não autorizado." }
    }

    await requireAdmin(supabase, operator.id)

    // Proteção: não permitir remover o último administrador do sistema
    const currentTargetRole = await getUserRole(supabase, targetUserId)
    if (currentTargetRole === "admin" && newRole !== "admin") {
      const { count } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")

      if ((count ?? 0) <= 1) {
        return {
          ok: false,
          error: "Operação bloqueada: o sistema precisa ter no mínimo 1 administrador ativo.",
        }
      }
    }

    const { error: upsertError } = await supabase
      .from("user_roles")
      .upsert(
        {
          user_id: targetUserId,
          role: newRole,
          created_by: operator.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )

    if (upsertError) {
      Sentry.captureException(upsertError, { extra: { feature: "admin", step: "update_role" } })
      return { ok: false, error: "Erro ao atualizar permissão do usuário." }
    }

    // Registrar no audit_logs
    await supabase.from("audit_logs").insert({
      actor_user_id: operator.id,
      target_user_id: targetUserId,
      action: "ROLE_CHANGED",
      metadata: { previousRole: currentTargetRole, newRole },
    })

    revalidatePath("/admin")
    return { ok: true, error: null }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Acesso negado."
    return { ok: false, error: message }
  }
}
