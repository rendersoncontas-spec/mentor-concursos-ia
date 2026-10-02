import { cache } from "react"

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
 *
 * Fase F (performance): memorizada por requisição com `cache()` do React. O
 * layout protegido, a página e os loaders da mesma renderização usam a mesma
 * instância de client (ver `createClient`), então `auth.getUser()` + papel +
 * perfil rodam uma vez por navegação em vez de uma vez por chamador. Em
 * Server Actions e Route Handlers `cache()` não memoriza (comportamento
 * idêntico ao anterior).
 */
export const getEffectiveSessionUser = cache(async function getEffectiveSessionUser(
  supabase: SupabaseClient,
): Promise<EffectiveUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Fase F (performance): papel e perfil não dependem um do outro — antes eram
  // 2 idas ao banco em sequência (papel → perfil), agora vão juntas. O perfil
  // só não é usado quando há sessão de suporte ativa (caso raro, de admin).
  const [userRole, { data: profileData }] = await Promise.all([
    getUserRole(supabase, user.id),
    supabase
      .from("profiles")
      .select("name, full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
  ])

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
})

/**
 * Contexto de auditoria para uma mutação sob possível sessão de suporte.
 * `resource` é um identificador útil do registro afetado quando disponível
 * (id da linha, chave composta como string etc.) — nunca dado sensível.
 */
export interface SupportAuditContext {
  action: string
  resource?: string
}

/**
 * Retorna o ID do usuário efetivo para operações (próprio usuário ou
 * estudante em suporte).
 *
 * Fase G2.6.1 (auditoria de segurança — achado ALTO "trilha de auditoria do
 * modo suporte incompleta"): quando `auditContext` é informado e a chamada
 * ocorre durante uma sessão de suporte ativa, esta função registra
 * automaticamente em `audit_logs` quem fez o quê a quem — sem que cada
 * Server Action precise reimplementar a leitura de cookie/sessão de suporte
 * (o padrão manual que existia só em `deleteCycleAction`, e só ali).
 *
 * Chamadas de LEITURA continuam passando sem `auditContext` (comportamento
 * idêntico ao anterior, nenhuma auditoria é gerada). Só mutações
 * (insert/update/delete/upsert) alcançáveis em modo suporte devem passar um
 * `auditContext`.
 *
 * Importante: a auditoria roda FORA de `getEffectiveSessionUser` (que é
 * memorizada por requisição via `cache()`) propositalmente — se o insert de
 * auditoria estivesse dentro da função memorizada, a segunda chamada na
 * mesma requisição (ex.: uma leitura seguida de uma mutação, com contextos
 * de auditoria diferentes) reaproveitaria o resultado em cache e nunca
 * executaria de novo, perdendo o registro da mutação.
 */
export async function getEffectiveUserId(
  supabase: SupabaseClient,
  auditContext?: SupportAuditContext,
): Promise<string | null> {
  const effectiveUser = await getEffectiveSessionUser(supabase)
  if (!effectiveUser) return null

  if (auditContext && effectiveUser.isSupportMode && effectiveUser.supportSession) {
    const { auditSupportAction } = await import("./admin-audit")
    await auditSupportAction(supabase, {
      supportSessionId: effectiveUser.supportSession.id,
      moderatorId: effectiveUser.operatorId,
      targetUserId: effectiveUser.id,
      action: auditContext.action,
      resource: auditContext.resource ?? "",
      result: "success",
    })
  }

  return effectiveUser.id
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
 * G1.1 (G-01/G-03) — resolução canônica do papel do ALVO para decisões de
 * autorização.
 *
 * Por que não `getUserRole` direto: ela lê `user_roles` com o JWT do operador.
 * Se a RLS expuser só a própria linha, ler o papel de OUTRO usuário retorna
 * 0 linhas e o fallback "user" permitiria `moderator → admin` (bypass de
 * hierarquia). Este resolvedor usa a RPC `get_user_role` (SECURITY DEFINER,
 * contorna a RLS) e é FAIL-CLOSED:
 *
 * - RPC ok com papel válido → o papel real (mesmo que o operador não possa
 *   ler a tabela diretamente).
 * - RPC com erro, valor inesperado ou alvo sem papel resolvível → `null`.
 *   Quem chama NUNCA pode interpretar `null` como "user".
 *
 * Compatibilidade: se a RPC ainda não existir no banco (base sem a migration
 * de moderação), tenta a leitura direta legada; se ela trouxer uma linha
 * real, usa; senão, `null` (fail-closed).
 */
export type TargetRoleResolution = UserRole | null

function asUserRole(value: unknown): UserRole | null {
  if (value === "admin" || value === "moderator" || value === "user") return value
  return null
}

export async function resolveTargetRoleForAuthorization(
  supabase: SupabaseClient,
  targetUserId: string,
): Promise<TargetRoleResolution> {
  if (!targetUserId) return null

  try {
    const { data, error } = await supabase.rpc("get_user_role", {
      target_user_id: targetUserId,
    })
    if (!error) {
      const role = asUserRole(data)
      // `null` (função endurecida pós-G-04) = alvo inexistente ou papel
      // desconhecido → fail-closed. Valor válido (incluindo "user" para
      // usuário real) → decisão pela matriz.
      return role
    }
  } catch {
    // RPC ausente/falha de transporte → tenta o caminho legado abaixo.
  }

  // Legado (somente compatibilidade): leitura direta. Só vale se trouxer
  // UMA LINHA REAL — ausência de linha para outro usuário NÃO é "user",
  // é "desconhecido" (a RLS pode estar ocultando um admin).
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId)
      .maybeSingle()
    if (error || !data?.role) return null
    return asUserRole(data.role)
  } catch {
    return null
  }
}

export interface AccessDecision {
  allowed: boolean
  reason: string
}

/**
 * G1.1 (G-01) — decisão única para INICIAR suporte/impersonação.
 * Matriz (contrato preservado): user→ninguém; moderator→user;
 * moderator→moderator/admin negados; admin→user/moderator; admin→admin negado.
 * `targetRole === null` (falha de resolução) → NEGADO (fail-closed).
 */
export function decideSupportAccess(
  operatorRole: UserRole,
  targetRole: TargetRoleResolution,
): AccessDecision {
  if (targetRole === null) {
    return {
      allowed: false,
      reason: "Não foi possível verificar o papel do usuário alvo. Acesso negado por segurança.",
    }
  }
  if (canOperatorAccessTarget(operatorRole, targetRole)) {
    return { allowed: true, reason: "ok" }
  }
  if (operatorRole === "user") {
    return { allowed: false, reason: "Operação não permitida para este perfil." }
  }
  return {
    allowed: false,
    reason: "Operação não permitida: moderadores não podem acessar contas de administradores.",
  }
}

/**
 * G1.1 (G-03) — decisão única para LEITURAS administrativas
 * (`searchUsers`, `getUserDetails`). Regra: moderator lê user/moderator,
 * NUNCA admin; admin lê todos. `null` → negado (fail-closed).
 * (Suporte continua mais restrito: moderator→moderator é negado lá.)
 */
export function decideAdminReadAccess(
  operatorRole: UserRole,
  targetRole: TargetRoleResolution,
): AccessDecision {
  if (targetRole === null) {
    return {
      allowed: false,
      reason: "Não foi possível verificar o papel do usuário alvo. Acesso negado por segurança.",
    }
  }
  if (operatorRole === "admin") return { allowed: true, reason: "ok" }
  if (operatorRole === "moderator") {
    if (targetRole === "admin") {
      return {
        allowed: false,
        reason: "Operação não permitida: moderadores não podem acessar contas de administradores.",
      }
    }
    return { allowed: true, reason: "ok" }
  }
  return { allowed: false, reason: "Acesso negado: operação restrita à equipe de moderação e administração." }
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
