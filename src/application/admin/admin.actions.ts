"use server"

import { cookies } from "next/headers"
import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"
import { revalidatePath } from "next/cache"
import * as Sentry from "@sentry/nextjs"
import crypto from "crypto"

import { createClient } from "@/infrastructure/supabase/server"
import { escapePostgrestOrValue } from "./search-escape"
import {
  type UserRole,
  SUPPORT_SESSION_COOKIE_NAME,
  SUPPORT_SESSION_MAX_AGE_SECONDS,
  decideAdminReadAccess,
  decideSupportAccess,
  requireAdmin,
  requireModeratorOrAdmin,
  resolveTargetRoleForAuthorization,
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
    /**
     * A1.2 — indisponibilidade por fonte (independentes). true = leitura
     * falhou; números daquela fonte são 0 de fallback e NÃO devem ser
     * exibidos como reais. false = leitura ok (0 é vazio real).
     */
    unavailable: {
      history: boolean
      attempts: boolean
    }
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

    if (!operator) {
      return { data: null, error: "Acesso não autorizado." }
    }

    const { role: operatorRole } = await requireModeratorOrAdmin(supabase, operator.id)

    const page = Math.max(1, params.page || 1)
    const limit = Math.min(50, Math.max(1, params.limit || 15))
    const offset = (page - 1) * limit

    // A1.2: roleFilter válido vai ao banco (ids via user_roles) para que data
    // e total representem o mesmo conjunto; inválido é rejeitado (nunca lista
    // filtrada com total global).
    const roleFilter = params.roleFilter && params.roleFilter !== "all" ? params.roleFilter : null
    if (roleFilter !== null && roleFilter !== "user" && roleFilter !== "moderator" && roleFilter !== "admin") {
      return { data: null, error: "Filtro de papel inválido." }
    }

    // G1.1 (G-03): moderador nunca lista administradores — nem pelo filtro
    // explícito (retorna conjunto vazio, sem revelar existência/quantidade).
    if (operatorRole === "moderator" && roleFilter === "admin") {
      return { data: { users: [], total: 0, page, totalPages: 0 }, error: null }
    }

    let roleUserIds: string[] | null = null
    let excludeRoleUserIds: string[] | null = null
    if (roleFilter !== null) {
      if (roleFilter === "user") {
        // "user" exibido inclui quem NÃO tem linha em user_roles (getUserRole
        // trata ausência como "user"). Conjunto exato = todos menos os com
        // papel elevado (conjunto pequeno, sem carregar todos os usuários).
        const { data: elevatedRows, error: elevatedError } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["moderator", "admin"])
        if (elevatedError) {
          Sentry.captureException(elevatedError, { extra: { feature: "admin", step: "search_users_roles" } })
          return { data: null, error: "Erro ao filtrar por papel." }
        }
        excludeRoleUserIds = (elevatedRows ?? []).map((r) => r.user_id)
      } else {
        const { data: roleRows, error: roleError } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", roleFilter)
        if (roleError) {
          Sentry.captureException(roleError, { extra: { feature: "admin", step: "search_users_roles" } })
          return { data: null, error: "Erro ao filtrar por papel." }
        }
        roleUserIds = (roleRows ?? []).map((r) => r.user_id)
      }
    }

    let profileQuery = supabase
      .from("profiles")
      .select("id, name, full_name, email, weekly_study_hours, onboarding_completed, created_at", {
        count: "exact",
      })

    if (roleUserIds !== null) {
      profileQuery = profileQuery.in("id", roleUserIds.length > 0 ? roleUserIds : ["00000000-0000-0000-0000-000000000000"])
    } else if (excludeRoleUserIds !== null && excludeRoleUserIds.length > 0) {
      profileQuery = profileQuery.not("id", "in", `(${excludeRoleUserIds.join(",")})`)
    }

    if (params.query && params.query.trim()) {
      const q = escapePostgrestOrValue(params.query.trim())
      profileQuery = profileQuery.or(`name.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%,id.eq.${q}`)
    }

    profileQuery = profileQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: profiles, count, error: profError } = await profileQuery

    if (profError) {
      Sentry.captureException(profError, { extra: { feature: "admin", step: "search_users" } })
      return { data: null, error: "Erro ao consultar usuários." }
    }

    const userIds = (profiles ?? []).map((p) => p.id)
    // A1.2: leitura de roles com erro honesto — sem ela, um admin apareceria
    // como "user" na lista. Erro aqui invalida a resposta inteira.
    const { data: rolesData, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"])

    if (rolesError) {
      Sentry.captureException(rolesError, { extra: { feature: "admin", step: "search_users_roles_display" } })
      return { data: null, error: "Erro ao carregar papéis dos usuários." }
    }

    const roleByUserId = new Map<string, UserRole>()
    ;(rolesData ?? []).forEach((r) => {
      roleByUserId.set(r.user_id, (r.role as UserRole) || "user")
    })

    // A1.2: com roleFilter no banco, data/total já são coerentes; mantém-se
    // apenas a normalização para o tipo exibido (sem novo filtro).
    let users: AdminUserListItem[] = (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name || p.full_name || p.email?.split("@")[0] || "Estudante",
      email: p.email || "",
      role: roleByUserId.get(p.id) || "user",
      createdAt: p.created_at,
      weeklyStudyHours: p.weekly_study_hours || 10,
      onboardingCompleted: p.onboarding_completed ?? false,
    }))

    // G1.1 (G-03): a leitura em lote de `user_roles` acima pode ser incompleta
    // para o operador (RLS) — e nunca pode transformar ausência de linha em
    // "user" para fins de hierarquia. Quando o operador é moderador, o papel
    // real de cada candidato é resolvido pelo caminho canônico (fail-closed)
    // e administradores (ou papéis não-resolvidos) são excluídos da lista.
    if (operatorRole === "moderator" && users.length > 0) {
      const resolved = await Promise.all(
        users.map(async (u) => ({
          user: u,
          targetRole: await resolveTargetRoleForAuthorization(supabase, u.id),
        })),
      )
      users = resolved
        .filter(({ targetRole }) => {
          const decision = decideAdminReadAccess(operatorRole, targetRole)
          return decision.allowed
        })
        .map(({ user, targetRole }) => ({
          ...user,
          role: (targetRole ?? user.role) as UserRole,
        }))
    }

    const total = count ?? users.length
    const totalPages = Math.ceil(total / limit)

    return {
      data: {
        users,
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

    if (!operator) {
      return { data: null, error: "Não autorizado." }
    }

    const { role: operatorRole } = await requireModeratorOrAdmin(supabase, operator.id)

    // Perfil
    const { data: profile, error: profError } = await supabase
      .from("profiles")
      .select("id, name, full_name, email, weekly_study_hours, work_regime, experience_level, onboarding_completed, created_at")
      .eq("id", targetUserId)
      .maybeSingle()

    if (profError || !profile) {
      return { data: null, error: "Usuário não encontrado." }
    }

    // G1.1 (G-01/G-03): papel do alvo pelo caminho canônico (fail-closed) e
    // hierarquia também na LEITURA — moderator→admin é sempre negado, sem
    // transformar falha de resolução em "user".
    const targetRole = await resolveTargetRoleForAuthorization(supabase, targetUserId)
    const readDecision = decideAdminReadAccess(operatorRole, targetRole)
    if (!readDecision.allowed) {
      return { data: null, error: readDecision.reason }
    }
    const role: UserRole = targetRole ?? "user"

    // Fase F.1: sessões e questões paginadas (antes 1 requisição cada, cortada
    // em 1.000 linhas → total de sessões travava em 1.000 e minutos
    // subcontados) e as três leituras independentes em paralelo (antes em
    // sequência).
    // A1.2: erro NÃO vira [] silencioso — cada fonte carrega sua flag em
    // stats.unavailable; a outra fonte continua valendo se teve sucesso.
    const [historyResult, attemptsResult, { data: planData }] = await Promise.all([
      // Estatísticas básicas de estudo
      fetchAllRowsPaged<{ duration_minutes: number | null }>(
        (withCount) =>
          supabase.from("study_history").select("duration_minutes", countOption(withCount)).eq("user_id", targetUserId),
        [{ column: "id", ascending: true }],
      ),
      // Questões
      fetchAllRowsPaged<{ correct: boolean }>(
        (withCount) =>
          supabase.from("question_attempts").select("correct", countOption(withCount)).eq("user_id", targetUserId),
        [{ column: "id", ascending: true }],
      ),
      // Plano ativo
      supabase
        .from("study_plans")
        .select("id, version, generated_reason, created_at")
        .eq("user_id", targetUserId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const historyUnavailable = historyResult.error !== null
    const attemptsUnavailable = attemptsResult.error !== null
    if (historyUnavailable) {
      Sentry.captureException(historyResult.error, { extra: { feature: "admin", step: "user_details_history" } })
    }
    if (attemptsUnavailable) {
      Sentry.captureException(attemptsResult.error, { extra: { feature: "admin", step: "user_details_attempts" } })
    }
    const historyData = historyUnavailable ? [] : historyResult.data
    const attemptsData = attemptsUnavailable ? [] : attemptsResult.data

    const totalSessions = historyData.length
    const totalMinutes = historyData.reduce((acc, h) => acc + (h.duration_minutes || 0), 0)

    const totalQuestions = attemptsData.length
    const questionsCorrect = attemptsData.filter((a) => a.correct).length
    const accuracyPercentage = totalQuestions > 0 ? Math.round((questionsCorrect / totalQuestions) * 100) : 0

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
          unavailable: {
            history: historyUnavailable,
            attempts: attemptsUnavailable,
          },
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

    if (!operator) {
      return { ok: false, error: "Não autorizado." }
    }

    const { role: operatorRole } = await requireModeratorOrAdmin(supabase, operator.id)

    // G1.1 (G-01): caminho canônico único — resolve o papel real do alvo
    // (via RPC, sem depender da RLS da tabela) e decide pela matriz.
    // Falha de resolução → fail-closed (nunca "erro → user").
    const targetRole = await resolveTargetRoleForAuthorization(supabase, targetUserId)
    const supportDecision = decideSupportAccess(operatorRole, targetRole)

    // Validação de hierarquia de segurança
    if (!supportDecision.allowed) {
      return {
        ok: false,
        error: supportDecision.reason,
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

    // Registrar log de auditoria.
    // A1.2: o modal promete que a sessão será registrada; falha aqui retorna
    // erro ANTES de entregar o cookie — sem sessão utilizável sem trilha.
    // Retry posterior é seguro (sessões anteriores são encerradas acima).
    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor_user_id: operator.id,
      target_user_id: targetUserId,
      action: "SUPPORT_SESSION_STARTED",
      metadata: { operatorRole, targetRole, expiresAt },
    })

    if (auditError) {
      Sentry.captureException(auditError, { extra: { feature: "admin", step: "start_support_audit" } })
      return { ok: false, error: "Não foi possível registrar a sessão de suporte. Tente novamente." }
    }

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

    // A1.1: action administrativa exige dono — anônimo não executa nada
    // (antes, chamada anônima passava e só limpava cookie).
    if (!operator) {
      return { ok: false, error: "Não autenticado." }
    }

    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SUPPORT_SESSION_COOKIE_NAME)?.value

    if (sessionToken) {
      const { data: session } = await supabase
        .from("support_sessions")
        .select("id, target_user_id")
        .eq("session_token", sessionToken)
        // A1.1: só a sessão do próprio operador (defesa em profundidade
        // além do token imprevisível e da RLS).
        .eq("moderator_id", operator.id)
        .maybeSingle()

      await supabase
        .from("support_sessions")
        .update({ status: "ENDED", ended_at: new Date().toISOString() })
        .eq("session_token", sessionToken)
        .eq("moderator_id", operator.id)

      if (session) {
        // A1.2: encerramento é limpeza idempotente — audit aqui é best-effort
        // documentado (a sessão já foi encerrada acima; falhar a saída por
        // causa do log prenderia o operador no modo suporte).
        await supabase.from("audit_logs").insert({
          actor_user_id: operator.id,
          target_user_id: session.target_user_id,
          action: "SUPPORT_SESSION_ENDED",
          metadata: { sessionId: session.id },
        })
      }
    }

    cookieStore.set(SUPPORT_SESSION_COOKIE_NAME, "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    })
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
  // A1.1 — ordem: VALIDAÇÃO → AUTORIZAÇÃO → ALVO → TRAVA → WRITE → AUDIT.
  // Allowlist runtime (não só TypeScript/CHECK): rejeita antes de qualquer
  // leitura/escrita; sem coerção silenciosa nem default.
  if (newRole !== "user" && newRole !== "moderator" && newRole !== "admin") {
    return { ok: false, error: "Papel inválido." }
  }
  try {
    const supabase = await createClient()
    const {
      data: { user: operator },
    } = await supabase.auth.getUser()

    if (!operator) {
      return { ok: false, error: "Não autorizado." }
    }

    await requireAdmin(supabase, operator.id)

    // Proteção: não permitir remover o último administrador do sistema.
    // G1.1 (G-01): papel atual pelo caminho canônico — se não for possível
    // verificar (null), fail-closed em vez de presumir "user".
    const resolvedCurrentRole = await resolveTargetRoleForAuthorization(supabase, targetUserId)
    if (resolvedCurrentRole === null) {
      return {
        ok: false,
        error: "Não foi possível verificar o papel atual do usuário. Operação bloqueada por segurança.",
      }
    }
    const currentTargetRole: UserRole = resolvedCurrentRole
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

    // A1.3 — rechecagem pós-escrita contra corrida (TOCTOU): duas demissões
    // simultâneas do penúltimo/último admin passariam na trava acima juntas.
    // Se não restar nenhum admin, reverte a própria alteração (upsert é
    // idempotente, então o retry posterior é seguro) e reporta erro.
    if (currentTargetRole === "admin" && newRole !== "admin") {
      const { count: remainingAdmins } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")

      if ((remainingAdmins ?? 0) <= 0) {
        await supabase
          .from("user_roles")
          .upsert(
            {
              user_id: targetUserId,
              role: "admin",
              created_by: operator.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          )
        Sentry.captureException(new Error("last-admin race reverted"), {
          extra: { feature: "admin", step: "update_role_race" },
        })
        return {
          ok: false,
          error: "Operação bloqueada: o sistema precisa ter no mínimo 1 administrador ativo.",
        }
      }
    }

    // Registrar no audit_logs.
    // A1.2: troca de papel sem trilha seria mudança silenciosa de privilégio —
    // falha aqui retorna erro. Retry é seguro (upsert idempotente).
    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor_user_id: operator.id,
      target_user_id: targetUserId,
      action: "ROLE_CHANGED",
      metadata: { previousRole: currentTargetRole, newRole },
    })

    if (auditError) {
      Sentry.captureException(auditError, { extra: { feature: "admin", step: "role_changed_audit" } })
      return { ok: false, error: "Papel atualizado, mas o registro de auditoria falhou. Verifique os logs e tente novamente." }
    }

    revalidatePath("/admin")
    return { ok: true, error: null }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Acesso negado."
    return { ok: false, error: message }
  }
}

/**
 * Audita ação sensível executada durante impersonation (modo suporte).
 * Chamado pelas actions destrutivas quando há sessão de suporte ativa.
 * Nunca grava senhas/tokens — apenas identificadores e resultado.
 *
 * A1.1: implementação canônica vive em ./admin-audit (módulo SEM "use
 * server", logo não é endpoint público). Nenhum reexport aqui de propósito.
 */
