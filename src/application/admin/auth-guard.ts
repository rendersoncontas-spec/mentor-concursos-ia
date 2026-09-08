import { cookies } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"

export type UserRole = "user" | "moderator" | "admin"

export const SUPPORT_SESSION_COOKIE_NAME = "mentor_support_session_token"
export const SUPPORT_SESSION_MAX_AGE_SECONDS = 30 * 60 // 30 minutos

export interface ActiveSupportSession {
  id: string
  moderatorId: string
  targetUserId: string
  targetUserName: string
  targetUserEmail: string
  sessionToken: string
  startedAt: string
  expiresAt: string
  status: "ACTIVE" | "ENDED" | "EXPIRED"
}

export interface EffectiveUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  role: UserRole
  isSupportMode: boolean
  operatorId: string
  supportSession: ActiveSupportSession | null
}

/**
 * Retorna o usuário efetivo para a renderização das telas.
 * Se o operador for Admin/Moderador e estiver com uma sessão de suporte ativa,
 * retorna o ID e perfil do estudante alvo (impersonação em suporte).
 */
export async function getEffectiveSessionUser(
  supabase: SupabaseClient,
): Promise<EffectiveUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const rawRole = await getUserRole(supabase, user.id)
  const isAuthorizedEmail = user.email?.toLowerCase() === "rendersonluan@gmail.com"
  const userRole: UserRole =
    isAuthorizedEmail && (rawRole === "admin" || rawRole === "moderator") ? rawRole : "user"

  let supportSession: ActiveSupportSession | null = null
  if (userRole === "admin" || userRole === "moderator") {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SUPPORT_SESSION_COOKIE_NAME)?.value
    supportSession = await getActiveSupportSession(supabase, user.id, sessionToken)
  }

  if (supportSession) {
    return {
      id: supportSession.targetUserId,
      email: supportSession.targetUserEmail,
      name: supportSession.targetUserName,
      avatarUrl: null,
      role: userRole,
      isSupportMode: true,
      operatorId: user.id,
      supportSession,
    }
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("name, full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle()

  const profileName =
    profileData?.name ||
    profileData?.full_name ||
    user.user_metadata?.["full_name"] ||
    user.email?.split("@")[0] ||
    "Estudante"

  return {
    id: user.id,
    email: user.email || "",
    name: profileName,
    avatarUrl:
      profileData?.avatar_url ||
      (user.user_metadata?.["avatar_url"] as string | undefined) ||
      null,
    role: userRole,
    isSupportMode: false,
    operatorId: user.id,
    supportSession: null,
  }
}

/**
 * Retorna o ID do usuário efetivo para operações (próprio usuário ou estudante em suporte).
 */
export async function getEffectiveUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const effectiveUser = await getEffectiveSessionUser(supabase)
  return effectiveUser ? effectiveUser.id : null
}

/**
 * Consulta a role do usuário no banco de dados de forma segura.
 * Nunca confia em payloads vindos do cliente.
 */
export async function getUserRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserRole> {
  if (!userId) return "user"

  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle()

    if (error || !data?.role) {
      return "user"
    }

    const role = data.role as string
    if (role === "admin" || role === "moderator" || role === "user") {
      return role
    }

    return "user"
  } catch {
    return "user"
  }
}

/**
 * Validação estrita: exige que o usuário seja Administrador.
 * Lança erro seguro em caso de acesso não autorizado.
 */
export async function requireAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const role = await getUserRole(supabase, userId)
  if (role !== "admin") {
    throw new Error("Acesso negado: operação restrita a administradores.")
  }
}

/**
 * Validação: exige que o usuário seja Moderador ou Administrador.
 */
export async function requireModeratorOrAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ role: "moderator" | "admin" }> {
  const role = await getUserRole(supabase, userId)
  if (role !== "moderator" && role !== "admin") {
    throw new Error("Acesso negado: operação restrita à equipe de moderação e administração.")
  }
  return { role }
}

/**
 * Valida a hierarquia de acesso em modo suporte:
 * - USER: não pode impersonar ninguém.
 * - MODERATOR: pode impersonar USER, mas NUNCA ADMIN.
 * - ADMIN: pode impersonar USER e MODERATOR.
 */
export function canOperatorAccessTarget(
  operatorRole: UserRole,
  targetRole: UserRole,
): boolean {
  if (operatorRole === "user") return false
  if (operatorRole === "moderator") {
    return targetRole === "user"
  }
  if (operatorRole === "admin") {
    return targetRole === "user" || targetRole === "moderator"
  }
  return false
}

/**
 * Busca e valida uma sessão ativa de suporte vinculada ao moderador.
 * Invalida automaticamente sessões com expires_at ultrapassado.
 */
export async function getActiveSupportSession(
  supabase: SupabaseClient,
  moderatorId: string,
  sessionToken?: string,
): Promise<ActiveSupportSession | null> {
  if (!moderatorId) return null

  let query = supabase
    .from("support_sessions")
    .select(`
      id,
      moderator_id,
      target_user_id,
      session_token,
      started_at,
      expires_at,
      status
    `)
    .eq("moderator_id", moderatorId)
    .eq("status", "ACTIVE")

  if (sessionToken) {
    query = query.eq("session_token", sessionToken)
  }

  const { data: sessionRow, error } = await query
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !sessionRow) return null

  const now = new Date()
  const expiresAt = new Date(sessionRow.expires_at)

  // Se a sessão expirou, marca como EXPIRED no banco
  if (now > expiresAt) {
    await supabase
      .from("support_sessions")
      .update({ status: "EXPIRED", ended_at: now.toISOString() })
      .eq("id", sessionRow.id)

    return null
  }

  // Buscar dados básicos do alvo para exibição no banner
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("name, full_name, email")
    .eq("id", sessionRow.target_user_id)
    .maybeSingle()

  const targetName =
    targetProfile?.name ||
    targetProfile?.full_name ||
    targetProfile?.email?.split("@")[0] ||
    "Estudante"

  return {
    id: sessionRow.id,
    moderatorId: sessionRow.moderator_id,
    targetUserId: sessionRow.target_user_id,
    targetUserName: targetName,
    targetUserEmail: targetProfile?.email || "",
    sessionToken: sessionRow.session_token,
    startedAt: sessionRow.started_at,
    expiresAt: sessionRow.expires_at,
    status: sessionRow.status as "ACTIVE",
  }
}
